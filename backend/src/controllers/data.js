import { query, tx } from '../config/db.js';
import { notify } from '../services/notify.js';
import { ensureOpenChat } from '../services/connections.js';
import { getSetting } from '../services/settings.js';
import { USER_COLUMNS, isAdminRole, permissionsFor } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';

const likeEscape = s => String(s).replace(/[\\%_]/g, '\\$&');
const skillAgg = type => `COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'level',us.level,'years',COALESCE(us.experience_years,0)) ORDER BY s.name)
  FROM user_skills us JOIN skills s ON s.id=us.skill_id AND NOT s.is_hidden WHERE us.user_id=u.id AND us.type='${type}'),'[]'::jsonb)`;

// Public card shape — never includes email or phone.
const cardSelect = (extra = '') => `
  SELECT u.id,u.name,u.username,u.headline,u.bio,u.avatar_url,u.country,u.city,u.location,u.language,u.is_verified,u.availability,u.preferred_exchange_type,u.created_at,
    COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.reviewee_id=u.id AND r.status='active'),0)::numeric(3,2) rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id=u.id AND r.status='active')::int review_count,
    (SELECT COUNT(*) FROM exchanges e WHERE (e.sender_id=u.id OR e.receiver_id=u.id) AND e.status='completed')::int exchanges,
    ${skillAgg('offer')} offers, ${skillAgg('need')} needs ${extra}
  FROM users u`;

