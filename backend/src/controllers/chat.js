import { query } from '../config/db.js';
import { notify } from '../services/notify.js';
import { getSetting } from '../services/settings.js';
import { httpError } from '../middleware/errors.js';
import { parseVoice, storeVoice, removeVoice, withAudioUrls } from '../services/voice.js';

/** Loads the connection and makes sure I'm part of it, it's accepted, and the other side is still active. */
async function openChat(connectionId, me) {
  const r = await query(`SELECT c.*,u.id other_id,u.name other_name,u.status other_status FROM connections c
    JOIN users u ON u.id=CASE WHEN c.requester_id=$2 THEN c.addressee_id ELSE c.requester_id END WHERE c.id=$1`, [connectionId, me]);
  if (!r.rowCount) throw httpError(404, 'المحادثة غير موجودة', 'NOT_FOUND');
  const c = r.rows[0];
  if (![c.requester_id, c.addressee_id].includes(me)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
  if (c.status !== 'accepted') throw httpError(403, 'لازم طلب التواصل يتقبّل الأول عشان تتراسلوا', 'CONNECTION_REQUIRED');
  if (c.other_status !== 'active') throw httpError(403, 'هذا الحساب غير متاح حاليًا', 'USER_UNAVAILABLE');
  return c;
}


const COLS = 'id,connection_id,sender_id,kind,body,audio_path,audio_seconds,sent_at,read_at';
const PREVIEW = "CASE WHEN lm.kind='voice' THEN '🎤 رسالة صوتية' ELSE lm.body END";

/** Rejects bursts (30 messages/minute/user) — shared by text and voice. */
async function floodGuard(me) {
  const burst = await query(`SELECT count(*)::int n FROM dm_messages WHERE sender_id=$1 AND sent_at>now()-interval '1 minute'`, [me]);
  if (burst.rows[0].n >= 30) throw httpError(429, 'ببطء شوية — رسائل كتير في وقت قصير', 'RATE_LIMITED');
}

/** One notification per unread burst (avoids spamming the bell). */
async function notifyOnce(c, req, title, preview) {
  const recent = await query(`SELECT 1 FROM notifications WHERE user_id=$1 AND type='new_message' AND reference_id=$2 AND NOT is_read LIMIT 1`, [c.other_id, c.id]);
  if (!recent.rowCount) await notify(c.other_id, 'new_message', title, preview, c.id, 'chat');
}

export async function inbox(req, res, next) {
  try {
    const me = req.user.id;
    const r = await query(`
      SELECT c.id connection_id,u.id user_id,u.name,u.username,u.avatar_url,u.is_verified,
        ${PREVIEW} last_body,lm.sent_at last_at,lm.sender_id last_sender,
        ex.status exchange_status,ex.id exchange_id,ex.sender_id exchange_sender_id,ex.offered_name,ex.requested_name,
        (SELECT count(*) FROM dm_messages m WHERE m.connection_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL)::int unread
      FROM connections c
      JOIN users u ON u.id=CASE WHEN c.requester_id=$1 THEN c.addressee_id ELSE c.requester_id END AND u.status='active'
      LEFT JOIN LATERAL (SELECT body,kind,sent_at,sender_id FROM dm_messages WHERE connection_id=c.id ORDER BY sent_at DESC LIMIT 1) lm ON true
      LEFT JOIN LATERAL (SELECT e.id,e.status,e.sender_id,so.name offered_name,sr.name requested_name FROM exchanges e
        LEFT JOIN skills so ON so.id=e.offered_skill_id LEFT JOIN skills sr ON sr.id=e.requested_skill_id
        WHERE e.status IN ('accepted','scheduled','in_progress') AND ((e.sender_id=$1 AND e.receiver_id=u.id) OR (e.sender_id=u.id AND e.receiver_id=$1))
        ORDER BY e.updated_at DESC LIMIT 1) ex ON true
      WHERE c.status='accepted' AND (c.requester_id=$1 OR c.addressee_id=$1)
      ORDER BY COALESCE(lm.sent_at,c.responded_at,c.created_at) DESC`, [me]);
    res.json({ success: true, data: r.rows, unread_total: r.rows.reduce((n, x) => n + x.unread, 0) });
  } catch (e) { next(e); }
}

export async function unreadCount(req, res, next) {
  try {
    const r = await query(`SELECT count(*)::int n FROM dm_messages m JOIN connections c ON c.id=m.connection_id
      WHERE c.status='accepted' AND (c.requester_id=$1 OR c.addressee_id=$1) AND m.sender_id<>$1 AND m.read_at IS NULL`, [req.user.id]);
    const p = await query(`SELECT count(*)::int n FROM connections WHERE addressee_id=$1 AND status='pending'`, [req.user.id]);
    res.json({ success: true, data: { messages: r.rows[0].n, requests: p.rows[0].n } });
  } catch (e) { next(e); }
}

export async function messages(req, res, next) {
  try {
    const me = req.user.id;
    await openChat(req.params.connectionId, me);
    const after = req.query.after ? new Date(String(req.query.after)) : null;
    const params = [req.params.connectionId]; let where = 'connection_id=$1';
    if (after && !Number.isNaN(after.getTime())) { params.push(after.toISOString()); where += ' AND sent_at>$2'; }
    const r = await query(`SELECT * FROM (SELECT ${COLS} FROM dm_messages WHERE ${where} ORDER BY sent_at DESC LIMIT 200) t ORDER BY sent_at ASC`, params);
    // Opening the thread marks the other person's messages as read.
    await query('UPDATE dm_messages SET read_at=now() WHERE connection_id=$1 AND sender_id<>$2 AND read_at IS NULL', [req.params.connectionId, me]);
    // Which of MY recent messages the other person has read (drives the double tick; also works with polling only).
    const read = await query('SELECT id FROM dm_messages WHERE connection_id=$1 AND sender_id=$2 AND read_at IS NOT NULL ORDER BY sent_at DESC LIMIT 100', [req.params.connectionId, me]);
    res.json({ success: true, data: await withAudioUrls(r.rows), read_ids: read.rows.map(x => x.id) });
  } catch (e) { next(e); }
}

export async function send(req, res, next) {
  try {
    const me = req.user.id;
    const c = await openChat(req.params.connectionId, me);
    const max = Number(await getSetting('max_message_length') || 4000);
    if (req.body.body.length > max) throw httpError(400, `الرسالة أطول من ${max} حرف`, 'MESSAGE_TOO_LONG');
    await floodGuard(me);
    const r = await query(`INSERT INTO dm_messages(connection_id,sender_id,body) VALUES($1,$2,$3) RETURNING ${COLS}`, [c.id, me, req.body.body]);
    await notifyOnce(c, req, `رسالة جديدة من ${req.user.name}`, req.body.body.slice(0, 120));
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}

export async function sendVoice(req, res, next) {
  let path = null;
  try {
    const me = req.user.id;
    const c = await openChat(req.params.connectionId, me);
    await floodGuard(me);
    const audio = parseVoice(req.body.data_url);
    path = await storeVoice(c.id, audio);
    const r = await query(`INSERT INTO dm_messages(connection_id,sender_id,kind,body,audio_path,audio_seconds,audio_mime) VALUES($1,$2,'voice','',$3,$4,$5) RETURNING ${COLS}`,
      [c.id, me, path, req.body.seconds, audio.mime]);
    await notifyOnce(c, req, `رسالة صوتية من ${req.user.name}`, '🎤 رسالة صوتية');
    res.status(201).json({ success: true, data: (await withAudioUrls(r.rows))[0] });
  } catch (e) {
    if (path) await removeVoice(path);       // never leave an orphaned recording behind
    next(e);
  }
}
