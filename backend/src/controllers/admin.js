import { query } from '../config/db.js';
import { notify } from '../services/notify.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { assertSupabaseAdmin } from '../config/supabase.js';
import { can, canActOn } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { withAudioUrls } from '../services/voice.js';

const log = (adminId, action, note, { target = null, report = null } = {}) =>
  query('INSERT INTO admin_logs(admin_id,target_user_id,report_id,action,note) VALUES($1,$2,$3,$4,$5)', [adminId, target, report, action, String(note).slice(0, 1000)]);
const likeEscape = s => String(s).replace(/[\\%_]/g, '\\$&');
const nameOk = (v, max = 100) => { const s = String(v ?? '').trim(); if (s.length < 2 || s.length > max) throw httpError(400, 'الاسم غير صالح', 'VALIDATION_ERROR'); return s; };

// ───────── Analytics ─────────
export async function analytics(_req, res, next) {
  try {
    const [totals, growth, exch, topSkills] = await Promise.all([
      query(`SELECT
        (SELECT count(*) FROM users)::int total_users,
        (SELECT count(*) FROM users WHERE status='active')::int active_users,
        (SELECT count(*) FROM users WHERE status='suspended')::int suspended_users,
        (SELECT count(*) FROM users WHERE status='banned')::int banned_users,
        (SELECT count(*) FROM users WHERE status='closed')::int closed_users,
        (SELECT count(*) FROM users WHERE created_at>now()-interval '7 days')::int new_users_7d,
        (SELECT count(*) FROM exchanges)::int total_exchanges,
        (SELECT count(*) FROM exchanges WHERE status='completed')::int completed_exchanges,
        (SELECT count(*) FROM exchanges WHERE status='pending')::int pending_requests,
        (SELECT count(*) FROM exchanges WHERE status='disputed')::int disputed_exchanges,
        (SELECT count(*) FROM reports WHERE status IN ('open','investigating'))::int open_reports,
        (SELECT count(*) FROM reports WHERE status='open' AND target_type='exchange')::int open_exchange_reports,
        (SELECT count(*) FROM job_posts WHERE status='pending')::int pending_jobs,
        (SELECT count(*) FROM job_posts WHERE status='published')::int published_jobs,
        (SELECT count(*) FROM advertisements WHERE status='active')::int active_ads,
        (SELECT count(*) FROM ad_impressions)::int ad_impressions,
        (SELECT count(*) FROM ad_clicks)::int ad_clicks,
        (SELECT count(*) FROM connections WHERE status='accepted')::int connections,
        (SELECT count(*) FROM dm_messages WHERE sent_at>now()-interval '7 days')::int messages_7d,
        (SELECT count(*) FROM exchange_listings WHERE status='published')::int published_listings,
        (SELECT count(*) FROM exchange_listings WHERE status='published' AND mode='offer')::int live_offers,
        (SELECT count(*) FROM exchange_listings WHERE status='published' AND mode='need')::int live_needs,
        (SELECT count(*) FROM exchange_proposals WHERE status='pending')::int pending_proposals,
        (SELECT COALESCE(avg(rating),0)::numeric(3,2) FROM reviews WHERE status='active') average_rating`),
      query(`SELECT to_char(m,'YYYY-MM') AS month,
          (SELECT count(*) FROM users u WHERE date_trunc('month',u.created_at)=m)::int users,
          (SELECT count(*) FROM exchanges e WHERE date_trunc('month',e.created_at)=m)::int exchanges
        FROM generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') m ORDER BY m`),
      query(`SELECT status,count(*)::int n FROM exchanges GROUP BY status ORDER BY n DESC`),
      query(`SELECT s.name,count(*)::int n FROM user_skills us JOIN skills s ON s.id=us.skill_id WHERE us.type='offer' GROUP BY s.name ORDER BY n DESC LIMIT 6`),
    ]);
    res.json({ success: true, data: { ...totals.rows[0], growth: growth.rows, exchanges_by_status: exch.rows, top_skills: topSkills.rows } });
  } catch (e) { next(e); }
}

