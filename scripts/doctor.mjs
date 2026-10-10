// npm run doctor  — end-to-end health check of the environment your .env points to (local OR cloud).
// For the cloud settings file:  node --env-file=.env.cloud scripts/doctor.mjs
import '../backend/src/config/env.js';
import crypto from 'node:crypto';

let problems = 0;
const ok = m => console.log('✓', m);
const bad = (m, fix) => { problems++; console.log('✗', m); if (fix) console.log('   ↳ الحل:', fix); };
const warn = (m, fix) => { console.log('⚠', m); if (fix) console.log('   ↳', fix); };
const placeholder = x => !x || /YOUR_|\[YOUR|<.*>|xxxx/i.test(x);

console.log('— فحص بيئة «خد وهات» —\n');

// 1) environment variables
const need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'];
const missing = need.filter(k => placeholder(process.env[k]));
if (missing.length) { bad(`متغيرات ناقصة أو شكلية: ${missing.join(', ')}`, 'اعمل ملف .env في فولدر المشروع (راجع docs/LOCAL_SETUP_AR.md الخطوة 2).'); process.exit(1); }
const isLocal = /127\.0\.0\.1|localhost/.test(process.env.SUPABASE_URL);
ok(`المتغيرات موجودة — البيئة: ${isLocal ? 'محلية (Docker)' : 'سحابية (' + new URL(process.env.SUPABASE_URL).host + ')'}`);
if (process.env.SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) bad('ANON_KEY و SERVICE_ROLE_KEY نفس القيمة.', 'خدهم من: npx supabase status -o env (محليًا) أو Project Settings → API.');
if (isLocal && process.env.DB_SSL !== 'false') warn('DB_SSL ليست false والقاعدة محلية.', 'ضع DB_SSL=false في .env.');

const { query, closePool } = await import('../backend/src/config/db.js');
const { supabaseAdmin, supabaseAuth } = await import('../backend/src/config/supabase.js');
let tempUser = null;

try {
  // 2) database connection
  let dbOk = false;
  try { await query('SELECT 1'); dbOk = true; ok('الاتصال بقاعدة البيانات'); }
  catch (e) {
    const m = String(e.message || e.code || e);
    bad(`تعذّر الاتصال بقاعدة البيانات: ${m}`,
      /ECONNREFUSED/.test(m) ? 'Supabase مش شغّال أو المنفذ غلط (محليًا 54322): شغّل npx supabase start.' :
      /SSL/i.test(m) ? 'غيّر DB_SSL (false محليًا، true على السحابة).' :
      /password|authentication/i.test(m) ? 'كلمة مرور القاعدة في SUPABASE_DB_URL غلط.' : 'راجع SUPABASE_DB_URL.');
  }

  if (dbOk) {
    // 3) schema
    const have = new Set((await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map(r => r.table_name));
    const tables = ['users', 'exchange_listings', 'connections', 'dm_messages', 'exchanges', 'reports', 'admin_logs', 'project_about'];
    const lack = tables.filter(t => !have.has(t));
    if (lack.length) bad(`جداول ناقصة: ${lack.join(', ')}`, 'شغّل npm run seed (يطبّق supabase/schema.sql).');
    else ok('الجداول الأساسية موجودة');
    if (have.has('dm_messages')) {
      const cols = new Set((await query(`SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages'`)).rows.map(r => r.column_name));
      const voiceCols = ['kind', 'audio_path', 'audio_seconds', 'audio_mime'].filter(c => !cols.has(c));
      if (voiceCols.length) bad(`جدول الرسائل ناقصه أعمدة الصوت: ${voiceCols.join(', ')} — الرسائل الصوتية هتفشل`, 'شغّل npm run seed.');
      else ok('أعمدة الرسائل الصوتية موجودة');
    }

    // 4) admin
    if (have.has('users')) {
      const a = await query(`SELECT count(*)::int n FROM users WHERE role='SUPER_ADMIN'`);
      a.rows[0].n ? ok('يوجد حساب Super Admin') : warn('لا يوجد حساب Super Admin.', 'ضع ADMIN_EMAIL و ADMIN_PASSWORD (10+ حروف، بدون #) ثم npm run seed.');
    }

    // 5) storage buckets
    try {
      const b = (await query(`SELECT id, public FROM storage.buckets`)).rows; const by = Object.fromEntries(b.map(x => [x.id, x.public]));
      const wantPublic = ['avatars', 'ads', 'team'];
      const gone = [...wantPublic, 'voice'].filter(x => !(x in by));
      if (gone.length) bad(`مخازن الملفات (buckets) ناقصة: ${gone.join(', ')}`, 'شغّل npm run seed.');
      else if (by.voice !== false) bad('المخزن voice عام (public)! التسجيلات الصوتية لازم تكون خاصة.', 'شغّل npm run seed أو خليه Private من Supabase → Storage.');
      else ok('مخازن الملفات موجودة (voice خاص)');
    } catch { warn('تعذّر فحص مخازن الملفات.'); }

    // 6) realtime
    try {
      const r = await query(`SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='dm_messages'`);
      r.rowCount ? ok('التحديث اللحظي للشات مفعّل (dm_messages في supabase_realtime)') : warn('dm_messages غير مضافة لـ supabase_realtime — الشات هيشتغل بالتحديث الدوري (6 ثوانٍ).', 'شغّل npm run seed.');
    } catch { /* optional */ }
  }

  // 7) Supabase Auth reachable + signup settings
  try {
    const res = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) bad(`Supabase Auth رد بخطأ ${res.status}`, res.status === 401 ? 'ANON_KEY غلط أو من مشروع تاني.' : 'تأكد أن Supabase شغّال.');
    else {
      const s = await res.json();
      ok('Supabase Auth شغّال');
      if (s.disable_signup === true) bad('التسجيل مقفول في Supabase (Disable signups).', 'Authentication → Sign In / Providers → اسمح بالتسجيل.');
      if (s.mailer_autoconfirm === false) warn('«Confirm email» مفعّل: أي عميل جديد لازم يفعّل بريده قبل الدخول.', isLocal ? 'محليًا افتح http://127.0.0.1:54324 (Mailpit) لقراءة الرسائل.' : 'للتجربة اقفله من Authentication → Providers → Email، أو اضبط SMTP.');
    }
  } catch (e) { bad(`Supabase Auth مش بيرد: ${e.message}`, 'تأكد من SUPABASE_URL وأن Supabase شغّال (npx supabase start).'); }

  // 8) the full signup path: create → sign in → delete
  try {
    const email = `doctor_${crypto.randomUUID().slice(0, 8)}@kw-test.local`, password = `Dr-${crypto.randomUUID()}`;
    const c = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (c.error) throw new Error(c.error.message);
    tempUser = c.data.user.id;
    const s = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (s.error || !s.data?.session) throw new Error(s.error?.message || 'لم تُرجع جلسة');
    ok('إنشاء مستخدم وتسجيل الدخول يعملان');
  } catch (e) {
    bad(`فشل مسار إنشاء مستخدم/دخول: ${e.message}`, /invalid api key|JWT|apikey/i.test(e.message) ? 'مفتاح ANON/SERVICE_ROLE غلط أو من مشروع تاني.' : 'راجع إعدادات Authentication في Supabase.');
  }

  // 9) voice storage round trip (bucket exists + accepts audio + signed links work)
  try {
    const path = `_doctor/${crypto.randomUUID()}.webm`;
    const body = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)]);
    const up = await supabaseAdmin.storage.from('voice').upload(path, body, { contentType: 'audio/webm', upsert: false });
    if (up.error) throw new Error(up.error.message || 'رفض الرفع');
    const sg = await supabaseAdmin.storage.from('voice').createSignedUrls([path], 60);
    await supabaseAdmin.storage.from('voice').remove([path]);
    if (sg.error || !sg.data?.[0]?.signedUrl) throw new Error(sg.error?.message || 'تعذّر إنشاء رابط موقّع');
    ok('رفع التسجيلات الصوتية وروابطها الموقّعة يعملان');
  } catch (e) { bad(`فشل رفع تسجيل صوتي تجريبي: ${e.message}`, /bucket/i.test(e.message) ? 'المخزن voice غير موجود: شغّل npm run seed.' : 'راجع SERVICE_ROLE_KEY وإعدادات Storage.'); }
} finally {
  if (tempUser) { try { await supabaseAdmin.auth.admin.deleteUser(tempUser); } catch { /* ignore */ } }
  await closePool().catch(() => {});
}

console.log(problems ? `\n✗ فيه ${problems} مشكلة — صلّحها بالترتيب من الأعلى ثم أعد: npm run doctor` : '\n✓ كل الفحوصات نجحت. لو لسه فيه مشكلة في الموقع، ابعت نص الخطأ اللي بيظهر + آخر أسطر نافذة npm run dev.');
process.exit(problems ? 1 : 0);
