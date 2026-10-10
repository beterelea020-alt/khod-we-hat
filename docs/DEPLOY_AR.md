# نشر «خد وهات» على Vercel + Supabase (تجربة حقيقية)

> الخطوات مبنية على قراءة إعدادات المشروع (`vercel.json`, `api/index.js`, `README.md`). أسماء الأزرار في لوحات Supabase وVercel قد تتغير قليلًا. **لم تُجرَّب على نشر فعلي بعد** — فاعتبر الدقائق الأولى تجربة، وأي خطأ ابعته للمراجعة.

## قبل البدء
حسابات مجانية: **GitHub** و**Supabase** و**Vercel**. ومثبّت عندك Git وNode 20+.

## 1) مشروع Supabase السحابي
1. New project: اختر اسمًا، **كلمة مرور لقاعدة البيانات (حروف وأرقام فقط، واحفظها)**، وأقرب منطقة.
2. **المفاتيح:** Project Settings → API (أو API Keys). خذ: `Project URL` و`anon` و`service_role`.
   إن ظهرت لك مفاتيح بصيغة `sb_publishable_…` / `sb_secret_…` فقط، افتح تبويب **Legacy API keys** وخذ منه مفاتيح `eyJ…` (هذه التي جُرّب المشروع بها محليًا).
3. **رابط القاعدة:** اضغط **Connect** ← **Transaction pooler** (المنفذ **6543**) وانسخ الرابط، واستبدل `[YOUR-PASSWORD]` بكلمة المرور.

## 2) ملف `.env.cloud` (للسحابة فقط، لا يُرفع إلى GitHub)
انسخ `.env.example` إلى `.env.cloud` واملأه:
```env
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.xxxxxxxx:كلمة_المرور@aws-0-REGION.pooler.supabase.com:6543/postgres
DB_SSL=true
DB_POOL_MAX=1
CLIENT_URL=https://your-app.vercel.app
PASSWORD_RESET_REDIRECT_URL=https://your-app.vercel.app/#reset-password
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=كلمة_مرور_قوية_بدون_الرمز_#
```
ثم افحصه:
```powershell
npm run check:cloud
```
يجب أن يطبع `✓`. يمسك: قيم شكلية، رابط قاعدة محلي، `DB_SSL=false`، رمز `#` في كلمة المرور، رمز خاص في كلمة مرور القاعدة، إلخ.

## 3) تجهيز القاعدة السحابية وإنشاء الأدمن (من جهازك)
```powershell
node --env-file=.env.cloud backend/src/seed.js
```
يطبّق `schema.sql` + كتالوج المهارات + حساب الأدمن، ويطبع ✓ لكل خطوة. (الأمر يقرأ `.env.cloud` ولا يلمس `.env` المحلي.)
- لو فشل تطبيق الـ schema عبر الـ pooler: افتح Supabase → **SQL Editor**، والصق محتوى `supabase/schema.sql` كاملًا وشغّله، ثم أعد الأمر أعلاه.
- **لا تشغّل `--demo` على موقع حقيقي** (حسابات بكلمات مرور معروفة).

## 4) إعدادات Supabase Auth
- **Authentication → URL Configuration:** *Site URL* = رابط Vercel (تعدّله بعد الخطوة 6)، وأضف `https://your-app.vercel.app/**` في *Redirect URLs*.
- **Authentication → Providers → Email:** للتجربة مع الأصدقاء أوقف **Confirm email** كي يسجّلوا فورًا (وإلا اضبط SMTP خاصًا، فالافتراضي محدود جدًا).
- **Database → Publications:** تأكد أن `dm_messages` ضمن `supabase_realtime`.
- **Storage:** يجب أن ترى `avatars` و`ads` و`team` (عامة) و`voice` (**خاصة**).

## 5) GitHub
```powershell
git init
git add .
git status        # تأكد أنه لا يظهر .env ولا .env.cloud
git commit -m "Khod We Hat v3.1"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
(المستودع **Private**.)

## 6) Vercel
1. **Add New → Project** ← اختر المستودع ← Framework: **Other** ← لا تغيّر شيئًا في Build (الإعدادات في `vercel.json`).
2. **Environment Variables:** أضف قيم `.env.cloud` **ما عدا** `ADMIN_EMAIL` و`ADMIN_PASSWORD` (غير لازمين وقت التشغيل).
3. **Deploy.** ستأخذ رابطًا مثل `https://khod-we-hat.vercel.app`.
4. ضع الرابط في `CLIENT_URL` و`PASSWORD_RESET_REDIRECT_URL` (Vercel) وفي Supabase *Site URL*، ثم **Redeploy**.

## 7) فحص سريع بعد النشر
- من جهازك، على إعدادات السحابة: `node --env-file=.env.cloud scripts/doctor.mjs` (يجرّب إنشاء مستخدم ورفع تسجيل صوتي فعليًا).
- `https://<app>/api/health` ← `"status":"ok"`
- `https://<app>/api/about` ← بيانات
- `https://<app>/#/about` ← الصفحة تفتح بدون تسجيل دخول
- سجّل الدخول بالأدمن ← تظهر «لوحة الإدارة»

## 8) سيناريو تجربة العميل (حسابان على جهازين)
1. حساب A وحساب B: تسجيل، وإكمال البروفايل وإضافة مهارة لكل منهما.
2. A ينشر عرضًا، B يرسل مقترحًا، A يقبل ← يجب أن تُفتح محادثة تلقائيًا.
3. تبادل رسائل نصية، ثم **رسالة صوتية** من الموبايل (تحتاج HTTPS وإذن الميكروفون) ← تظهر عند الآخر، وتظهر ✓✓ للمرسل.
4. تبادل مهارات: طلب ← قبول ← بدء ← إتمام من الطرفين ← تقييم.
5. بلاغ عن رسالة من B ← الأدمن يفتح البلاغ ويسمع التسجيل.
6. الأدمن: إيقاف مستخدم ثم إعادته، وتعديل صفحة «عن المشروع» (اسم الجامعة والفريق والصور).
7. جرّب كل شيء على الموبايل أيضًا.

## أعطال شائعة
| العرَض | السبب والحل |
|---|---|
| `ENV_MISSING` / `... is not configured on the server` | متغير ناقص في Vercel ← أضفه ثم **Redeploy** |
| خطأ اتصال بالقاعدة | المنفذ 6543، `DB_SSL=true`، وكلمة المرور صحيحة وبحروف وأرقام |
| الميكروفون لا يعمل | يتطلب HTTPS؛ و`vercel.json` يسمح به الآن (`microphone=(self)`) |
| روابط البريد تفتح على `localhost` | *Site URL* في Supabase لم يُضبط |
| الرسائل تتأخر ~6 ثوانٍ | Realtime لا يعمل؛ راجع Publications، ويعمل الاستعلام الدوري كاحتياط |
| 500 غامض | Vercel → Project → **Logs** وابحث عن آخر خطأ |

## ملاحظات
- مشروع Supabase المجاني **يُوقف نفسه بعد فترة عدم نشاط**؛ تأكد أنه يعمل قبل أي عرض أو مناقشة.
- حدود الباقات المجانية تتغير؛ راجع صفحات الأسعار الرسمية.
- كل `git push` إلى `main` ينشر تلقائيًا. وأي تعديل على `schema.sql` يلزمه إعادة تشغيل أمر الخطوة 3.
- غيّر كلمة مرور الأدمن بعد أول دخول، ولا تضع `service_role` في أي ملف واجهة.
