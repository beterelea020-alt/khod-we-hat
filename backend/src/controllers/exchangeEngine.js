import { query, tx } from '../config/db.js';
import { notify } from '../services/notify.js';
import { ensureOpenChat } from '../services/connections.js';
import { getSetting } from '../services/settings.js';
import { httpError } from '../middleware/errors.js';

const TYPES = new Set(['skill', 'service', 'product', 'time', 'knowledge', 'other']);
const MODES = new Set(['offer', 'need']);
const DELIVERY = new Set(['online', 'in_person', 'both']);

const typeSetting = {
  skill: 'skills_exchange_enabled',
  service: 'services_exchange_enabled',
  product: 'products_exchange_enabled',
  time: 'time_exchange_enabled',
  knowledge: 'knowledge_exchange_enabled',
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const tokenSet = text => new Set(clean(text, 1000).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3));

function cardSelect() {
  return `
    SELECT l.id,l.owner_id,l.mode,l.asset_type,l.title,l.description,l.category_id,l.skill_id,l.city,l.delivery_mode,l.condition_note,l.estimated_value,l.status,l.featured,l.created_at,l.updated_at,
      u.name owner_name,u.username owner_username,u.headline owner_headline,u.avatar_url owner_avatar,u.is_verified owner_verified,u.city owner_city,
      c.name category_name,s.name skill_name,
      COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.reviewee_id=u.id AND r.status='active'),0)::numeric(3,2) owner_rating,
      (SELECT COUNT(*) FROM exchanges e WHERE (e.sender_id=u.id OR e.receiver_id=u.id) AND e.status='completed')::int owner_completed_exchanges
    FROM exchange_listings l
    JOIN users u ON u.id=l.owner_id
    LEFT JOIN categories c ON c.id=l.category_id
    LEFT JOIN skills s ON s.id=l.skill_id`;
}

function validateListing(body) {
  const mode = clean(body.mode, 8);
  const asset_type = clean(body.asset_type, 16);
  const delivery_mode = clean(body.delivery_mode || 'both', 14);
  if (!MODES.has(mode)) throw httpError(400, 'نوع العرض غير صالح', 'INVALID_MODE');
  if (!TYPES.has(asset_type)) throw httpError(400, 'نوع التبادل غير صالح', 'INVALID_ASSET_TYPE');
  if (!DELIVERY.has(delivery_mode)) throw httpError(400, 'طريقة التنفيذ غير صالحة', 'INVALID_DELIVERY');
  const title = clean(body.title, 180);
  if (title.length < 3) throw httpError(400, 'اكتب عنوانًا واضحًا للعرض أو الطلب', 'VALIDATION_ERROR');
  const description = clean(body.description, 4000);
  const value = body.estimated_value === null || body.estimated_value === undefined || body.estimated_value === '' ? null : Number(body.estimated_value);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1e9)) throw httpError(400, 'القيمة التقديرية غير صالحة', 'VALIDATION_ERROR');
  return {
    mode, asset_type, title, description,
    category_id: body.category_id || null,
    skill_id: body.skill_id || null,
    city: clean(body.city, 100), delivery_mode,
    condition_note: clean(body.condition_note, 500), estimated_value: value,
    status: ['draft','published','paused','closed'].includes(body.status) ? body.status : 'published',
  };
}

async function ensureFeature(assetType) {
  if (!(await getSetting('exchange_engine_enabled'))) throw httpError(403, 'محرك التبادل متوقف حاليًا', 'FEATURE_DISABLED');
  if (assetType === 'other') return;
  const key = typeSetting[assetType];
  if (key && !(await getSetting(key))) throw httpError(403, 'هذا النوع من التبادل متوقف حاليًا', 'FEATURE_DISABLED');
}

