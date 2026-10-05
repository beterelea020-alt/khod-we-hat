# خد وهات — منصة تبادل المهارات (Vercel + Supabase)

واجهة عربية RTL + API على Vercel Serverless + قاعدة بيانات وSupabase Auth وStorage وRealtime.

## الميزات
- **تصميم جديد بالكامل** (مولَّد بمهارة ui-ux-pro-max): بنفسجي احترافي، وضع داكن، خط Noto Sans Arabic، صفحة دخول/تسجيل جديدة.
- **طلب تواصل قبل الشات** (مثل طلب الصداقة): لا مراسلة ولا رقم هاتف قبل القبول. الشات لحظي عبر Supabase Realtime مع احتياطي polling.
- **الملف الشخصي**: صورة، هاتف (يظهر للمتواصلين فقط)، نبذة، مهارات (أقدّمها/أريدها)، وتقييمات حقيقية (عام + تواصل/معرفة/التزام).
- **لوحة الأدمن**: إيقاف مؤقت (بمدة) / إغلاق / حظر / إعادة تفعيل الحسابات بسبب يظهر للمستخدم، مراجعة بلاغات التبادل والمستخدمين والرسائل، إعلانات الشركات (صورة + شعار + مكان + مدة + إحصاءات)، مراجعة الوظائف والتقييمات، إدارة المهارات، سجل مراجعة، إعدادات.
- **أدوار وصلاحيات** مفروضة في السيرفر: SUPER_ADMIN, ADMIN, MODERATOR, SUPPORT, ADS_MANAGER, FINANCE_MANAGER. لا يمكن لأي دور إدارة حساب بنفس رتبته أو أعلى، وتغيير الأدوار/الحذف للمدير العام فقط.
- **المساعد الذكي**: يعتمد على بيانات المنصة الحقيقية (مهارات/أشخاص/تقييمات) مع Claude لو أضفت `ANTHROPIC_API_KEY`، وإلا يعمل بقواعد عربية ذكية.

## النشر خطوة بخطوة
1. **Supabase**: أنشئ مشروعًا → SQL Editor → الصق وشغّل `supabase/schema.sql` كاملًا (يمكن إعادة تشغيله بأمان).
2. **Supabase → Authentication → URL Configuration**: ضع رابط موقعك في *Site URL* وأضف `https://your-app.vercel.app/**` في *Redirect URLs*.
3. **GitHub**: ارفع المشروع (الملف `.env` غير مرفوع أصلًا).
4. **Vercel → Add New Project** → اختر المستودع (Framework: Other). أضف المتغيرات من `.env.example`:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (**Transaction pooler – المنفذ 6543**), `DB_SSL=true`, `DB_POOL_MAX=1`, `CLIENT_URL`, `PASSWORD_RESET_REDIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`، واختياريًا `ANTHROPIC_API_KEY`.
5. **أنشئ المدير العام** (مرة واحدة من جهازك بعد وضع نفس المتغيرات في `.env` محليًا):
   ```bash
   npm install
   npm run seed          # الكتالوج + المدير العام
   # npm run seed:demo   # اختياري: بيانات تجريبية (لا تشغّله على الإنتاج الحقيقي)
   ```
6. افتح الموقع وسجّل بحساب `ADMIN_EMAIL` → ستظهر "لوحة الإدارة".

## تشغيل محلي
```bash
cp .env.example .env   # املأ القيم
npm install && npm run seed && npm run dev   # http://localhost:4000
```

## ملاحظات أمان مهمة
- مفتاح `SUPABASE_SERVICE_ROLE_KEY` للسيرفر فقط، لا تضعه في أي ملف واجهة.
- كل جداول قاعدة البيانات عليها RLS؛ الوصول من المتصفح مباشرة مقفول، وكل العمليات تمر عبر الـAPI (الاستثناء الوحيد: قراءة رسائل الشات اللحظية لأطراف المحادثة المقبولة فقط).
- محتوى محادثة خاصة لا يراه الأدمن إلا حول **رسالة تم الإبلاغ عنها**، وفتحه يُسجَّل في سجل المراجعة.
- حدّ المعدّل (rate limit) داخل الذاكرة لكل instance؛ للحماية الصلبة فعّل Vercel Firewall/WAF.
- غيّر كلمة مرور المدير العام بعد أول دخول، ولا تترك حسابات الـdemo على الإنتاج.


## v3 — Exchange Engine

The latest version adds a universal exchange layer on top of the original skill-exchange flow:

- Offers and needs for skills, services, products, time, knowledge and other items.
- Deterministic smart matching with score + explanation.
- Proposals with accept/reject/cancel/complete/dispute lifecycle.
- Automatic connection opening after proposal acceptance.
- Admin moderation for all universal listings.
- Server-side feature flags for enabling/disabling exchange types without code changes.

### Database

For a fresh database, run the full `supabase/schema.sql` in the Supabase SQL Editor.
For an existing v2 database, you can run `supabase/migrations/20261003_exchange_engine.sql` only. Both paths are idempotent and create the new `exchange_listings`, `exchange_proposals` and `exchange_proposal_events` tables plus the related indexes/settings.

### Demo data

`npm run seed:demo` now also creates sample universal exchange listings when the new tables are empty.

### Admin Control Center

The admin settings screen can enable/disable the universal engine and its asset types, plus registration, connections, chat, legacy exchanges, reviews, jobs, ads, AI and verification. These switches are enforced server-side; turning a feature off does not rely on frontend visibility alone.

---
## 📚 Documentation (v3.1)
- **[docs/LOCAL_SETUP_AR.md](docs/LOCAL_SETUP_AR.md)** — step-by-step local setup on Windows (Docker + local Supabase), tunnels, troubleshooting.
- **[docs/DEPLOY_AR.md](docs/DEPLOY_AR.md)** — deploy to Vercel + cloud Supabase (`npm run check:cloud` validates your cloud settings first).
- **[docs/CHANGES.md](docs/CHANGES.md)** — what was added on top of v3 (chat voice, About page, admin hardening, tests) and what is still unverified.
- **[docs/project-idea.html](docs/project-idea.html)** — graduation-project idea document (Arabic).
- Tests: `npm test` (needs the local Supabase database; refuses non-local databases).