export async function users(req, res, next) {
  try {
    const q = req.query;
    const params = [];
    const p = v => { params.push(v); return `$${params.length}`; };
    const where = [`u.status='active'`, `u.role='USER'`];
    if (req.user) where.push(`u.id<>${p(req.user.id)}`);
    const search = String(q.search || '').trim().slice(0, 80);
    if (search) {
      const s = p(`%${likeEscape(search)}%`);
      where.push(`(u.name ILIKE ${s} OR u.headline ILIKE ${s} OR u.location ILIKE ${s} OR u.bio ILIKE ${s}
        OR EXISTS(SELECT 1 FROM user_skills us JOIN skills sk ON sk.id=us.skill_id WHERE us.user_id=u.id AND us.type='offer' AND sk.name ILIKE ${s}))`);
    }
    if (q.skill) where.push(`EXISTS(SELECT 1 FROM user_skills us WHERE us.user_id=u.id AND us.type='offer' AND us.skill_id=${p(q.skill)})`);
    if (q.category) where.push(`EXISTS(SELECT 1 FROM user_skills us JOIN skills sk ON sk.id=us.skill_id WHERE us.user_id=u.id AND us.type='offer' AND sk.category_id=${p(q.category)})`);
    if (q.verified === '1') where.push('u.is_verified');
    const minRating = Math.max(0, Math.min(5, Number(q.min_rating) || 0));
    const order = { newest: 't.created_at DESC', exchanges: 't.exchanges DESC, t.rating DESC', rating: '(t.review_count>0) DESC, t.rating DESC, t.exchanges DESC' }[q.sort] || '(t.review_count>0) DESC, t.rating DESC, t.exchanges DESC';
    const limit = Math.min(60, Math.max(1, Number(q.limit) || 40));
    const offset = Math.max(0, Number(q.offset) || 0);
    const sql = `SELECT * FROM (${cardSelect()} WHERE ${where.join(' AND ')}) t ${minRating ? `WHERE t.rating>=${p(minRating)}` : ''} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;
    const r = await query(sql, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

/** People who offer what I need and/or need what I offer. */
export async function matches(req, res, next) {
  try {
    const r = await query(`SELECT * FROM (${cardSelect(`,
        (SELECT COALESCE(jsonb_agg(DISTINCT sk.name),'[]'::jsonb) FROM user_skills m JOIN user_skills t ON t.skill_id=m.skill_id AND t.user_id=u.id AND t.type='offer' JOIN skills sk ON sk.id=m.skill_id WHERE m.user_id=$1 AND m.type='need') they_teach,
        (SELECT COALESCE(jsonb_agg(DISTINCT sk.name),'[]'::jsonb) FROM user_skills m JOIN user_skills t ON t.skill_id=m.skill_id AND t.user_id=u.id AND t.type='need' JOIN skills sk ON sk.id=m.skill_id WHERE m.user_id=$1 AND m.type='offer') they_want`)}
      WHERE u.status='active' AND u.role='USER' AND u.id<>$1) t
      WHERE jsonb_array_length(t.they_teach)>0
      ORDER BY (jsonb_array_length(t.they_teach)>0 AND jsonb_array_length(t.they_want)>0) DESC, t.is_verified DESC, t.rating DESC LIMIT 12`, [req.user.id]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function userById(req, res, next) {
  try {
    const id = req.params.id;
    const r = await query(`${cardSelect(', u.phone')} WHERE u.id=$1 AND u.status='active'`, [id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
    const profile = r.rows[0];

    let connection = null;
    if (req.user && req.user.id !== id) {
      const c = await query('SELECT id,status,requester_id,message FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, id]);
      if (c.rowCount) {
        const x = c.rows[0];
        connection = { id: x.id, status: x.status, direction: x.requester_id === req.user.id ? 'outgoing' : 'incoming', message: x.message };
      }
    }
    // Phone is private: owner, accepted connections and staff only.
    const canSeePhone = req.user && (req.user.id === id || connection?.status === 'accepted' || isAdminRole(req.user.role));
    if (!canSeePhone) delete profile.phone;

    const [skills, reviews, summary] = await Promise.all([
      query(`SELECT us.id,us.type,us.level,us.experience_years,us.description,s.id skill_id,s.name,COALESCE(c.name,'Other') category
             FROM user_skills us JOIN skills s ON s.id=us.skill_id AND NOT s.is_hidden LEFT JOIN categories c ON c.id=s.category_id WHERE us.user_id=$1 ORDER BY us.type,s.name`, [id]),
      query(`SELECT r.id,r.rating,r.communication_rating,r.knowledge_rating,r.commitment_rating,r.comment,r.created_at,
               u.id reviewer_id,u.name reviewer_name,u.avatar_url reviewer_avatar,so.name offered_skill,sr.name requested_skill
             FROM reviews r JOIN users u ON u.id=r.reviewer_id JOIN exchanges e ON e.id=r.exchange_id
             JOIN skills so ON so.id=e.offered_skill_id JOIN skills sr ON sr.id=e.requested_skill_id
             WHERE r.reviewee_id=$1 AND r.status='active' ORDER BY r.created_at DESC LIMIT 30`, [id]),
      query(`SELECT COUNT(*)::int total,COALESCE(AVG(rating),0)::numeric(3,2) avg,
               COALESCE(AVG(communication_rating),0)::numeric(3,2) communication,COALESCE(AVG(knowledge_rating),0)::numeric(3,2) knowledge,COALESCE(AVG(commitment_rating),0)::numeric(3,2) commitment,
               COUNT(*) FILTER(WHERE rating=5)::int s5,COUNT(*) FILTER(WHERE rating=4)::int s4,COUNT(*) FILTER(WHERE rating=3)::int s3,COUNT(*) FILTER(WHERE rating=2)::int s2,COUNT(*) FILTER(WHERE rating=1)::int s1
             FROM reviews WHERE reviewee_id=$1 AND status='active'`, [id]),
    ]);
    res.json({ success: true, data: { ...profile, connection, skills: skills.rows, reviews: reviews.rows, rating_summary: summary.rows[0] } });
  } catch (e) { next(e); }
}

export async function skills(_req, res, next) {
  try {
    const r = await query(`SELECT s.id,s.name,s.category_id,c.name category,
      COUNT(DISTINCT us.user_id) FILTER(WHERE us.type='offer')::int users,
      COUNT(DISTINCT us.user_id) FILTER(WHERE us.type='need')::int requests
      FROM skills s LEFT JOIN categories c ON c.id=s.category_id LEFT JOIN user_skills us ON us.skill_id=s.id
      WHERE NOT s.is_hidden GROUP BY s.id,c.name ORDER BY s.name`);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}
export async function categories(_req, res, next) {
  try { res.json({ success: true, data: (await query('SELECT id,name,icon FROM categories ORDER BY name')).rows }); } catch (e) { next(e); }
}

/** Public landing-page numbers (social proof on the login page). */
export async function stats(_req, res, next) {
  try {
    const r = await query(`SELECT (SELECT count(*) FROM users WHERE status='active')::int members,
      (SELECT count(*) FROM skills WHERE NOT is_hidden)::int skills,
      (SELECT count(*) FROM exchanges WHERE status='completed')::int exchanges,
      COALESCE((SELECT avg(rating) FROM reviews WHERE status='active'),0)::numeric(3,2) rating`);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

// ───────── My profile ─────────
const PROFILE_FIELDS = ['name', 'username', 'headline', 'bio', 'phone', 'country', 'city', 'language', 'availability', 'preferred_exchange_type'];
export async function updateProfile(req, res, next) {
  try {
    const sets = []; const vals = [];
    for (const f of PROFILE_FIELDS) if (f in req.body) { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
    if ('country' in req.body || 'city' in req.body) {
      const country = req.body.country ?? req.user.country; const city = req.body.city ?? req.user.city;
      vals.push([city, country].filter(Boolean).join('، ')); sets.push(`location=$${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nothing to update', code: 'EMPTY_UPDATE' });
    vals.push(req.user.id);
    const r = await query(`UPDATE users SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length} RETURNING ${USER_COLUMNS}`, vals);
    res.json({ success: true, data: { ...r.rows[0], permissions: permissionsFor(r.rows[0].role) } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Username is already taken', code: 'USERNAME_TAKEN' });
    next(e);
  }
}

export async function addUserSkill(req, res, next) {
  try {
    const b = req.body;
    const r = await query(`INSERT INTO user_skills(user_id,skill_id,type,level,experience_years,description,priority) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, b.skill_id, b.type, b.level, b.experience_years, b.description, b.priority]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Skill already on your profile', code: 'SKILL_EXISTS' });
    if (e.code === '23503') return res.status(400).json({ success: false, message: 'Unknown skill', code: 'SKILL_NOT_FOUND' });
    next(e);
  }
}
export async function deleteUserSkill(req, res, next) {
  try {
    const r = await query('DELETE FROM user_skills WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Skill not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function mySkills(req, res, next) {
  try {
    const r = await query(`SELECT us.id,us.type,us.level,us.experience_years,us.description,s.id skill_id,s.name,COALESCE(c.name,'Other') category
      FROM user_skills us JOIN skills s ON s.id=us.skill_id LEFT JOIN categories c ON c.id=s.category_id WHERE us.user_id=$1 ORDER BY us.type,s.name`, [req.user.id]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

// ───────── Exchanges ─────────
const EXCHANGE_SELECT = `SELECT e.*,so.name offered_skill,sr.name requested_skill,
    u1.name sender_name,u1.avatar_url sender_avatar,u2.name receiver_name,u2.avatar_url receiver_avatar,
    EXISTS(SELECT 1 FROM reviews rv WHERE rv.exchange_id=e.id AND rv.reviewer_id=$1) reviewed_by_me
  FROM exchanges e JOIN skills so ON so.id=e.offered_skill_id JOIN skills sr ON sr.id=e.requested_skill_id
  JOIN users u1 ON u1.id=e.sender_id JOIN users u2 ON u2.id=e.receiver_id`;

export async function exchanges(req, res, next) {
  try {
    const r = await query(`${EXCHANGE_SELECT} WHERE e.sender_id=$1 OR e.receiver_id=$1 ORDER BY e.updated_at DESC, e.created_at DESC`, [req.user.id]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function exchangeById(req, res, next) {
  try {
    const r = await query(`${EXCHANGE_SELECT} WHERE e.id=$2 AND (e.sender_id=$1 OR e.receiver_id=$1)`, [req.user.id, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Exchange not found', code: 'EXCHANGE_NOT_FOUND' });
    const x = r.rows[0];
    const otherId = x.sender_id === req.user.id ? x.receiver_id : x.sender_id;
    const [events, sessions, conn] = await Promise.all([
      query(`SELECT ev.*,u.name actor_name FROM exchange_events ev LEFT JOIN users u ON u.id=ev.actor_id WHERE ev.exchange_id=$1 ORDER BY ev.created_at`, [x.id]),
      query(`SELECT * FROM sessions WHERE exchange_id=$1 ORDER BY scheduled_at`, [x.id]),
      query(`SELECT id,status FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`, [req.user.id, otherId]),
    ]);
    res.json({ success: true, data: { ...x, other_user_id: otherId, events: events.rows, sessions: sessions.rows, connection: conn.rows[0] || null } });
  } catch (e) { next(e); }
}

export async function createExchange(req, res, next) {
  try {
    const { receiver_id, offered_skill_id, requested_skill_id, deal_type, message } = req.body;
    if (deal_type === 'paid' && !(await getSetting('paid_deals_enabled'))) throw httpError(403, 'التبادل المدفوع متوقف حاليًا من إدارة المنصة', 'FEATURE_DISABLED');
    if (receiver_id === req.user.id) throw httpError(400, 'You cannot exchange with yourself', 'SELF_EXCHANGE');
    const dailyMax = Number(await getSetting('max_exchange_requests_day') || 20);
    const count = await query('SELECT count(*)::int total FROM exchanges WHERE sender_id=$1 AND created_at>=current_date', [req.user.id]);
    if (count.rows[0].total >= dailyMax) throw httpError(429, 'Daily exchange request limit reached', 'DAILY_LIMIT');
    const other = await query("SELECT id FROM users WHERE id=$1 AND status='active'", [receiver_id]);
    if (!other.rowCount) throw httpError(400, 'Receiver is not available', 'RECEIVER_UNAVAILABLE');
    // Integrity: you can only offer what's on your profile, and ask for what they actually offer.
    const own = await query(`SELECT 1 FROM user_skills WHERE user_id=$1 AND skill_id=$2 AND type='offer'`, [req.user.id, offered_skill_id]);
    if (!own.rowCount) throw httpError(400, 'أضف المهارة إلى ملفك كمهارة تقدّمها أولًا', 'OFFER_NOT_ON_PROFILE');
    const theirs = await query(`SELECT 1 FROM user_skills WHERE user_id=$1 AND skill_id=$2 AND type='offer'`, [receiver_id, requested_skill_id]);
    if (!theirs.rowCount) throw httpError(400, 'هذا الشخص لا يقدّم المهارة المطلوبة', 'REQUEST_NOT_OFFERED');
    const dup = await query(`SELECT 1 FROM exchanges WHERE sender_id=$1 AND receiver_id=$2 AND offered_skill_id=$3 AND requested_skill_id=$4 AND status IN ('pending','accepted','scheduled','in_progress')`, [req.user.id, receiver_id, offered_skill_id, requested_skill_id]);
    if (dup.rowCount) throw httpError(409, 'عندك طلب مفتوح لنفس التبادل', 'DUPLICATE_EXCHANGE');

    const created = await tx(async c => {
      const rq = await c.query(`INSERT INTO exchange_requests(sender_id,receiver_id,offered_skill_id,requested_skill_id,message,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id`, [req.user.id, receiver_id, offered_skill_id, requested_skill_id, message]);
      const ex = await c.query(`INSERT INTO exchanges(request_id,sender_id,receiver_id,offered_skill_id,requested_skill_id,deal_type,message) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [rq.rows[0].id, req.user.id, receiver_id, offered_skill_id, requested_skill_id, deal_type, message]);
      await c.query(`INSERT INTO exchange_participants(exchange_id,user_id,role) VALUES($1,$2,'sender'),($1,$3,'receiver') ON CONFLICT DO NOTHING`, [ex.rows[0].id, req.user.id, receiver_id]);
      await c.query(`INSERT INTO exchange_events(exchange_id,actor_id,event_type,note) VALUES($1,$2,'request_created',$3)`, [ex.rows[0].id, req.user.id, message || 'تم إرسال الطلب']);
      await notify(receiver_id, 'exchange_request', 'طلب تبادل جديد', `${req.user.name} أرسل لك طلب تبادل.`, ex.rows[0].id, 'exchange', c);
      return ex.rows[0];
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { next(e); }
}

const OPEN = ['accepted', 'scheduled', 'in_progress'];
export async function updateExchange(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!['accepted', 'scheduled', 'rejected', 'in_progress', 'completed', 'cancelled', 'disputed'].includes(status)) throw httpError(400, 'Invalid status', 'INVALID_STATUS');
    const out = await tx(async c => {
      const r = await c.query('SELECT * FROM exchanges WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!r.rowCount) throw httpError(404, 'Exchange not found', 'EXCHANGE_NOT_FOUND');
      const e = r.rows[0];
      const me = req.user.id;
      if (![e.sender_id, e.receiver_id].includes(me)) throw httpError(403, 'Not an exchange participant', 'FORBIDDEN');
      const other = e.sender_id === me ? e.receiver_id : e.sender_id;
      const bad = msg => httpError(409, msg, 'INVALID_TRANSITION');

      if (['accepted', 'rejected'].includes(status)) {
        if (me !== e.receiver_id) throw httpError(403, 'Only the receiver can respond to a request', 'FORBIDDEN');
        if (e.status !== 'pending') throw bad('الطلب لم يعد معلّقًا');
      }
      if (status === 'cancelled' && !['pending', ...OPEN].includes(e.status)) throw bad('لا يمكن إلغاء هذا التبادل');
      if (status === 'scheduled' && !['accepted', 'scheduled'].includes(e.status)) throw bad('يجب قبول التبادل قبل الجدولة');
      if (status === 'in_progress' && !['accepted', 'scheduled'].includes(e.status)) throw bad('يجب قبول التبادل أولًا');
      if (status === 'disputed' && ![...OPEN, 'completed'].includes(e.status)) throw bad('لا يمكن فتح نزاع الآن');

      let finalStatus = status; let note = `Exchange status changed to ${status}`; let pendingConfirmation = false;
      if (status === 'completed') {
        if (!['in_progress', 'scheduled'].includes(e.status)) throw bad('يجب أن يكون التبادل جاريًا أولًا');
        if (!e.completion_requested_by) {              // first party: ask the other to confirm
          await c.query('UPDATE exchanges SET completion_requested_by=$1,updated_at=now() WHERE id=$2', [me, e.id]);
          finalStatus = e.status; pendingConfirmation = true; note = 'طلب إنهاء التبادل — بانتظار تأكيد الطرف الآخر';
        } else if (e.completion_requested_by === me) {
          throw bad('أرسلت طلب الإنهاء بالفعل — بانتظار تأكيد الطرف الآخر');
        }                                               // second party confirms → completed
      }
      const stamp = { accepted: 'accepted_at', in_progress: 'started_at', completed: 'completed_at', cancelled: 'cancelled_at' }[finalStatus];
      const upd = await c.query(
        `UPDATE exchanges SET status=$1,updated_at=now()${stamp && !pendingConfirmation ? `,${stamp}=now()` : ''}${finalStatus === 'completed' ? ',completion_confirmed_by=$3' : ''} WHERE id=$2 RETURNING *`,
        finalStatus === 'completed' ? [finalStatus, e.id, me] : [finalStatus, e.id]
      );
      if (finalStatus === 'accepted') await ensureOpenChat(c, e.sender_id, e.receiver_id, 'تم فتح المحادثة تلقائيًا بعد قبول التبادل');
      const reqStatus = { accepted: 'accepted', rejected: 'rejected', cancelled: 'cancelled' }[finalStatus];
      if (reqStatus) await c.query('UPDATE exchange_requests SET status=$1,updated_at=now() WHERE id=$2', [reqStatus, e.request_id]);
      await c.query('INSERT INTO exchange_events(exchange_id,actor_id,event_type,note) VALUES($1,$2,$3,$4)', [e.id, me, pendingConfirmation ? 'completion_requested' : finalStatus, note]);
      const title = pendingConfirmation ? 'طلب إنهاء التبادل' : 'تم تحديث التبادل';
      const body = pendingConfirmation ? `${req.user.name} يطلب تأكيد إنهاء التبادل.` : `${req.user.name} غيّر حالة التبادل إلى: ${finalStatus}.`;
      await notify(other, 'exchange_update', title, body, e.id, 'exchange', c);
      return { ...upd.rows[0], completion_pending: pendingConfirmation };
    });
    res.json({ success: true, data: out });
  } catch (e) { next(e); }
}

// ───────── Reviews ─────────
export async function createReview(req, res, next) {
  try {
    const e = await query('SELECT * FROM exchanges WHERE id=$1', [req.params.exchangeId]);
    if (!e.rowCount) throw httpError(404, 'Exchange not found', 'EXCHANGE_NOT_FOUND');
    const x = e.rows[0];
    if (![x.sender_id, x.receiver_id].includes(req.user.id)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
    if (x.status !== 'completed') throw httpError(409, 'التقييم متاح بعد اكتمال التبادل فقط', 'REVIEW_NOT_ALLOWED');
    const reviewee = x.sender_id === req.user.id ? x.receiver_id : x.sender_id;
    const b = req.body;
    const r = await query(`INSERT INTO reviews(exchange_id,reviewer_id,reviewee_id,rating,communication_rating,knowledge_rating,commitment_rating,comment,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING *`, [x.id, req.user.id, reviewee, b.rating, b.communication_rating ?? null, b.knowledge_rating ?? null, b.commitment_rating ?? null, b.comment]);
    await notify(reviewee, 'review_received', 'تقييم جديد', `${req.user.name} قيّمك (${b.rating}/5).`, x.id, 'exchange');
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'قيّمت هذا التبادل من قبل', code: 'REVIEW_EXISTS' });
    next(e);
  }
}

// ───────── Reports ─────────
export async function createReport(req, res, next) {
  try {
    const b = req.body; const me = req.user.id;
    const today = await query(`SELECT count(*)::int n FROM reports WHERE reporter_id=$1 AND created_at>=current_date`, [me]);
    if (today.rows[0].n >= 10) throw httpError(429, 'وصلت للحد اليومي للبلاغات', 'REPORT_LIMIT');
    let reportedUser = b.reported_user_id || null; let exchangeId = b.exchange_id || null; const targetId = b.target_id || exchangeId || reportedUser;

    if (b.target_type === 'exchange') {
      const x = await query('SELECT sender_id,receiver_id FROM exchanges WHERE id=$1', [targetId]);
      if (!x.rowCount || ![x.rows[0].sender_id, x.rows[0].receiver_id].includes(me)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
      exchangeId = targetId; reportedUser = x.rows[0].sender_id === me ? x.rows[0].receiver_id : x.rows[0].sender_id;
    } else if (b.target_type === 'message') {
      const m = await query(`SELECT m.sender_id,c.requester_id,c.addressee_id FROM dm_messages m JOIN connections c ON c.id=m.connection_id WHERE m.id=$1`, [targetId]);
      if (!m.rowCount || ![m.rows[0].requester_id, m.rows[0].addressee_id].includes(me)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
      reportedUser = m.rows[0].sender_id;
    } else if (b.target_type === 'user') {
      reportedUser = targetId;
    }
    if (reportedUser === me) throw httpError(400, 'You cannot report yourself', 'SELF_REPORT');
    if (exchangeId && b.exchange_id) {
      const x = await query('SELECT 1 FROM exchanges WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)', [exchangeId, me]);
      if (!x.rowCount) throw httpError(403, 'Forbidden', 'FORBIDDEN');
    }
    const r = await query(`INSERT INTO reports(reporter_id,target_type,target_id,reported_user_id,exchange_id,reason,description,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at`,
      [me, b.target_type, targetId, reportedUser, exchangeId, b.reason, b.description, b.evidence]);
    await notify(me, 'report_created', 'تم استلام بلاغك', 'شكرًا لك، فريق الإدارة سيراجع البلاغ.', r.rows[0].id, 'report');
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

// ───────── Notifications ─────────
export async function notifications(req, res, next) {
  try {
    const [list, unread] = await Promise.all([
      query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60', [req.user.id]),
      query('SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND NOT is_read', [req.user.id]),
    ]);
    res.json({ success: true, data: list.rows, unread: unread.rows[0].n });
  } catch (e) { next(e); }
}
export async function markNotifications(req, res, next) {
  try { await query('UPDATE notifications SET is_read=true WHERE user_id=$1 AND NOT is_read', [req.user.id]); res.json({ success: true }); } catch (e) { next(e); }
}
export async function markNotification(req, res, next) {
  try { await query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ success: true }); } catch (e) { next(e); }
}