export async function listListings(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 120);
    const mode = MODES.has(req.query.mode) ? req.query.mode : '';
    const asset = TYPES.has(req.query.asset_type) ? req.query.asset_type : '';
    const delivery = DELIVERY.has(req.query.delivery_mode) ? req.query.delivery_mode : '';
    const category = req.query.category || '';
    const city = String(req.query.city || '').trim().slice(0, 100);
    const limit = clamp(Number(req.query.limit) || 40, 1, 80);
    const params = []; const where = ["l.status='published'", "u.status='active'", "u.role='USER'"];
    const p = v => { params.push(v); return `$${params.length}`; };
    if (req.user) where.push(`l.owner_id<>${p(req.user.id)}`);
    if (q) { const x = `%${q.replace(/[\\%_]/g, '\\$&')}%`; const ph = p(x); where.push(`(l.title ILIKE ${ph} OR l.description ILIKE ${ph} OR l.city ILIKE ${ph} OR c.name ILIKE ${ph} OR s.name ILIKE ${ph})`); }
    if (mode) where.push(`l.mode=${p(mode)}`);
    if (asset) where.push(`l.asset_type=${p(asset)}`);
    if (delivery) where.push(`l.delivery_mode IN (${p(delivery)},'both')`);
    if (category) where.push(`l.category_id=${p(category)}`);
    if (city) where.push(`l.city ILIKE ${p(`%${city.replace(/[\\%_]/g, '\\$&')}%`)}`);
    const r = await query(`${cardSelect()} WHERE ${where.join(' AND ')} ORDER BY l.featured DESC,l.created_at DESC LIMIT ${limit}`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function getListing(req, res, next) {
  try {
    const r = await query(`${cardSelect()} WHERE l.id=$1 AND l.status='published' AND u.status='active'`, [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'العرض غير موجود', 'LISTING_NOT_FOUND');
    const listing = r.rows[0];
    const canSeeProposals = req.user && String(req.user.id) === String(listing.owner_id);
    const [recent, myProposal] = await Promise.all([
      canSeeProposals ? query(`SELECT p.id,p.status,p.note,p.created_at,p.updated_at,p.proposer_id,u.name proposer_name,u.avatar_url proposer_avatar,ol.title offered_title,ol.asset_type offered_asset_type
             FROM exchange_proposals p JOIN users u ON u.id=p.proposer_id LEFT JOIN exchange_listings ol ON ol.id=p.offered_listing_id
             WHERE p.listing_id=$1 ORDER BY p.created_at DESC LIMIT 8`, [listing.id]) : Promise.resolve({ rows: [] }),
      req.user ? query('SELECT id,status,note,offered_listing_id FROM exchange_proposals WHERE listing_id=$1 AND proposer_id=$2', [listing.id, req.user.id]) : Promise.resolve({ rows: [] }),
    ]);
    res.json({ success: true, data: { ...listing, recent_proposals: recent.rows, my_proposal: myProposal.rows[0] || null } });
  } catch (e) { next(e); }
}

export async function createListing(req, res, next) {
  try {
    const b = validateListing(req.body || {});
    await ensureFeature(b.asset_type);
    const r = await query(`INSERT INTO exchange_listings(owner_id,mode,asset_type,title,description,category_id,skill_id,city,delivery_mode,condition_note,estimated_value,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [req.user.id,b.mode,b.asset_type,b.title,b.description,b.category_id,b.skill_id,b.city,b.delivery_mode,b.condition_note,b.estimated_value,b.status]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

export async function updateListing(req, res, next) {
  try {
    const current = await query('SELECT * FROM exchange_listings WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!current.rowCount) throw httpError(404, 'العرض غير موجود', 'LISTING_NOT_FOUND');
    const merged = { ...current.rows[0], ...(req.body || {}) };
    const b = validateListing(merged); await ensureFeature(b.asset_type);
    const r = await query(`UPDATE exchange_listings SET mode=$1,asset_type=$2,title=$3,description=$4,category_id=$5,skill_id=$6,city=$7,delivery_mode=$8,condition_note=$9,estimated_value=$10,status=$11,updated_at=now() WHERE id=$12 RETURNING *`,
      [b.mode,b.asset_type,b.title,b.description,b.category_id,b.skill_id,b.city,b.delivery_mode,b.condition_note,b.estimated_value,b.status,req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

export async function myListings(req, res, next) {
  try { const r = await query(`${cardSelect()} WHERE l.owner_id=$1 ORDER BY l.created_at DESC`, [req.user.id]); res.json({ success: true, data: r.rows }); } catch (e) { next(e); }
}

export async function matches(req, res, next) {
  try {
    const mine = await query(`SELECT id,mode,asset_type,title,description,category_id,skill_id,city,delivery_mode FROM exchange_listings WHERE owner_id=$1 AND status='published'`, [req.user.id]);
    if (!mine.rowCount) return res.json({ success: true, data: [] });
    const r = await query(`${cardSelect()} WHERE l.owner_id<>$1 AND l.status='published' AND u.status='active' ORDER BY l.featured DESC,l.created_at DESC LIMIT 120`, [req.user.id]);
    const myTokens = mine.rows.map(x => ({ ...x, tokens: tokenSet(`${x.title} ${x.description}`) }));
    const scored = r.rows.map(item => {
      let best = { score: 0, source: null, reasons: [] };
      const it = tokenSet(`${item.title} ${item.description}`);
      for (const m of myTokens) {
        if (m.mode === item.mode) continue;
        let score = 0; const reasons = [];
        if (m.asset_type === item.asset_type) { score += 35; reasons.push('نفس نوع التبادل'); }
        if (m.category_id && item.category_id && String(m.category_id) === String(item.category_id)) { score += 22; reasons.push('نفس التصنيف'); }
        if (m.city && item.city && m.city.trim().toLowerCase() === item.city.trim().toLowerCase()) { score += 10; reasons.push('في نفس المدينة'); }
        let overlap = 0; for (const t of m.tokens) if (it.has(t)) overlap++;
        const union = new Set([...m.tokens, ...it]).size || 1;
        score += Math.min(28, Math.round((overlap / union) * 100));
        if (overlap) reasons.push('تشابه واضح في الاحتياج/العرض');
        if (item.owner_verified) { score += 3; reasons.push('حساب موثّق'); }
        if (score > best.score) best = { score: Math.min(99, score), source: m, reasons };
      }
      return { ...item, match_score: best.score, match_source: best.source?.title || '', match_reasons: best.reasons };
    }).filter(x => x.match_score >= 25).sort((a,b) => b.match_score - a.match_score || Number(b.owner_verified)-Number(a.owner_verified)).slice(0, 16);
    res.json({ success: true, data: scored });
  } catch (e) { next(e); }
}

export async function listMyProposals(req, res, next) {
  try {
    const r = await query(`SELECT p.*,l.title listing_title,l.mode listing_mode,l.asset_type listing_asset_type,l.owner_id listing_owner_id,u.name listing_owner_name,u.avatar_url listing_owner_avatar,ol.title offered_title,ol.asset_type offered_asset_type
      FROM exchange_proposals p JOIN exchange_listings l ON l.id=p.listing_id JOIN users u ON u.id=l.owner_id LEFT JOIN exchange_listings ol ON ol.id=p.offered_listing_id
      WHERE p.proposer_id=$1 OR l.owner_id=$1 ORDER BY p.updated_at DESC LIMIT 120`, [req.user.id]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function createProposal(req, res, next) {
  try {
    const me = req.user.id; const listingId = req.params.id; const offeredId = req.body?.offered_listing_id || null;
    const listing = await query(`SELECT l.*,u.name owner_name FROM exchange_listings l JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND l.status='published'`, [listingId]);
    if (!listing.rowCount) throw httpError(404, 'العرض غير متاح', 'LISTING_NOT_FOUND');
    const target = listing.rows[0];
    if (target.owner_id === me) throw httpError(400, 'لا يمكنك التقدم على عرضك أنت', 'SELF_PROPOSAL');
    let offered = null;
    if (offeredId) {
      const o = await query('SELECT * FROM exchange_listings WHERE id=$1 AND owner_id=$2 AND status=\'published\'', [offeredId, me]);
      if (!o.rowCount) throw httpError(400, 'العرض الذي اخترته غير متاح', 'INVALID_OFFERED_LISTING');
      offered = o.rows[0];
      await ensureFeature(offered.asset_type);
    }
    const note = clean(req.body?.note, 2000);
    const out = await tx(async c => {
      const dup = await c.query('SELECT id,status FROM exchange_proposals WHERE listing_id=$1 AND proposer_id=$2', [listingId, me]);
      if (dup.rowCount && ['pending','accepted'].includes(dup.rows[0].status)) throw httpError(409, 'أرسلت عرضًا بالفعل على هذا الطلب', 'PROPOSAL_EXISTS');
      const p = dup.rowCount
        ? await c.query(`UPDATE exchange_proposals SET offered_listing_id=$1,note=$2,status='pending',updated_at=now() WHERE id=$3 RETURNING *`, [offeredId,note,dup.rows[0].id])
        : await c.query(`INSERT INTO exchange_proposals(listing_id,proposer_id,offered_listing_id,note) VALUES($1,$2,$3,$4) RETURNING *`, [listingId,me,offeredId,note]);
      await c.query(`INSERT INTO exchange_proposal_events(proposal_id,actor_id,event_type,note) VALUES($1,$2,'created',$3)`, [p.rows[0].id,me,note || 'عرض جديد']);
      await notify(target.owner_id, 'exchange_proposal', 'وصل عرض تبادل جديد', `${req.user.name} قدّم عرضًا على: ${target.title}`, p.rows[0].id, 'proposal', c);
      return p.rows[0];
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) { next(e); }
}

export async function updateProposal(req, res, next) {
  try {
    const me = req.user.id; const action = clean(req.body?.status, 14);
    if (!['accepted','rejected','cancelled','completed','disputed'].includes(action)) throw httpError(400, 'حالة غير صالحة', 'INVALID_STATUS');
    const out = await tx(async c => {
      const r = await c.query(`SELECT p.*,l.title listing_title,l.owner_id listing_owner_id,l.mode listing_mode,u.name proposer_name FROM exchange_proposals p JOIN exchange_listings l ON l.id=p.listing_id JOIN users u ON u.id=p.proposer_id WHERE p.id=$1 FOR UPDATE`, [req.params.id]);
      if (!r.rowCount) throw httpError(404, 'العرض غير موجود', 'PROPOSAL_NOT_FOUND');
      const p = r.rows[0];
      if (![p.proposer_id,p.listing_owner_id].includes(me)) throw httpError(403, 'غير مسموح', 'FORBIDDEN');
      if (action === 'accepted' && p.listing_owner_id !== me) throw httpError(403, 'صاحب العرض فقط يستطيع قبول التبادل', 'FORBIDDEN');
      if (action === 'rejected' && (p.listing_owner_id !== me || p.status !== 'pending')) throw httpError(409, 'لا يمكن رفض هذا العرض الآن', 'INVALID_TRANSITION');
      if (action === 'cancelled' && (p.proposer_id !== me || p.status !== 'pending')) throw httpError(409, 'لا يمكن إلغاء هذا العرض الآن', 'INVALID_TRANSITION');
      if (action === 'accepted' && p.status !== 'pending') throw httpError(409, 'العرض لم يعد متاحًا للقبول', 'INVALID_TRANSITION');
      if (action === 'completed' && p.status !== 'accepted') throw httpError(409, 'لا يمكن تسجيل الإتمام قبل قبول العرض', 'INVALID_TRANSITION');
      if (action === 'disputed' && !['accepted'].includes(p.status)) throw httpError(409, 'لا يمكن فتح نزاع في هذه الحالة', 'INVALID_TRANSITION');
      const acceptedAt = action === 'accepted' ? 'now()' : 'accepted_at';
      const completedAt = action === 'completed' ? 'now()' : 'completed_at';
      const up = await c.query(`UPDATE exchange_proposals SET status=$1,updated_at=now(),accepted_at=${acceptedAt},completed_at=${completedAt} WHERE id=$2 RETURNING *`, [action, p.id]);
      await c.query(`INSERT INTO exchange_proposal_events(proposal_id,actor_id,event_type,note) VALUES($1,$2,$3,$4)`, [p.id,me,action,`تم تغيير الحالة إلى ${action}`]);
      if (action === 'accepted') {
        await ensureOpenChat(c, p.proposer_id, p.listing_owner_id, `تم فتح التواصل تلقائيًا بعد قبول عرض التبادل #${p.id}`);
      }
      const other = me === p.proposer_id ? p.listing_owner_id : p.proposer_id;
      const title = action === 'accepted' ? 'تم قبول عرض التبادل' : action === 'completed' ? 'تم إكمال التبادل' : action === 'disputed' ? 'تم فتح نزاع' : 'تحديث على عرض التبادل';
      await notify(other, 'proposal_update', title, `العرض المرتبط بـ "${p.listing_title}" أصبح: ${action}.`, p.id, 'proposal', c);
      return up.rows[0];
    });
    res.json({ success: true, data: out });
  } catch (e) { next(e); }
}

