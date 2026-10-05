# تشغيل «خد وهات» على جهازك (Windows)

هذه الخطوات هي التي نجحت فعليًا. نفّذها بالترتيب من **داخل فولدر المشروع** (الذي فيه `package.json`).

## 0) المتطلبات
- **Node.js 20+**
- **Docker Desktop** (مع WSL 2) — افتحه وانتظر حتى يظهر `Engine running`.
  إن ظهر «Docker Desktop is unable to start»: افتح PowerShell كمسؤول ونفّذ `wsl --update` ثم `wsl --shutdown`، وأعد تشغيل Docker Desktop.

## 1) تشغيل Supabase المحلي (مرة في بداية كل جلسة)
```powershell
cd C:\path\to\Khod-We-Hat-v3-Exchange-Engine
npx supabase init          # مرة واحدة فقط (إن لم يوجد فولدر supabase/config.toml)
npx supabase start         # أول مرة ينزّل ~10GB من الصور، بعدها يعمل في دقيقة
```
> ⚠ شغّله من فولدر المشروع نفسه. إن شغّلته من مكان آخر سيُنشئ بيئة بأسماء مختلفة.

## 2) ملف `.env` (يُنشأ تلقائيًا بدون نسخ المفاتيح بيدك)
```powershell
$e = npx supabase status -o env 2>$null | Out-String
$anon = [regex]::Match($e, 'ANON_KEY="([^"]+)"').Groups[1].Value
$svc  = [regex]::Match($e, 'SERVICE_ROLE_KEY="([^"]+)"').Groups[1].Value
$lines = @(
 'SUPABASE_URL=http://127.0.0.1:54321',
 "SUPABASE_ANON_KEY=$anon",
 "SUPABASE_SERVICE_ROLE_KEY=$svc",
 'SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres',
 'DB_SSL=false',
 'DB_POOL_MAX=5',
 'CLIENT_URL=http://localhost:4000',
 'PASSWORD_RESET_REDIRECT_URL=http://localhost:4000/#reset-password',
 'ADMIN_EMAIL=admin@test.com',
 'ADMIN_PASSWORD=AdminTest12345',
 'ANTHROPIC_API_KEY='
)
[System.IO.File]::WriteAllLines("$PWD\.env", $lines, (New-Object System.Text.UTF8Encoding($false)))
```
- كلمة مرور الأدمن **بدون الرمز `#`** (يُعامَل كبداية تعليق ويقطع الكلمة).
- `DB_SSL=false` ضرورية محليًا.

## 2.5) أول مرة: تثبيت وتجهيز القاعدة
```powershell
npm install
npm run seed          # يطبّق schema.sql + كتالوج المهارات + حساب الأدمن (يطبع ✓ لكل خطوة)
npm run seed:demo     # اختياري: أعضاء وبيانات تجريبية
```
أعد `npm run seed` بعد أي تحديث يغيّر `supabase/schema.sql` (آمن للتكرار).

## 3) التشغيل
```powershell
npm run dev           # الموقع + الـ API على http://localhost:4000
```
- الأدمن: `admin@test.com` / `AdminTest12345`
- Studio (الجداول): http://127.0.0.1:54323 — البريد التجريبي (Mailpit): http://127.0.0.1:54324
- الموقع و`/api` على نفس العنوان (لا حاجة لسيرفر آخر).

## 4) الاختبارات الآلية
```powershell
npm test              # 118 اختبار تكامل على قاعدتك المحلية
```
ترفض الاختبارات العمل إن لم تكن القاعدة على `127.0.0.1`/`localhost`، وتحذف بياناتها (`@kw-test.local`) تلقائيًا ولا تلمس بياناتك.

## 5) مشاركة رابط مؤقت مع الأصدقاء
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:4000      # يطبع رابط https://....trycloudflare.com
```
(بديل: `ssh -p 443 -R0:localhost:4000 a.pinggy.io`). يجب أن يبقى جهازك و`npm run dev` وDocker شغّالين، وغيّر كلمة مرور الأدمن قبل المشاركة.
المحادثة تعمل عند الأصدقاء بالتحديث الدوري (6 ثوانٍ)، لأن الاتصال اللحظي يشير إلى `127.0.0.1`. الرسائل الصوتية تحتاج HTTPS (الرابط أعلاه يوفره).

## 6) أعطال شائعة
| الرسالة | السبب والحل |
|---|---|
| `ENV_MISSING` | `.env` ليس في الفولدر الرئيسي أو ناقص قيمة |
| `✗ Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars)` | كلمة المرور فيها `#` أو أقل من 10 حروف |
| `docker: command not found` | Docker غير مثبّت/غير شغّال |
| `supabase start` يفشل بخطأ SQL | تأكد أن `supabase/migrations` غير موجود أو فارغ (القاعدة تُبنى بـ `npm run seed`) |
| خطأ اتصال بالقاعدة | `DB_SSL=false` والمنفذ `54322` وأن Supabase شغّال |
| صفحة بيضاء + `Unexpected token '<'` | ملفات `frontend/js` ناقصة؛ يجب وجود 8 ملفات (`admin, about, app, auth, core, exchange-engine, people, views`) |
