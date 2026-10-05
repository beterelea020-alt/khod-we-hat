// npm run seed          → schema + skill catalog + first Super Admin (ADMIN_EMAIL / ADMIN_PASSWORD)
// npm run seed:demo     → the above + demo members, connections, chats, exchanges, reviews, ads, jobs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query, closePool } from './config/db.js';
import { assertSupabaseAdmin } from './config/supabase.js';

const demo = process.argv.includes('--demo');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sb = assertSupabaseAdmin();

await query(fs.readFileSync(path.resolve(__dirname, '../../supabase/schema.sql'), 'utf8'));
console.log('✓ schema applied');

// ───────── skill catalog (Arabic names + English aliases) ─────────
const catalog = {
  'تكنولوجيا': [['البرمجة بلغة JavaScript', 'javascript|js'], ['بايثون', 'python'], ['تطوير تطبيقات الموبايل', 'mobile app|flutter'], ['تحليل البيانات', 'data analysis'], ['الأمن السيبراني', 'cybersecurity']],
  'تصميم': [['تصميم واجهات UI/UX', 'ui|ux|figma'], ['فوتوشوب', 'photoshop'], ['تصميم الشعارات والهوية', 'logo|branding'], ['الموشن جرافيك', 'motion graphics']],
  'لغات': [['اللغة الإنجليزية', 'english'], ['اللغة الألمانية', 'german'], ['اللغة الفرنسية', 'french'], ['اللغة العربية والخط', 'arabic|calligraphy']],
  'أعمال': [['إكسل والتحليل المالي', 'excel'], ['إدارة المنتجات', 'product management'], ['المحاسبة', 'accounting'], ['ريادة الأعمال', 'entrepreneurship']],
  'تسويق': [['التسويق الرقمي', 'digital marketing'], ['كتابة المحتوى', 'copywriting|content'], ['إدارة السوشيال ميديا', 'social media']],
  'تصوير وفيديو': [['التصوير الفوتوغرافي', 'photography'], ['مونتاج الفيديو', 'video editing|premiere']],
  'تطوير ذاتي': [['مهارات الإلقاء والتقديم', 'public speaking'], ['إدارة الوقت', 'time management']],
  'حِرف ومهارات حياتية': [['الطبخ', 'cooking'], ['العزف على العود', 'oud|music'], ['الخياطة والتفصيل', 'sewing']],
};
for (const [cat, skills] of Object.entries(catalog)) {
  const c = await query('INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [cat]);
  for (const [name, aliases] of skills) {
    const s = await query('INSERT INTO skills(name,category_id) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET category_id=EXCLUDED.category_id RETURNING id', [name, c.rows[0].id]);
    for (const alias of aliases.split('|')) await query('INSERT INTO skill_aliases(skill_id,alias) VALUES($1,$2) ON CONFLICT DO NOTHING', [s.rows[0].id, alias]);
  }
}
console.log('✓ skill catalog');

async function ensureAuthUser(email, password, metadata) {
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (!created.error) return created.data.user;
  for (let page = 1; page <= 20; page++) {            // already registered → find it
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data?.users?.length) break;
  }
  throw created.error;
}

// ───────── first Super Admin ─────────
const adminEmail = process.env.ADMIN_EMAIL; const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword || adminPassword.length < 10) {
  console.error('✗ Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) in .env to create the first Super Admin.'); await closePool(); process.exit(1);
}
const adm = await ensureAuthUser(adminEmail, adminPassword, { name: 'مدير المنصة', username: 'admin' });
await query(`INSERT INTO users(id,name,username,email,role,status,is_verified,bio,location,country,city)
  VALUES($1,'مدير المنصة','admin',$2,'SUPER_ADMIN','active',true,'مدير منصة خد وهات','دمياط، مصر','مصر','دمياط')
  ON CONFLICT(id) DO UPDATE SET role='SUPER_ADMIN',status='active'`, [adm.id, adm.email.toLowerCase()]);
console.log(`✓ super admin: ${adm.email}`);

if (!demo) { console.log('Done. (Use `npm run seed:demo` for sample members and data.)'); await closePool(); process.exit(0); }

