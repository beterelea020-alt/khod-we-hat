import { query } from '../config/db.js';
import { storeImage, removeByUrl } from '../services/images.js';

export async function avatar(req, res, next) {
  try {
    const old = req.user.avatar_url;
    const { url } = await storeImage('avatars', req.user.id, req.body.data_url, 1_000_000);
    await query('UPDATE users SET avatar_url=$1,updated_at=now() WHERE id=$2', [url, req.user.id]);
    if (old) removeByUrl('avatars', old);
    res.json({ success: true, data: { avatar_url: url } });
  } catch (e) { next(e); }
}

export async function removeAvatar(req, res, next) {
  try {
    const old = req.user.avatar_url;
    await query("UPDATE users SET avatar_url='',updated_at=now() WHERE id=$1", [req.user.id]);
    if (old) removeByUrl('avatars', old);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function adImage(req, res, next) {
  try {
    const { url } = await storeImage('ads', req.user.id, req.body.data_url, 1_800_000);
    res.json({ success: true, data: { url } });
  } catch (e) { next(e); }
}
