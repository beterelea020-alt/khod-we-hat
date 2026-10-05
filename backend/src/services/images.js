import { assertSupabaseAdmin } from '../config/supabase.js';
import { httpError } from '../middleware/errors.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

/** Validates a data-URL image (magic bytes, size) and stores it in a public Supabase Storage bucket. */
export async function storeImage(bucket, folder, dataUrl, maxBytes) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw httpError(400, 'صيغة الصورة غير مدعومة (JPG / PNG / WebP)', 'BAD_IMAGE');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw httpError(413, 'الصورة كبيرة جدًا', 'IMAGE_TOO_LARGE');
  const real = sniff(buf);
  if (!real) throw httpError(400, 'الملف ليس صورة صالحة', 'BAD_IMAGE');
  const sb = assertSupabaseAdmin();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[real]}`;
  const up = await sb.storage.from(bucket).upload(path, buf, { contentType: real, cacheControl: '31536000', upsert: false });
  if (up.error) throw httpError(502, `تعذّر رفع الصورة: ${up.error.message}`, 'UPLOAD_FAILED');
  return { url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl, path };
}

/** Best-effort cleanup of a previous upload given its public URL. */
export async function removeByUrl(bucket, url) {
  try {
    const marker = `/${bucket}/`;
    const i = String(url || '').indexOf(marker);
    if (i < 0) return;
    await assertSupabaseAdmin().storage.from(bucket).remove([decodeURIComponent(url.slice(i + marker.length).split('?')[0])]);
  } catch { /* ignore */ }
}
