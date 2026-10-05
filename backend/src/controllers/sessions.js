import { query, tx } from '../config/db.js';
import { notify } from '../services/notify.js';
import { httpError } from '../middleware/errors.js';

export async function list(req, res, next) {
  try {
    const r = await query(`SELECT s.*,u1.name teacher_name,u2.name learner_name FROM sessions s JOIN users u1 ON u1.id=s.teacher_id JOIN users u2 ON u2.id=s.learner_id
      WHERE s.teacher_id=$1 OR s.learner_id=$1 ORDER BY s.scheduled_at`, [req.user.id]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const { teacher_id, learner_id, scheduled_at, duration, notes } = req.body;
    const when = new Date(scheduled_at);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) throw httpError(400, 'اختر موعدًا في المستقبل', 'BAD_DATE');
    const out = await tx(async c => {
      const e = await c.query('SELECT * FROM exchanges WHERE id=$1 FOR UPDATE', [req.params.exchangeId]);
      if (!e.rowCount) throw httpError(404, 'Exchange not found', 'EXCHANGE_NOT_FOUND');
      const x = e.rows[0];
      if (![x.sender_id, x.receiver_id].includes(req.user.id)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
      if (new Set([teacher_id, learner_id]).size !== 2 || ![teacher_id, learner_id].every(id => [x.sender_id, x.receiver_id].includes(id))) throw httpError(400, 'المعلّم والمتعلّم يجب أن يكونا طرفي التبادل', 'BAD_PARTICIPANTS');
      if (!['accepted', 'scheduled', 'in_progress'].includes(x.status)) throw httpError(409, 'يجب قبول التبادل قبل تحديد جلسة', 'INVALID_TRANSITION');
      const s = await c.query('INSERT INTO sessions(exchange_id,teacher_id,learner_id,scheduled_at,duration,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [x.id, teacher_id, learner_id, when.toISOString(), duration, notes]);
      if (x.status === 'accepted') await c.query(`UPDATE exchanges SET status='scheduled',updated_at=now() WHERE id=$1`, [x.id]);
      await c.query(`INSERT INTO exchange_events(exchange_id,actor_id,event_type,note) VALUES($1,$2,'session_scheduled',$3)`, [x.id, req.user.id, `جلسة بتاريخ ${when.toISOString()}`]);
      await notify(x.sender_id === req.user.id ? x.receiver_id : x.sender_id, 'session', 'جلسة جديدة', `${req.user.name} حدّد جلسة جديدة.`, x.id, 'exchange', c);
      return s.rows[0];
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    if (!['upcoming', 'completed', 'cancelled', 'no_show'].includes(status)) throw httpError(400, 'Invalid session status', 'INVALID_STATUS');
    const r = await query(`UPDATE sessions SET status=$1,notes=COALESCE($2,notes),updated_at=now() WHERE id=$3 AND (teacher_id=$4 OR learner_id=$4) RETURNING *`,
      [status, req.body?.notes ? String(req.body.notes).slice(0, 4000) : null, req.params.id, req.user.id]);
    if (!r.rowCount) throw httpError(404, 'Session not found', 'NOT_FOUND');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
