import { query, tx } from '../config/db.js';
import { notify } from '../services/notify.js';
import { getSetting } from '../services/settings.js';
import { httpError } from '../middleware/errors.js';

const other = (c, me) => (c.requester_id === me ? c.addressee_id : c.requester_id);

/** All my connections (accepted, incoming, outgoing) with the other person's public card. */
export async function list(req, res, next) {
  try {
    const me = req.user.id;
    const r = await query(`
      SELECT c.id,c.status,c.message,c.created_at,c.responded_at,
        CASE WHEN c.requester_id=$1 THEN 'outgoing' ELSE 'incoming' END direction,
        u.id user_id,u.name,u.username,u.headline,u.avatar_url,u.location,u.is_verified,
        COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.reviewee_id=u.id AND r.status='active'),0)::numeric(3,2) rating,
        CASE WHEN c.status='accepted' THEN u.phone ELSE NULL END phone
      FROM connections c JOIN users u ON u.id=CASE WHEN c.requester_id=$1 THEN c.addressee_id ELSE c.requester_id END
      WHERE (c.requester_id=$1 OR c.addressee_id=$1) AND c.status<>'declined' AND u.status='active'
      ORDER BY c.created_at DESC`, [me]);
    res.json({ success: true, data: r.rows, pending_incoming: r.rows.filter(x => x.status === 'pending' && x.direction === 'incoming').length });
  } catch (e) { next(e); }
}

/** Send a connection request (طلب تواصل). A mutual request auto-accepts. */
export async function request(req, res, next) {
  try {
    const me = req.user.id; const { user_id, message } = req.body;
    if (user_id === me) throw httpError(400, 'لا يمكنك إرسال طلب لنفسك', 'SELF_CONNECTION');
    const target = await query("SELECT id,name FROM users WHERE id=$1 AND status='active'", [user_id]);
    if (!target.rowCount) throw httpError(404, 'المستخدم غير متاح', 'USER_UNAVAILABLE');
    const max = Number(await getSetting('max_connection_requests_day') || 30);
    const today = await query('SELECT count(*)::int n FROM connections WHERE requester_id=$1 AND created_at>=current_date', [me]);
    if (today.rows[0].n >= max) throw httpError(429, 'وصلت للحد اليومي لطلبات التواصل', 'DAILY_LIMIT');

    const out = await tx(async c => {
      const ex = await c.query('SELECT * FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1) FOR UPDATE', [me, user_id]);
      if (ex.rowCount) {
        const x = ex.rows[0];
        if (x.status === 'accepted') throw httpError(409, 'أنتم متواصلون بالفعل', 'ALREADY_CONNECTED');
        if (x.status === 'pending' && x.requester_id === me) throw httpError(409, 'طلبك قيد الانتظار', 'ALREADY_PENDING');
        if (x.status === 'pending') { // they already asked me → accept
          const up = await c.query(`UPDATE connections SET status='accepted',responded_at=now() WHERE id=$1 RETURNING *`, [x.id]);
          await notify(user_id, 'connection_accepted', 'تم قبول طلب التواصل', `${req.user.name} قبل طلب التواصل. تقدروا تتراسلوا الآن.`, x.id, 'connection', c);
          return up.rows[0];
        }
        // previously declined: the declined side may not be spammed — only the original requester can retry, after 7 days
        if (x.requester_id !== me) {
          const up = await c.query(`UPDATE connections SET requester_id=$1,addressee_id=$2,status='pending',message=$3,created_at=now(),responded_at=NULL WHERE id=$4 RETURNING *`, [me, user_id, message, x.id]);
          await notify(user_id, 'connection_request', 'طلب تواصل جديد', `${req.user.name} يريد التواصل معك.`, x.id, 'connection', c);
          return up.rows[0];
        }
        if (x.responded_at && Date.now() - new Date(x.responded_at).getTime() < 7 * 864e5) throw httpError(429, 'يمكنك إعادة الإرسال بعد 7 أيام من الرفض', 'RETRY_LATER');
        const up = await c.query(`UPDATE connections SET status='pending',message=$1,created_at=now(),responded_at=NULL WHERE id=$2 RETURNING *`, [message, x.id]);
        await notify(user_id, 'connection_request', 'طلب تواصل جديد', `${req.user.name} يريد التواصل معك.`, x.id, 'connection', c);
        return up.rows[0];
      }
      const ins = await c.query('INSERT INTO connections(requester_id,addressee_id,message) VALUES($1,$2,$3) RETURNING *', [me, user_id, message]);
      await notify(user_id, 'connection_request', 'طلب تواصل جديد', `${req.user.name} يريد التواصل معك.`, ins.rows[0].id, 'connection', c);
      return ins.rows[0];
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) { next(e); }
}

export async function act(req, res, next) {
  try {
    const me = req.user.id; const { action } = req.body;
    const out = await tx(async c => {
      const r = await c.query('SELECT * FROM connections WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!r.rowCount) throw httpError(404, 'الطلب غير موجود', 'NOT_FOUND');
      const x = r.rows[0];
      if (![x.requester_id, x.addressee_id].includes(me)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
      const them = other(x, me);
      if (action === 'accept' || action === 'decline') {
        if (x.addressee_id !== me) throw httpError(403, 'فقط المستلم يمكنه الرد على الطلب', 'FORBIDDEN');
        if (x.status !== 'pending') throw httpError(409, 'الطلب لم يعد معلّقًا', 'INVALID_TRANSITION');
        const up = await c.query('UPDATE connections SET status=$1,responded_at=now() WHERE id=$2 RETURNING *', [action === 'accept' ? 'accepted' : 'declined', x.id]);
        if (action === 'accept') await notify(them, 'connection_accepted', 'تم قبول طلب التواصل', `${req.user.name} قبل طلبك. تقدروا تتراسلوا الآن.`, x.id, 'connection', c);
        return up.rows[0];
      }
      if (action === 'cancel') {
        if (x.requester_id !== me || x.status !== 'pending') throw httpError(409, 'لا يمكن إلغاء هذا الطلب', 'INVALID_TRANSITION');
      }
      if (action === 'remove' && x.status !== 'accepted') throw httpError(409, 'لا توجد صلة لإزالتها', 'INVALID_TRANSITION');
      await c.query('DELETE FROM connections WHERE id=$1', [x.id]);   // cascades the chat history for removed connections
      return { id: x.id, removed: true };
    });
    res.json({ success: true, data: out });
  } catch (e) { next(e); }
}
