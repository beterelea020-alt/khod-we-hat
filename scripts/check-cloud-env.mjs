// Pre-deploy sanity check for the CLOUD settings.   Usage:  npm run check:cloud   (reads .env.cloud, or pass a path)
import fs from 'node:fs';
import dotenv from 'dotenv';

const file = process.argv[2] || '.env.cloud';
if (!fs.existsSync(file)) { console.error(`✗ الملف ${file} غير موجود. انسخ .env.example إلى ${file} واملأه بقيم Supabase السحابي.`); process.exit(1); }
const raw = fs.readFileSync(file, 'utf8');
const v = dotenv.parse(raw);
const errors = [], warns = [];
const err = m => errors.push(m), warn = m => warns.push(m);
const placeholder = x => !x || /YOUR_|\[YOUR|<.*>|xxxx/i.test(x);

if (placeholder(v.SUPABASE_URL) || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v.SUPABASE_URL)) err('SUPABASE_URL يجب أن يكون https://<project-ref>.supabase.co (من Project Settings → API).');
for (const k of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) if (placeholder(v[k]) || v[k].length < 30) err(`${k} فاضي أو ما زال قيمة شكلية.`);
if (v.SUPABASE_ANON_KEY && v.SUPABASE_ANON_KEY === v.SUPABASE_SERVICE_ROLE_KEY) err('ANON و SERVICE_ROLE نفس القيمة؛ لا بد أن يكونا مفتاحين مختلفين.');
if (v.SUPABASE_SERVICE_ROLE_KEY && v.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable')) err('SUPABASE_SERVICE_ROLE_KEY يحتوي المفتاح العام (publishable). المطلوب المفتاح السري (service_role / secret).');

const db = v.SUPABASE_DB_URL;
if (placeholder(db)) err('SUPABASE_DB_URL فاضي أو شكلي (Connect → Transaction pooler).');
else {
  try {
    const u = new URL(db);
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) err('SUPABASE_DB_URL يشير إلى القاعدة المحلية! المطلوب رابط Supabase السحابي.');
    else if (!/pooler\.supabase\.com$/.test(u.hostname) || u.port !== '6543') warn('على Vercel استخدم Transaction pooler (المضيف …pooler.supabase.com والمنفذ 6543)، غيره قد يفشل مع الـ Serverless.');
    if (/\[|\]/.test(db)) err('رابط القاعدة ما زال فيه [YOUR-PASSWORD]؛ استبدله بكلمة مرور القاعدة.');
    // The password sits between the first ":" after the user name and the LAST "@". Raw special characters there break the URL.
    const rest = db.replace(/^postgres(?:ql)?:\/\//, ''); const at = rest.lastIndexOf('@');
    if (at > 0) { const info = rest.slice(0, at); const pass = info.slice(info.indexOf(':') + 1); if (/[@/?#\s]/.test(pass)) err('كلمة مرور القاعدة داخل الرابط فيها رمز خاص (@ / ? # أو مسافة). غيّر كلمة المرور لحروف وأرقام فقط (الأسهل)، أو رمّز الرموز (مثل @ ← %40).'); }
  } catch { err('SUPABASE_DB_URL غير صالح. إن كانت كلمة مرور القاعدة فيها رموز خاصة (@ # / : ?) يجب ترميزها (URL-encode) أو غيّر كلمة المرور لحروف وأرقام فقط.'); }
}
if (v.DB_SSL === 'false') err('DB_SSL=false يصلح للقاعدة المحلية فقط. للسحابة اجعلها true.');
if ((v.DB_POOL_MAX || '1') !== '1') warn('DB_POOL_MAX الموصى به على Vercel هو 1.');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.ADMIN_EMAIL || '')) err('ADMIN_EMAIL غير صالح.');
const pw = v.ADMIN_PASSWORD || '';
if (/^\s*ADMIN_PASSWORD\s*=.*#/m.test(raw)) err('ADMIN_PASSWORD فيه الرمز # ؛ كل ما بعده يُعتبر تعليقًا ويُقطع. استخدم كلمة مرور بدونه.');
if (pw.length < 10) err('ADMIN_PASSWORD أقل من 10 حروف.');
if (['AdminTest12345', 'Admin12345', 'password123'].includes(pw)) warn('كلمة مرور الأدمن هذه معروفة/ضعيفة؛ لا تستخدمها على موقع منشور.');

if (!/^https:\/\//.test(v.CLIENT_URL || '')) warn('CLIENT_URL ليس رابط https. بعد أول نشر ضع رابط Vercel الحقيقي هنا وفي PASSWORD_RESET_REDIRECT_URL ثم أعد النشر.');

for (const m of errors) console.log('✗', m);
for (const m of warns) console.log('⚠', m);
if (!errors.length) console.log(`✓ ${file} يبدو سليمًا${warns.length ? ' (مع تحذيرات)' : ''}.`);
process.exit(errors.length ? 1 : 0);