// ───────── demo data ─────────
const demoPassword = process.env.DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url');
const sk = new Map((await query('SELECT id,name FROM skills')).rows.map(x => [x.name, x.id]));
const people = [
  ['أحمد محمد', 'ahmed', 'مطوّر ويب | JavaScript & React', 'القاهرة', '01000000001', true, 'مطوّر ويب بخبرة 5 سنين، بحب أشارك اللي أعرفه وأتعلم تصميم.', ['البرمجة بلغة JavaScript:Advanced:5', 'تحليل البيانات:Intermediate:2'], ['تصميم واجهات UI/UX:Intermediate', 'اللغة الإنجليزية:Intermediate']],
  ['سارة علي', 'sara', 'مصمّمة UI/UX', 'الإسكندرية', '01000000002', true, 'مصممة منتجات رقمية، شغفي تبسيط التجارب المعقدة.', ['تصميم واجهات UI/UX:Expert:6', 'فوتوشوب:Advanced:5'], ['البرمجة بلغة JavaScript:Intermediate']],
  ['مريم حسن', 'mariam', 'مدرّسة لغة إنجليزية', 'المنصورة', '01000000003', false, 'مدرّسة إنجليزي 7 سنين، IELTS 8.0.', ['اللغة الإنجليزية:Expert:7'], ['البرمجة بلغة JavaScript:Beginner', 'التسويق الرقمي:Beginner']],
  ['يوسف إبراهيم', 'youssef', 'مصوّر ومونتير', 'دمياط', '01000000004', true, 'مصوّر أعراس ومنتجات + مونتاج.', ['التصوير الفوتوغرافي:Advanced:6', 'مونتاج الفيديو:Advanced:4'], ['التسويق الرقمي:Intermediate', 'اللغة الألمانية:Beginner']],
  ['نور خالد', 'nour', 'مسوّقة رقمية', 'الجيزة', '01000000005', false, 'أدير حملات إعلانية لمشاريع ناشئة.', ['التسويق الرقمي:Advanced:4', 'كتابة المحتوى:Advanced:3'], ['تصميم الشعارات والهوية:Beginner']],
  ['عمر سامح', 'omar', 'محاسب ومحلل مالي', 'القاهرة', '01000000006', true, 'محاسب قانوني، أحب تبسيط الإكسل.', ['إكسل والتحليل المالي:Expert:8', 'المحاسبة:Advanced:8'], ['مهارات الإلقاء والتقديم:Intermediate']],
];
const uid = new Map();
for (const [name, username, headline, city, phone, verified, bio, offers, needs] of people) {
  const au = await ensureAuthUser(`${username}@demo.khodwehat.app`, demoPassword, { name, username });
  uid.set(username, au.id);
  await query(`INSERT INTO users(id,name,username,email,phone,headline,bio,city,country,location,is_verified,language,availability)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'مصر',$9,$10,'العربية','متاح الآن') ON CONFLICT(id) DO UPDATE SET headline=EXCLUDED.headline,bio=EXCLUDED.bio,phone=EXCLUDED.phone`,
    [au.id, name, username, au.email, phone, headline, bio, city, `${city}، مصر`, verified]);
  for (const o of offers) { const [n, lvl, yrs] = o.split(':'); await query(`INSERT INTO user_skills(user_id,skill_id,type,level,experience_years) VALUES($1,$2,'offer',$3,$4) ON CONFLICT DO NOTHING`, [au.id, sk.get(n), lvl, Number(yrs || 0)]); }
  for (const o of needs) { const [n, lvl] = o.split(':'); await query(`INSERT INTO user_skills(user_id,skill_id,type,level) VALUES($1,$2,'need',$3) ON CONFLICT DO NOTHING`, [au.id, sk.get(n), lvl]); }
}
const U = k => uid.get(k);

// connections + a short chat
const conn = async (a, b, status, msg) => (await query(`INSERT INTO connections(requester_id,addressee_id,status,message,responded_at) VALUES($1,$2,$3::text,$4,CASE WHEN $3::text='pending' THEN NULL ELSE now() END)
  ON CONFLICT (LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id)) DO UPDATE SET status=EXCLUDED.status RETURNING id`, [U(a), U(b), status, msg])).rows[0].id;
