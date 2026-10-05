import { query } from '../config/db.js';
import { getSetting } from '../services/settings.js';

const PLACEMENTS = ['HOME_HERO', 'HOME_FEED', 'BROWSE', 'SIDEBAR'];

export async function listActive(req, res, next) {
  try {
    if (!(await getSetting('advertising_enabled'))) return res.json({ success: true, data: [] });
    const placement = PLACEMENTS.includes(req.query.placement) ? req.query.placement : null;
    const r = await query(
      `SELECT id,title,description,image_url,logo_url,target_url,cta_label,advertiser_name,placement,priority FROM advertisements
       WHERE status='active' AND (start_at IS NULL OR start_at<=now()) AND (end_at IS NULL OR end_at>=now()) ${placement ? 'AND placement=$1' : ''}
       ORDER BY priority DESC,created_at DESC LIMIT 12`, placement ? [placement] : []);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
}

const sid = req => String(req.body?.sid || '').slice(0, 64) || null;

/** One impression per ad per visitor per hour. */
export async function impression(req, res, next) {
  try {
    const s = sid(req);
    if (s) {
      const dup = await query(`SELECT 1 FROM ad_impressions WHERE advertisement_id=$1 AND session_identifier=$2 AND created_at>now()-interval '1 hour' LIMIT 1`, [req.params.id, s]);
      if (dup.rowCount) return res.json({ success: true });
    }
    await query(`INSERT INTO ad_impressions(advertisement_id,user_id,session_identifier) SELECT id,$2,$3 FROM advertisements WHERE id=$1 AND status='active'`, [req.params.id, req.user?.id || null, s]);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function click(req, res, next) {
  try {
    const s = sid(req);
    if (s) {
      const dup = await query(`SELECT 1 FROM ad_clicks WHERE advertisement_id=$1 AND session_identifier=$2 AND created_at>now()-interval '10 minutes' LIMIT 1`, [req.params.id, s]);
      if (dup.rowCount) return res.json({ success: true });
    }
    await query(`INSERT INTO ad_clicks(advertisement_id,user_id,session_identifier) SELECT id,$2,$3 FROM advertisements WHERE id=$1 AND status='active'`, [req.params.id, req.user?.id || null, s]);
    res.json({ success: true });
  } catch (e) { next(e); }
}
