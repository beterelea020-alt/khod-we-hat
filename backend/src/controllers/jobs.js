import { query } from '../config/db.js';
import { notify } from '../services/notify.js';
import { httpError } from '../middleware/errors.js';

const esc = s => String(s).replace(/[\\%_]/g, '\\$&');

export async function listPublished(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80); const params = []; let where = `j.status='published' AND u.status='active'`;
    if (q) { params.push(`%${esc(q)}%`); where += ` AND (j.title ILIKE $1 OR j.description ILIKE $1 OR j.required_skills ILIKE $1 OR j.company ILIKE $1)`; }
    const r = await query(`SELECT j.*,u.name owner_name,u.is_verified owner_verified FROM job_posts j JOIN users u ON u.id=j.owner_id WHERE ${where} ORDER BY j.created_at DESC LIMIT 100`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}
export async function getOne(req, res, next) {
  try {
    const r = await query(`SELECT j.*,u.name owner_name,u.is_verified owner_verified FROM job_posts j JOIN users u ON u.id=j.owner_id WHERE j.id=$1 AND j.status='published'`, [req.params.id]);
    if (!r.rowCount) throw httpError(404, 'Job not found', 'NOT_FOUND');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function listMine(req, res, next) {
  try { res.json({ success: true, data: (await query('SELECT * FROM job_posts WHERE owner_id=$1 ORDER BY created_at DESC', [req.user.id])).rows }); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const b = req.body;
    const r = await query(`INSERT INTO job_posts(owner_id,title,description,company,location,job_type,required_skills,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [req.user.id, b.title, b.description, b.company, b.location, b.job_type, b.required_skills]);
    await notify(req.user.id, 'job_moderation', 'تم إرسال فرصة العمل', 'فرصتك في المراجعة وستظهر للجميع بعد موافقة الإدارة.', r.rows[0].id, 'job');
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function updateMine(req, res, next) {
  try {
    const b = req.body;
    const r = await query(`UPDATE job_posts SET title=$1,description=$2,company=$3,location=$4,job_type=$5,required_skills=$6,status='pending',updated_at=now() WHERE id=$7 AND owner_id=$8 RETURNING *`,
      [b.title, b.description, b.company, b.location, b.job_type, b.required_skills, req.params.id, req.user.id]);
    if (!r.rowCount) throw httpError(404, 'Job post not found', 'NOT_FOUND');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
}
export async function closeMine(req, res, next) {
  try {
    const r = await query(`UPDATE job_posts SET status='closed',updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id`, [req.params.id, req.user.id]);
    if (!r.rowCount) throw httpError(404, 'Job post not found', 'NOT_FOUND');
    res.json({ success: true });
  } catch (e) { next(e); }
}