const c1 = await conn('ahmed', 'sara', 'accepted', 'أهلًا سارة! عايز أتعلم UI/UX وأعلّمك JavaScript.');
await conn('mariam', 'ahmed', 'pending', 'أهلًا أحمد، حابّة أتعلم أساسيات البرمجة.');
await conn('youssef', 'nour', 'accepted', 'تعالي نتبادل تسويق ومونتاج.');
if (!(await query('SELECT 1 FROM dm_messages WHERE connection_id=$1 LIMIT 1', [c1])).rowCount) {
  for (const [from, body] of [['ahmed', 'أهلًا سارة! جاهز نبدأ التبادل؟'], ['sara', 'أهلًا أحمد 👋 أكيد، نبدأ بـ Figma وبعدها JavaScript.'], ['ahmed', 'تمام، إمتى يناسبك؟']])
    await query('INSERT INTO dm_messages(connection_id,sender_id,body) VALUES($1,$2,$3)', [c1, U(from), body]);
}

// exchanges (+ reviews so profiles show ratings)
async function exchange(from, to, offered, requested, status, reviews = []) {
  const rq = await query(`INSERT INTO exchange_requests(sender_id,receiver_id,offered_skill_id,requested_skill_id,message,status) VALUES($1,$2,$3,$4,'طلب تجريبي',$5::text) RETURNING id`, [U(from), U(to), sk.get(offered), sk.get(requested), status === 'pending' ? 'pending' : 'accepted']);
  const ex = await query(`INSERT INTO exchanges(request_id,sender_id,receiver_id,offered_skill_id,requested_skill_id,deal_type,status,message,accepted_at,completed_at) VALUES($1,$2,$3,$4,$5,'swap',$6::text,'طلب تجريبي',now(),CASE WHEN $6::text='completed' THEN now() END) RETURNING id`, [rq.rows[0].id, U(from), U(to), sk.get(offered), sk.get(requested), status]);
  await query(`INSERT INTO exchange_participants(exchange_id,user_id,role) VALUES($1,$2,'sender'),($1,$3,'receiver')`, [ex.rows[0].id, U(from), U(to)]);
  await query(`INSERT INTO exchange_events(exchange_id,actor_id,event_type,note) VALUES($1,$2,'request_created','تم إرسال الطلب')`, [ex.rows[0].id, U(from)]);
  for (const [rev, reviewee, stars, comment] of reviews) await query(`INSERT INTO reviews(exchange_id,reviewer_id,reviewee_id,rating,communication_rating,knowledge_rating,commitment_rating,comment) VALUES($1,$2,$3,$4,$4,$4,$4,$5)`, [ex.rows[0].id, U(rev), U(reviewee), stars, comment]);
  return ex.rows[0].id;
}
if (!(await query('SELECT 1 FROM exchanges LIMIT 1')).rowCount) {
  await exchange('ahmed', 'sara', 'البرمجة بلغة JavaScript', 'تصميم واجهات UI/UX', 'in_progress');
  await exchange('youssef', 'nour', 'مونتاج الفيديو', 'التسويق الرقمي', 'completed', [['youssef', 'nour', 5, 'نور محترفة وملتزمة جدًا، تعلمت منها الكتير.'], ['nour', 'youssef', 5, 'يوسف شاطر ومنظم، مونتاج ممتاز.']]);
  const done = await exchange('omar', 'ahmed', 'إكسل والتحليل المالي', 'البرمجة بلغة JavaScript', 'completed', [['omar', 'ahmed', 4, 'شرح واضح ومنظم.'], ['ahmed', 'omar', 5, 'أستاذ عمر شرحه ممتاز في الإكسل.']]);
  const pend = await exchange('mariam', 'ahmed', 'اللغة الإنجليزية', 'البرمجة بلغة JavaScript', 'pending');
  await query(`INSERT INTO reports(reporter_id,target_type,target_id,reported_user_id,exchange_id,reason,description) VALUES($1,'exchange',$2,$3,$2,'عدم التزام بالموعد','تأخر عن الجلسة مرتين بدون إبلاغ.')`, [U('mariam'), pend, U('ahmed')]);
}
await query(`INSERT INTO reports(reporter_id,target_type,target_id,reported_user_id,reason,description) SELECT $1,'user',$2,$2,'محتوى مضلل','بلاغ تجريبي للوحة الإدارة.' WHERE NOT EXISTS(SELECT 1 FROM reports WHERE reason='محتوى مضلل')`, [U('sara'), U('nour')]);

