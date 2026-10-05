import { query } from '../config/db.js';

const role = (r, bio = '') => ({ name: 'اسم العضو', role: r, bio, photo_url: '', linkedin: '', github: '' });

/** Shown until an admin edits the page. Everything here is editable from Admin → "عن المشروع". */
export const DEFAULT_ABOUT = {
  project: {
    name: 'خد وهات',
    tagline: 'خُد اللي تحتاجه، وهات اللي تقدر عليه',
    description: 'منصة عربية لتبادل المنافع بلا نقود: مهارات وخدمات ومنتجات ووقت ومعرفة، مع تواصل آمن وتقييم موثّق وإشراف.',
    problem: 'كثيرون لديهم مهارات أو أغراض أو وقت فائض، وآخرون يحتاجونها ولا يستطيعون الدفع. والتبادل عبر مجموعات التواصل الاجتماعي عشوائي بلا توثيق ولا حماية.',
    goals: [
      'تنظيم التبادل بين الأعضاء بخطوات واضحة: طلب، قبول، تنفيذ، تأكيد الطرفين، ثم تقييم.',
      'مطابقة العروض بالطلبات لتسهيل الوصول للشريك المناسب.',
      'حماية التواصل: لا أحد يكلّم أحدًا إلا بموافقته، والمحادثة محصورة بطرفي التبادل.',
      'بناء الثقة عبر التقييم الموثّق والبلاغات والإشراف.',
    ],
    features: ['عروض وطلبات بستة أنواع', 'شات نصي وصوتي', 'تبادل بتأكيد الطرفين', 'تقييمات موثّقة', 'لوحة إدارة بأدوار وصلاحيات', 'واجهة عربية متجاوبة'],
  },
  academic: { university: '', faculty: '', department: '', year: '', supervisor: { name: '', title: 'المشرف على المشروع', photo_url: '' } },
  team: [
    role('قائد الفريق', 'الخطة والتواصل وتجميع التقرير النهائي'), role('محلل متطلبات', 'وثيقة SRS والاستبيان'), role('محلل ونمذجة', 'Use Case وDFD وSequence'),
    role('مصمم قاعدة البيانات', 'ERD وسياسات الأمان'), role('باك إند: الهوية والإدارة', 'الصلاحيات ولوحة الإدارة'), role('باك إند: محرك التبادل', 'العروض والتبادل والتقييم'),
    role('باك إند: الشات والصوت', 'المحادثات والرسائل الصوتية'), role('فرونت إند: الصفحات', 'الرئيسية والعروض والبروفايل'), role('فرونت إند: التفاعل', 'الشات والإشعارات والموبايل'),
    role('مصمم UI/UX', 'نظام التصميم وصفحة عن المشروع'), role('مهندس اختبار', 'الاختبارات الآلية واختبار المستخدمين'), role('أمان ونشر', 'النشر والحماية والنسخ الاحتياطي'),
  ],
  tech: [
    { group: 'الواجهة', items: ['HTML5', 'CSS3', 'JavaScript'] },
    { group: 'الخادم', items: ['Node.js', 'Express'] },
    { group: 'قاعدة البيانات والخدمات', items: ['PostgreSQL', 'Supabase Auth', 'Supabase Storage', 'Supabase Realtime'] },
    { group: 'الجودة والأمان', items: ['Zod', 'Helmet', 'Vitest', 'Supertest'] },
    { group: 'النشر', items: ['Vercel', 'Supabase'] },
  ],
  contact: { email: '', github: '', website: '' },
};

export async function getAbout() {
  const r = await query('SELECT data,updated_at FROM project_about WHERE id=1');
  const saved = r.rowCount ? r.rows[0].data : null;
  return { ...(saved && Object.keys(saved).length ? saved : DEFAULT_ABOUT), updated_at: r.rowCount ? r.rows[0].updated_at : null, is_default: !(saved && Object.keys(saved).length) };
}
export async function saveAbout(data, userId) {
  await query(`INSERT INTO project_about(id,data,updated_at,updated_by) VALUES(1,$1,now(),$2)
    ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=now(),updated_by=EXCLUDED.updated_by`, [JSON.stringify(data), userId]);
  return getAbout();
}
export async function resetAbout() { await query('DELETE FROM project_about WHERE id=1'); return getAbout(); }