// ───────── Users ─────────
export async function listUsers(req, res, next) {
  try {
    const { status = '', role = '', search = '' } = req.query;
    const params = []; const where = []; const p = v => { params.push(v); return `$${params.length}`; };
    if (status) where.push(`u.status=${p(status)}`);
    if (role === 'staff') where.push(`u.role<>'USER'`); else if (role) where.push(`u.role=${p(role)}`);
    if (search) { const s = p(`%${likeEscape(String(search).slice(0, 80))}%`); where.push(`(u.name ILIKE ${s} OR u.email ILIKE ${s} OR u.username ILIKE ${s} OR u.phone ILIKE ${s})`); }
    const r = await query(`SELECT u.id,u.name,u.username,u.email,u.phone,u.role,u.status,u.status_reason,u.status_until,u.avatar_url,u.location,u.is_verified,u.created_at,
        COALESCE((SELECT AVG(rv.rating) FROM reviews rv WHERE rv.reviewee_id=u.id AND rv.status='active'),0)::numeric(3,2) rating,
        (SELECT count(*) FROM exchanges e WHERE (e.sender_id=u.id OR e.receiver_id=u.id) AND e.status='completed')::int exchanges,
        (SELECT count(*) FROM reports rp WHERE rp.reported_user_id=u.id)::int reports_against
      FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.created_at DESC LIMIT 300`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function userDetail(req, res, next) {
  try {
    const u = await query(`SELECT id,name,username,email,phone,role,status,status_reason,status_until,status_changed_at,bio,headline,avatar_url,location,language,is_verified,created_at FROM users WHERE id=$1`, [req.params.id]);
    if (!u.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    const [stats, reports, logs, skills] = await Promise.all([
      query(`SELECT (SELECT count(*) FROM exchanges WHERE (sender_id=$1 OR receiver_id=$1))::int exchanges,
          (SELECT count(*) FROM exchanges WHERE (sender_id=$1 OR receiver_id=$1) AND status='completed')::int completed,
          (SELECT count(*) FROM connections WHERE (requester_id=$1 OR addressee_id=$1) AND status='accepted')::int connections,
          (SELECT COALESCE(avg(rating),0)::numeric(3,2) FROM reviews WHERE reviewee_id=$1 AND status='active') rating`, [req.params.id]),
      query(`SELECT r.id,r.reason,r.status,r.target_type,r.created_at,ru.name reporter_name FROM reports r JOIN users ru ON ru.id=r.reporter_id WHERE r.reported_user_id=$1 ORDER BY r.created_at DESC LIMIT 10`, [req.params.id]),
      query(`SELECT a.action,a.note,a.created_at,ad.name admin_name FROM admin_logs a JOIN users ad ON ad.id=a.admin_id WHERE a.target_user_id=$1 ORDER BY a.created_at DESC LIMIT 15`, [req.params.id]),
      query(`SELECT us.type,us.level,s.name FROM user_skills us JOIN skills s ON s.id=us.skill_id WHERE us.user_id=$1 ORDER BY us.type,s.name`, [req.params.id]),
    ]);
    res.json({ success: true, data: { ...u.rows[0], stats: stats.rows[0], reports: reports.rows, logs: logs.rows, skills: skills.rows } });
  } catch (e) { next(e); }
}

const STATUS_TEXT = {
  suspended: (d, why) => `تم إيقاف حسابك مؤقتًا${d ? ` لمدة ${d} يومًا` : ''}.${why ? ` السبب: ${why}` : ''}`,
  banned: (_d, why) => `تم حظر حسابك نهائيًا.${why ? ` السبب: ${why}` : ''}`,
  closed: (_d, why) => `تم إغلاق حسابك من الإدارة.${why ? ` السبب: ${why}` : ''}`,
  active: () => 'تمت إعادة تفعيل حسابك. أهلًا بعودتك!',
};

/** Shared by the Users screen and by report resolution. */
async function applyAccountStatus({ actor, targetId, status, reason = '', days = null, reportId = null }) {
  if (targetId === actor.id) throw httpError(400, 'لا يمكنك تغيير حالة حسابك بنفسك', 'SELF_ADMIN_ACTION');
  const t = await query('SELECT id,name,role,status FROM users WHERE id=$1', [targetId]);
  if (!t.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
  if (!canActOn(actor.role, t.rows[0].role)) throw httpError(403, 'لا يمكنك إدارة حساب بصلاحية مساوية لك أو أعلى', 'ROLE_FORBIDDEN');
  const until = status === 'suspended' && days ? new Date(Date.now() + days * 864e5) : null;
  const r = await query(`UPDATE users SET status=$1,status_reason=$2,status_until=$3,status_changed_by=$4,status_changed_at=now(),updated_at=now() WHERE id=$5
    RETURNING id,name,email,role,status,status_reason,status_until`, [status, status === 'active' ? '' : reason, until, actor.id, targetId]);
  // Also stop Supabase Auth from issuing new sessions to closed/banned accounts (the API gate already blocks every request).
  try {
    await assertSupabaseAdmin().auth.admin.updateUserById(targetId, { ban_duration: ['banned', 'closed'].includes(status) ? '876000h' : 'none' });
  } catch (e) { console.error('supabase ban sync failed:', e.message); }
  await log(actor.id, status === 'active' ? 'reactivate' : status, reason || `Account status → ${status}`, { target: targetId, report: reportId });
  await notify(targetId, 'account_status', 'تحديث حالة الحساب', STATUS_TEXT[status](days, reason));
  return r.rows[0];
}

export async function updateUserStatus(req, res, next) {
  try {
    const { status, reason, days } = req.body;
    if (status !== 'active' && !reason) throw httpError(400, 'اكتب سبب الإجراء — سيظهر للمستخدم', 'REASON_REQUIRED');
    res.json({ success: true, data: await applyAccountStatus({ actor: req.user, targetId: req.params.id, status, reason, days }) });
  } catch (e) { next(e); }
}

export async function updateUserVerification(req, res, next) {
  try {
    const v = Boolean(req.body?.is_verified);
    const r = await query('UPDATE users SET is_verified=$1,updated_at=now() WHERE id=$2 RETURNING id,name,is_verified', [v, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    await log(req.user.id, v ? 'verify' : 'unverify', v ? 'Account verified' : 'Verification removed', { target: req.params.id });
    await notify(req.params.id, 'verification', v ? 'تم توثيق حسابك' : 'تم تعديل التوثيق', v ? 'مبروك! تم توثيق حسابك من الإدارة.' : 'تم إزالة علامة التوثيق من حسابك.');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

export async function updateUserRole(req, res, next) {
  try {
    const role = String(req.body?.role || '');
    if (!['USER', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE_MANAGER', 'ADS_MANAGER'].includes(role)) throw httpError(400, 'Invalid role', 'INVALID_ROLE');
    if (req.params.id === req.user.id) throw httpError(400, 'لا يمكنك تغيير دورك بنفسك', 'SELF_ADMIN_ACTION');
    const r = await query('UPDATE users SET role=$1,updated_at=now() WHERE id=$2 RETURNING id,name,role,status', [role, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    await log(req.user.id, 'role_change', `Role → ${role}`, { target: req.params.id });
    await notify(req.params.id, 'role_change', 'تم تحديث صلاحيات حسابك', `دور حسابك الآن: ${role}.`);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

export async function resetUserPassword(req, res, next) {
  try {
    const r = await query('SELECT id,email FROM users WHERE id=$1', [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    const redirectTo = process.env.PASSWORD_RESET_REDIRECT_URL || `${(process.env.CLIENT_URL || 'http://localhost:4000').split(',')[0].trim().replace(/\/$/, '')}/#reset-password`;
    const out = await assertSupabaseAdmin().auth.admin.generateLink({ type: 'recovery', email: r.rows[0].email, options: { redirectTo } });
    if (out.error) throw httpError(400, out.error.message, 'RESET_LINK_FAILED');
    await log(req.user.id, 'password_reset', 'Recovery link generated', { target: req.params.id });
    res.json({ success: true, data: { email: r.rows[0].email, action_link: out.data.properties?.action_link || null } });
  } catch (e) { next(e); }
}

export async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user.id) throw httpError(400, 'Self deletion is not allowed', 'SELF_ADMIN_ACTION');
    const t = await query('SELECT id,email FROM users WHERE id=$1', [req.params.id]);
    if (!t.rowCount) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    const out = await assertSupabaseAdmin().auth.admin.deleteUser(req.params.id);
    if (out.error) throw httpError(400, out.error.message, 'DELETE_AUTH_USER_FAILED');
    await log(req.user.id, 'user_delete', `Deleted user ${t.rows[0].email}`);
    res.json({ success: true });
  } catch (e) { next(e); }
}

// ───────── Reports (users, exchanges, messages…) ─────────
export async function listReports(req, res, next) {
  try {
    const { status = '', type = '' } = req.query; const params = []; const where = []; const p = v => { params.push(v); return `$${params.length}`; };
    if (status === 'active') where.push(`r.status IN ('open','investigating')`); else if (status) where.push(`r.status=${p(status)}`);
    if (type) where.push(`r.target_type=${p(type)}`);
    const r = await query(`SELECT r.id,r.target_type,r.reason,r.description,r.status,r.created_at,r.resolved_at,r.exchange_id,r.reported_user_id,
        u1.name reporter_name,u2.name reported_name,u2.status reported_status,
        (SELECT count(*) FROM reports x WHERE x.reported_user_id=r.reported_user_id)::int reports_against
      FROM reports r JOIN users u1 ON u1.id=r.reporter_id LEFT JOIN users u2 ON u2.id=r.reported_user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (r.status IN ('open','investigating')) DESC, r.created_at DESC LIMIT 300`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function reportDetail(req, res, next) {
  try {
    const r = await query(`SELECT r.*,u1.name reporter_name,u1.email reporter_email,u2.name reported_name,u2.email reported_email,u2.status reported_status,u2.role reported_role,u2.created_at reported_since
      FROM reports r JOIN users u1 ON u1.id=r.reporter_id LEFT JOIN users u2 ON u2.id=r.reported_user_id WHERE r.id=$1`, [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Report not found', 'REPORT_NOT_FOUND');
    const report = r.rows[0]; const context = {};
    if (report.exchange_id) {
      const ex = await query(`SELECT e.id,e.status,e.deal_type,e.message,e.created_at,e.accepted_at,e.completed_at,so.name offered_skill,sr.name requested_skill,u1.name sender_name,u2.name receiver_name
        FROM exchanges e JOIN skills so ON so.id=e.offered_skill_id JOIN skills sr ON sr.id=e.requested_skill_id JOIN users u1 ON u1.id=e.sender_id JOIN users u2 ON u2.id=e.receiver_id WHERE e.id=$1`, [report.exchange_id]);
      const ev = await query(`SELECT event_type,note,created_at FROM exchange_events WHERE exchange_id=$1 ORDER BY created_at`, [report.exchange_id]);
      context.exchange = ex.rows[0] ? { ...ex.rows[0], events: ev.rows } : null;
    }
    // Private chats are visible ONLY for a message that was reported, and only to staff who can act on reports. Access is audited.
    if (report.target_type === 'message' && report.target_id && can(req.user.role, 'reports')) {
      const m = await query(`SELECT m.id,m.kind,m.body,m.audio_path,m.audio_seconds,m.sent_at,m.sender_id,u.name sender_name FROM dm_messages m JOIN users u ON u.id=m.sender_id
        WHERE m.connection_id=(SELECT connection_id FROM dm_messages WHERE id=$1)
          AND m.sent_at BETWEEN (SELECT sent_at-interval '30 minutes' FROM dm_messages WHERE id=$1) AND (SELECT sent_at+interval '10 minutes' FROM dm_messages WHERE id=$1)
        ORDER BY m.sent_at LIMIT 40`, [report.target_id]);
      context.messages = await withAudioUrls(m.rows, 15 * 60);       // staff links expire after 15 minutes; storage paths are never returned
      const nVoice = m.rows.filter(x => x.kind === 'voice').length;
      await log(req.user.id, 'view_report_chat', `Viewed reported chat context for report ${report.id}${nVoice ? ` (incl. ${nVoice} voice message${nVoice > 1 ? 's' : ''})` : ''}`, { target: report.reported_user_id, report: report.id });
    }
    const prior = await query(`SELECT id,reason,status,created_at FROM reports WHERE reported_user_id=$1 AND id<>$2 ORDER BY created_at DESC LIMIT 8`, [report.reported_user_id, report.id]);
    res.json({ success: true, data: { ...report, context, prior_reports: prior.rows } });
  } catch (e) { next(e); }
}

export async function updateReport(req, res, next) {
  try {
    const { action, note, days } = req.body;
    const r = await query('SELECT * FROM reports WHERE id=$1', [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Report not found', 'REPORT_NOT_FOUND');
    const report = r.rows[0];
    if (['suspend', 'close', 'ban'].includes(action)) {
      if (!report.reported_user_id) throw httpError(400, 'هذا البلاغ غير مرتبط بحساب', 'REPORT_TARGET_NOT_USER');
      if (!can(req.user.role, 'users.moderate')) throw httpError(403, 'لا تملك صلاحية تعديل الحسابات', 'FORBIDDEN_PERMISSION');
      if (!note) throw httpError(400, 'اكتب سبب الإجراء', 'REASON_REQUIRED');
      await applyAccountStatus({ actor: req.user, targetId: report.reported_user_id, status: { suspend: 'suspended', close: 'closed', ban: 'banned' }[action], reason: note, days: action === 'suspend' ? days : null, reportId: report.id });
    } else if (action === 'warn' && report.reported_user_id) {
      await notify(report.reported_user_id, 'moderation', 'تنبيه من الإدارة', note || 'تم تسجيل تنبيه على حسابك بعد مراجعة بلاغ.');
    }
    const status = action === 'investigate' ? 'investigating' : action === 'dismiss' ? 'dismissed' : 'resolved';
    const done = status === 'resolved' || status === 'dismissed';
    await query(`UPDATE reports SET status=$1::text,
        resolved_at=CASE WHEN $1::text IN ('resolved','dismissed') THEN now() ELSE NULL END,
        resolved_by=CASE WHEN $1::text IN ('resolved','dismissed') THEN $3::uuid ELSE NULL END,
        admin_note=COALESCE(NULLIF($4::text,''),admin_note) WHERE id=$2::uuid`, [status, report.id, req.user.id, note || '']);
    await log(req.user.id, `report_${action}`, note || `Report ${action}`, { target: report.reported_user_id, report: report.id });
    if (done) await notify(report.reporter_id, 'report_update', 'تمت مراجعة بلاغك', status === 'dismissed' ? 'راجعنا بلاغك ولم نجد مخالفة. شكرًا لحرصك.' : 'راجعنا بلاغك واتخذنا الإجراء المناسب. شكرًا لمساعدتك.', report.id, 'report');
    res.json({ success: true, data: { report_id: report.id, status, action } });
  } catch (e) { next(e); }
}

// ───────── Exchanges / reviews ─────────
export async function listExchanges(req, res, next) {
  try {
    const status = String(req.query.status || ''); const params = []; let where = '';
    if (status) { params.push(status); where = 'WHERE e.status=$1'; }
    const r = await query(`SELECT e.id,e.status,e.deal_type,e.created_at,e.updated_at,e.sender_id,e.receiver_id,u1.name sender_name,u2.name receiver_name,so.name offered_skill,sr.name requested_skill,
        (SELECT count(*) FROM reports rp WHERE rp.exchange_id=e.id)::int reports
      FROM exchanges e JOIN users u1 ON u1.id=e.sender_id JOIN users u2 ON u2.id=e.receiver_id JOIN skills so ON so.id=e.offered_skill_id JOIN skills sr ON sr.id=e.requested_skill_id
      ${where} ORDER BY e.updated_at DESC LIMIT 300`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}
export async function adminExchangeStatus(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    if (!['pending', 'accepted', 'scheduled', 'rejected', 'in_progress', 'completed', 'disputed', 'cancelled'].includes(status)) throw httpError(400, 'Invalid exchange status', 'INVALID_STATUS');
    const r = await query('UPDATE exchanges SET status=$1,updated_at=now() WHERE id=$2 RETURNING *', [status, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Exchange not found', 'EXCHANGE_NOT_FOUND');
    const e = r.rows[0];
    await query('INSERT INTO exchange_events(exchange_id,actor_id,event_type,note) VALUES($1,$2,$3,$4)', [e.id, req.user.id, `admin_${status}`, `الإدارة غيّرت الحالة إلى ${status}`]);
    await log(req.user.id, 'exchange_status', `Exchange ${e.id} → ${status}`);
    for (const uid of [e.sender_id, e.receiver_id]) await notify(uid, 'exchange_update', 'تحديث من الإدارة', `تم تغيير حالة التبادل إلى ${status}.`, e.id, 'exchange');
    res.json({ success: true, data: e });
  } catch (e) { next(e); }
}
export async function listReviews(_req, res, next) {
  try {
    const r = await query(`SELECT rv.id,rv.rating,rv.comment,rv.status,rv.created_at,u1.name reviewer_name,u2.name reviewee_name FROM reviews rv JOIN users u1 ON u1.id=rv.reviewer_id JOIN users u2 ON u2.id=rv.reviewee_id ORDER BY rv.created_at DESC LIMIT 300`);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}
export async function updateReview(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    if (!['active', 'hidden'].includes(status)) throw httpError(400, 'Invalid review status', 'INVALID_STATUS');
    const r = await query('UPDATE reviews SET status=$1,moderated_by=$2,moderated_at=now() WHERE id=$3 RETURNING id,status', [status, req.user.id, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Review not found', 'REVIEW_NOT_FOUND');
    await log(req.user.id, 'review_moderation', `Review ${req.params.id} → ${status}`);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

// ───────── Company ads ─────────
export async function listAds(_req, res, next) {
  try {
    const r = await query(`SELECT a.*,(SELECT count(*) FROM ad_impressions i WHERE i.advertisement_id=a.id)::int impressions,(SELECT count(*) FROM ad_clicks c WHERE c.advertisement_id=a.id)::int clicks FROM advertisements a ORDER BY a.created_at DESC`);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}
export async function createAd(req, res, next) {
  try {
    const b = req.body;
    const r = await query(`INSERT INTO advertisements(title,description,image_url,logo_url,target_url,cta_label,advertiser_name,placement,status,priority,start_at,end_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [b.title, b.description, b.image_url, b.logo_url, b.target_url, b.cta_label, b.advertiser_name, b.placement, b.status, b.priority, b.start_at || null, b.end_at || null, req.user.id]);
    await log(req.user.id, 'ad_create', `Ad "${b.title}" for ${b.advertiser_name}`);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function updateAd(req, res, next) {
  try {
    const fields = ['title', 'description', 'image_url', 'logo_url', 'target_url', 'cta_label', 'advertiser_name', 'placement', 'status', 'priority', 'start_at', 'end_at'];
    const vals = []; const sets = [];
    for (const f of fields) if (f in req.body) { vals.push(req.body[f] ?? null); sets.push(`${f}=$${vals.length}`); }
    if (!sets.length) throw httpError(400, 'Nothing to update', 'EMPTY_UPDATE');
    vals.push(req.params.id);
    const r = await query(`UPDATE advertisements SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length} RETURNING *`, vals);
    if (!r.rowCount) throw httpError(404, 'Advertisement not found', 'AD_NOT_FOUND');
    await log(req.user.id, 'ad_update', `Ad ${req.params.id} updated`);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function deleteAd(req, res, next) {
  try {
    const r = await query('DELETE FROM advertisements WHERE id=$1 RETURNING id,title', [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Advertisement not found', 'AD_NOT_FOUND');
    await log(req.user.id, 'ad_delete', `Ad "${r.rows[0].title}" deleted`);
    res.json({ success: true });
  } catch (e) { next(e); }
}

// ───────── Skills & categories ─────────
const dup = e => (e.code === '23505' ? httpError(409, 'الاسم موجود بالفعل', 'DUPLICATE') : e);
export async function listSkillsAdmin(_req, res, next) {
  try { res.json({ success: true, data: (await query(`SELECT s.id,s.name,s.category_id,s.is_hidden,s.is_featured,c.name category,(SELECT count(*) FROM user_skills us WHERE us.skill_id=s.id)::int users FROM skills s LEFT JOIN categories c ON c.id=s.category_id ORDER BY s.name`)).rows }); } catch (e) { next(e); }
}
export async function createSkill(req, res, next) {
  try { const r = await query('INSERT INTO skills(name,category_id) VALUES($1,$2) RETURNING *', [nameOk(req.body?.name), req.body?.category_id || null]); await log(req.user.id, 'skill_create', r.rows[0].name); res.status(201).json({ success: true, data: r.rows[0] }); } catch (e) { next(dup(e)); }
}
export async function updateSkill(req, res, next) {
  try {
    const b = req.body || {};
    const r = await query(`UPDATE skills SET name=COALESCE($1,name),category_id=CASE WHEN $2::boolean THEN $3::uuid ELSE category_id END,is_hidden=COALESCE($4,is_hidden),is_featured=COALESCE($5,is_featured),updated_at=now() WHERE id=$6 RETURNING *`,
      [b.name !== undefined ? nameOk(b.name) : null, 'category_id' in b, b.category_id || null, typeof b.is_hidden === 'boolean' ? b.is_hidden : null, typeof b.is_featured === 'boolean' ? b.is_featured : null, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Skill not found', 'NOT_FOUND');
    await log(req.user.id, 'skill_update', r.rows[0].name);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(dup(e)); }
}
export async function deleteSkill(req, res, next) {
  try { const r = await query('DELETE FROM skills WHERE id=$1 RETURNING id,name', [req.params.id]); if (!r.rowCount) throw httpError(404, 'Skill not found', 'NOT_FOUND'); await log(req.user.id, 'skill_delete', r.rows[0].name); res.json({ success: true }); } catch (e) { next(e); }
}
export async function listCategoriesAdmin(_req, res, next) {
  try { res.json({ success: true, data: (await query(`SELECT c.id,c.name,COUNT(s.id)::int skill_count FROM categories c LEFT JOIN skills s ON s.category_id=c.id GROUP BY c.id ORDER BY c.name`)).rows }); } catch (e) { next(e); }
}
export async function createCategory(req, res, next) {
  try { const r = await query('INSERT INTO categories(name) VALUES($1) RETURNING *', [nameOk(req.body?.name)]); await log(req.user.id, 'category_create', r.rows[0].name); res.status(201).json({ success: true, data: r.rows[0] }); } catch (e) { next(dup(e)); }
}
export async function updateCategory(req, res, next) {
  try { const r = await query('UPDATE categories SET name=$1 WHERE id=$2 RETURNING *', [nameOk(req.body?.name), req.params.id]); if (!r.rowCount) throw httpError(404, 'Category not found', 'NOT_FOUND'); res.json({ success: true, data: r.rows[0] }); } catch (e) { next(dup(e)); }
}
export async function deleteCategory(req, res, next) {
  try { const r = await query('DELETE FROM categories WHERE id=$1 RETURNING id,name', [req.params.id]); if (!r.rowCount) throw httpError(404, 'Category not found', 'NOT_FOUND'); await log(req.user.id, 'category_delete', r.rows[0].name); res.json({ success: true }); } catch (e) { next(e); }
}

// ───────── Audit log, settings, jobs ─────────
export async function actions(_req, res, next) {
  try { res.json({ success: true, data: (await query(`SELECT a.id,a.action,a.note,a.created_at,u.name admin_name,t.name target_user_name FROM admin_logs a JOIN users u ON u.id=a.admin_id LEFT JOIN users t ON t.id=a.target_user_id ORDER BY a.created_at DESC LIMIT 300`)).rows }); } catch (e) { next(e); }
}
export async function readSettings(_req, res, next) { try { res.json({ success: true, data: await getSettings() }); } catch (e) { next(e); } }
export async function writeSettings(req, res, next) {
  try { const data = await saveSettings(req.body || {}); await log(req.user.id, 'settings_update', `Updated: ${Object.keys(req.body || {}).join(', ')}`); res.json({ success: true, data }); } catch (e) { next(e); }
}
export async function listJobs(req, res, next) {
  try {
    const status = String(req.query.status || ''); const params = []; let where = '1=1';
    if (status) { params.push(status); where += ` AND j.status=$1`; }
    res.json({ success: true, data: (await query(`SELECT j.*,u.name owner_name,u.is_verified owner_verified FROM job_posts j JOIN users u ON u.id=j.owner_id WHERE ${where} ORDER BY (j.status='pending') DESC,j.created_at DESC LIMIT 300`, params)).rows });
  } catch (e) { next(e); }
}
export async function moderateJob(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    if (!['pending', 'published', 'rejected', 'closed', 'suspended'].includes(status)) throw httpError(400, 'Invalid job status', 'INVALID_STATUS');
    const r = await query('UPDATE job_posts SET status=$1,updated_at=now(),moderated_by=$2,moderated_at=now() WHERE id=$3 RETURNING *', [status, req.user.id, req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Job post not found', 'NOT_FOUND');
    await log(req.user.id, 'job_moderation', `Job ${req.params.id} → ${status}`, { target: r.rows[0].owner_id });
    await notify(r.rows[0].owner_id, 'job_moderation', 'تحديث فرصة العمل', `حالة فرصتك "${r.rows[0].title}" أصبحت: ${status}.`, r.rows[0].id, 'job');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
