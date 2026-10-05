import { query } from '../config/db.js';
import { getAbout, saveAbout, resetAbout } from '../services/about.js';
import { storeImage } from '../services/images.js';

const log = (adminId, action, note) => query('INSERT INTO admin_logs(admin_id,action,note) VALUES($1,$2,$3)', [adminId, action, note]);

/** Public: anyone (including the supervisor, not logged in) can read the project page. */
export async function readAbout(_req, res, next) {
  try { res.set('Cache-Control', 'public, max-age=60'); res.json({ success: true, data: await getAbout() }); } catch (e) { next(e); }
}
export async function writeAbout(req, res, next) {
  try { const data = await saveAbout(req.body, req.user.id); await log(req.user.id, 'about_update', `Updated the project page (${req.body.team.length} team members)`); res.json({ success: true, data }); } catch (e) { next(e); }
}
export async function restoreAbout(req, res, next) {
  try { const data = await resetAbout(); await log(req.user.id, 'about_update', 'Restored the default project page'); res.json({ success: true, data }); } catch (e) { next(e); }
}
export async function teamPhoto(req, res, next) {
  try { const { url } = await storeImage('team', 'photos', req.body.data_url, 1_000_000); res.json({ success: true, data: { url } }); } catch (e) { next(e); }
}