export async function adminListings(req, res, next) {
  try {
    const status = String(req.query.status || '').trim(); const params=[]; let where='1=1';
    if (status) { params.push(status); where=`l.status=$1`; }
    const r = await query(`SELECT l.*,u.name owner_name,u.username owner_username,u.is_verified owner_verified,c.name category_name,s.name skill_name,
      (SELECT count(*) FROM exchange_proposals p WHERE p.listing_id=l.id)::int proposals_count
      FROM exchange_listings l JOIN users u ON u.id=l.owner_id LEFT JOIN categories c ON c.id=l.category_id LEFT JOIN skills s ON s.id=l.skill_id
      WHERE ${where} ORDER BY l.featured DESC,l.created_at DESC LIMIT 500`, params);
    res.json({ success: true, data: r.rows });
  } catch(e){ next(e); }
}

export async function adminPatchListing(req, res, next) {
  try {
    const current = await query('SELECT * FROM exchange_listings WHERE id=$1', [req.params.id]);
    if (!current.rowCount) throw httpError(404,'العرض غير موجود','LISTING_NOT_FOUND');
    const old = current.rows[0];
    const body = req.body || {};
    const nextType = body.asset_type || old.asset_type;
    const nextStatus = body.status || old.status;
    if (!['draft','published','paused','closed','removed'].includes(nextStatus)) throw httpError(400,'حالة غير صالحة','INVALID_STATUS');
    const mode = body.mode || old.mode;
    const asset_type = nextType;
    if (!MODES.has(mode) || !TYPES.has(asset_type)) throw httpError(400,'بيانات العرض غير صالحة','VALIDATION_ERROR');
    const title = body.title === undefined ? old.title : clean(body.title,180);
    if (title.length < 3) throw httpError(400,'اكتب عنوانًا واضحًا للعرض أو الطلب','VALIDATION_ERROR');
    const description = body.description === undefined ? old.description : clean(body.description,4000);
    const category_id = body.category_id === undefined ? old.category_id : (body.category_id || null);
    const skill_id = body.skill_id === undefined ? old.skill_id : (body.skill_id || null);
    const city = body.city === undefined ? old.city : clean(body.city,100);
    const delivery_mode = body.delivery_mode || old.delivery_mode;
    if (!DELIVERY.has(delivery_mode)) throw httpError(400,'طريقة التنفيذ غير صالحة','INVALID_DELIVERY');
    const condition_note = body.condition_note === undefined ? old.condition_note : clean(body.condition_note,500);
    const estimated_value = body.estimated_value === undefined ? old.estimated_value : (body.estimated_value === null || body.estimated_value === '' ? null : Number(body.estimated_value));
    if (estimated_value !== null && (!Number.isFinite(Number(estimated_value)) || Number(estimated_value) < 0 || Number(estimated_value) > 1e9)) throw httpError(400,'القيمة التقديرية غير صالحة','VALIDATION_ERROR');
    const featured = typeof body.featured === 'boolean' ? body.featured : old.featured;
    const r = await query(`UPDATE exchange_listings SET mode=$1,asset_type=$2,title=$3,description=$4,category_id=$5,skill_id=$6,city=$7,delivery_mode=$8,condition_note=$9,estimated_value=$10,status=$11,featured=$12,updated_at=now() WHERE id=$13 RETURNING *`,
      [mode,asset_type,title,description,category_id,skill_id,city,delivery_mode,condition_note,estimated_value,nextStatus,featured,req.params.id]);
    await query('INSERT INTO admin_logs(admin_id,target_user_id,action,note) VALUES($1,$2,$3,$4)', [req.user.id, old.owner_id, 'listing_moderation', `Listing ${old.id} updated by admin`]);
    if (String(old.status) !== String(nextStatus) || old.featured !== featured) {
      await notify(old.owner_id, 'listing_moderation', 'تحديث على عرضك', `تم تحديث منشورك من الإدارة. الحالة: ${nextStatus}${featured ? ' · مميز' : ''}.`, old.id, 'listing');
    }
    res.json({success:true,data:r.rows[0]});
  } catch(e){ next(e); }
}

export async function adminUpdateListing(req, res, next) {
  try {
    const status = clean(req.body?.status,14);
    if (!['draft','published','paused','closed','removed'].includes(status)) throw httpError(400,'حالة غير صالحة','INVALID_STATUS');
    const r = await query('UPDATE exchange_listings SET status=$1,featured=COALESCE($2,featured),updated_at=now() WHERE id=$3 RETURNING *', [status, typeof req.body?.featured === 'boolean' ? req.body.featured : null, req.params.id]);
    if(!r.rowCount) throw httpError(404,'العرض غير موجود','LISTING_NOT_FOUND');
    await query('INSERT INTO admin_logs(admin_id,target_user_id,action,note) VALUES($1,$2,$3,$4)', [req.user.id, r.rows[0].owner_id, 'listing_moderation', `Listing ${r.rows[0].id} → ${status}`]);
    await notify(r.rows[0].owner_id, 'listing_moderation', 'تحديث على عرضك', `تغيّرت حالة العرض إلى: ${status}.`, r.rows[0].id, 'listing');
    res.json({success:true,data:r.rows[0]});
  } catch(e){ next(e); }
}
