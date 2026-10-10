import crypto from 'node:crypto';
import { assertSupabaseAdmin } from '../config/supabase.js';
import { httpError } from '../middleware/errors.js';

export const VOICE_BUCKET = 'voice';
export const VOICE_MAX_BYTES = 1_500_000;      // ~2 min of Opus at the bitrate the app records with
export const VOICE_MAX_SECONDS = 120;
const SIGN_SECONDS = 6 * 3600;
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };

/** Identifies the real container from magic bytes — the declared MIME type is never trusted. */
function sniff(b) {
  if (b.length > 16 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b.length > 16 && b.slice(0, 4).toString('latin1') === 'OggS') return 'audio/ogg';
  if (b.length > 16 && b.slice(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  return null;
}

export function parseVoice(dataUrl) {
  const m = /^data:audio\/(?:webm|ogg|mp4)(?:;[a-z0-9=.\-]+)*;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
  if (!m) throw httpError(400, 'صيغة التسجيل غير مدعومة', 'BAD_AUDIO');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > VOICE_MAX_BYTES) throw httpError(413, 'التسجيل كبير جدًا', 'AUDIO_TOO_LARGE');
  const mime = sniff(buf);
  if (!mime) throw httpError(400, 'الملف ليس تسجيلًا صوتيًا صالحًا', 'BAD_AUDIO');
  return { buf, mime, ext: EXT[mime] };
}

export async function storeVoice(connectionId, { buf, mime, ext }) {
  const path = `${connectionId}/${crypto.randomUUID()}.${ext}`;
  const up = await assertSupabaseAdmin().storage.from(VOICE_BUCKET).upload(path, buf, { contentType: mime, cacheControl: '3600', upsert: false });
  if (up.error) { console.error('[voice] storage upload failed:', up.error.message || up.error, '— is the "voice" bucket created? run: npm run seed'); throw httpError(502, 'تعذّر رفع التسجيل', 'UPLOAD_FAILED'); }
  return path;
}

export async function removeVoice(path) {
  try { await assertSupabaseAdmin().storage.from(VOICE_BUCKET).remove([path]); } catch { /* best effort */ }
}

/** Replaces audio_path with a short-lived signed audio_url. The storage path itself is never sent to clients. */
export async function withAudioUrls(rows, expiresIn = SIGN_SECONDS) {
  const voice = rows.filter(r => r.kind === 'voice' && r.audio_path);
  const urls = new Map();
  if (voice.length) {
    try {
      const res = await assertSupabaseAdmin().storage.from(VOICE_BUCKET).createSignedUrls(voice.map(r => r.audio_path), expiresIn);
      for (const x of res.data || []) if (x.signedUrl) urls.set(x.path, x.signedUrl);
    } catch { /* leave audio_url null; the client shows an "unavailable" state */ }
  }
  return rows.map(({ audio_path, ...r }) => (r.kind === 'voice' ? { ...r, audio_url: urls.get(audio_path) || null } : r));
}