// company ads + jobs
if (!(await query('SELECT 1 FROM advertisements LIMIT 1')).rowCount) {
  await query(`INSERT INTO advertisements(title,description,advertiser_name,placement,status,priority,cta_label,target_url) VALUES
    ('ابدأ مشروعك بدعم من شركة تكنو ديلتا','حلول سحابية للشركات الناشئة — خصم 20% لأعضاء خد وهات.','تكنو دلتا','HOME_HERO','active',20,'اطلب العرض','https://example.com'),
    ('دورات تدريبية معتمدة','تعلّم مهارات سوق العمل مع أكاديمية المستقبل.','أكاديمية المستقبل','HOME_FEED','active',10,'سجّل الآن','https://example.com')`);
}
await query(`INSERT INTO job_posts(owner_id,title,description,company,location,job_type,required_skills,status) SELECT $1,'مطلوب مدرّب تصميم واجهات','نبحث عن مصمم لديه خبرة عملية في Figma لتدريب فريق من المبتدئين لمدة شهر.','استوديو بكسل','عن بُعد','remote','Figma, UI/UX','published' WHERE NOT EXISTS(SELECT 1 FROM job_posts)`, [U('sara')]);


// universal exchange-engine demo listings
const listingCount = await query('SELECT count(*)::int n FROM exchange_listings');
if (listingCount.rows[0].n === 0) {
  const listings = [
    [U('ahmed'),'offer','service','أصمم لك Landing Page مقابل تصميم هوية', 'أقدم صفحة هبوط سريعة ومتجاوبة لمشروعك مقابل تصميم لوجو وهوية بسيطة.', null, null, 'القاهرة','online', '', 1800],
    [U('sara'),'offer','service','UI/UX Audit لموقع أو تطبيق', 'أراجع تجربة المستخدم والواجهات وأعطيك تقريرًا عمليًا مقابل تطوير صفحة Frontend.', null, null, 'الإسكندرية','online', '', 1200],
    [U('mariam'),'need','knowledge','أحتاج محادثة إنجليزية أسبوعية', 'أبحث عن شخص يمارس الإنجليزية معي ساعة مرتين أسبوعيًا مقابل مساعدة في أساسيات البرمجة.', null, null, 'المنصورة','online', 'مرن في المواعيد', null],
    [U('youssef'),'offer','service','تصوير منتجات لمتجر محلي', 'تصوير 20 منتجًا مع إضاءة بسيطة وتسليم صور جاهزة للنشر مقابل خدمة تسويق رقمي.', null, null, 'دمياط','in_person', 'التصوير داخل دمياط', 900],
    [U('nour'),'need','service','أحتاج مونتاج Reels لعلامة تجارية', 'أحتاج 8 فيديوهات قصيرة شهريًا مقابل إدارة حملة إعلانية أو كتابة محتوى.', null, null, 'الجيزة','both', '', 1500],
    [U('omar'),'offer','time','ساعتان Excel وتحليل بيانات أسبوعيًا', 'أشرح Excel والتحليل المالي للمبتدئين مقابل ساعتين في مهارة أخرى.', null, null, 'القاهرة','online', '', null],
    [U('ahmed'),'need','service','أحتاج مصمم شعار لمشروع ناشئ', 'لدي مشروع جانبي وأحتاج شعارًا وهوية أولية، والمقابل تطوير صفحة تعريفية.', null, null, 'القاهرة','online', '', 1500],
  ];
  for (const row of listings) await query(`INSERT INTO exchange_listings(owner_id,mode,asset_type,title,description,category_id,skill_id,city,delivery_mode,condition_note,estimated_value,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published')`, row);
  console.log('✓ universal exchange listings');
}

console.log(`✓ demo data. Demo members: <username>@demo.khodwehat.app  (password: ${demoPassword})`);
console.log('  usernames: ahmed, sara, mariam, youssef, nour, omar');
await closePool();
