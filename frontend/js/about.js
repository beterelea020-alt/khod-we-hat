'use strict';
/* ───────── About the project: public page + admin editor ───────── */
const abInitial = n => (String(n || '?').trim()[0] || '?');
function abPhoto(url, name, cls = '') {
  const u = safeUrl(url);
  if (u) return `<img class="ab-photo ${cls}" src="${esc(u)}" alt="${esc(name)}" loading="lazy" decoding="async">`;
  return `<span class="ab-photo ab-initials ${cls}" aria-hidden="true">${name === 'اسم العضو' ? icon('user') : esc(abInitial(name))}</span>`;
}
/** A photo that fails to load (deleted file, bad link) falls back to the initial instead of showing broken-image text. */
function abFixPhotos(root) {
  root.querySelectorAll('img.ab-photo').forEach(img => {
    const fallback = () => { const sp = document.createElement('span'); sp.className = `${img.className} ab-initials`; sp.setAttribute('aria-hidden', 'true'); sp.textContent = abInitial(img.alt); img.replaceWith(sp); };
    if (img.complete && img.naturalWidth === 0) fallback(); else img.addEventListener('error', fallback, { once: true });
  });
}
const abLink = (url, label) => { const u = safeUrl(url); return u ? `<a class="chip b" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : ''; };

function aboutBody(d) {
  const p = d.project || {}, ac = d.academic || {}, sup = ac.supervisor || {}, c = d.contact || {};
  const meta = [ac.university, ac.faculty, ac.department, ac.year].filter(Boolean);
  const list = a => (a || []).length ? `<ul class="ab-list">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const team = (d.team || []).map(m => `<article class="card ab-member">${abPhoto(m.photo_url, m.name)}<h3>${esc(m.name)}</h3><div class="ab-role">${esc(m.role)}</div>${m.bio ? `<p class="small muted">${esc(m.bio)}</p>` : ''}<div class="row gap-s wrap" style="justify-content:center">${abLink(m.linkedin, 'LinkedIn')}${abLink(m.github, 'GitHub')}</div></article>`).join('');
  const contact = [c.email ? `<a class="chip b" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '', abLink(c.github, 'GitHub'), abLink(c.website, 'الموقع')].filter(Boolean).join('');
  return `<section class="ab-hero"><span class="eyebrow">مشروع تخرج · نظم المعلومات</span><h1>${esc(p.name)}</h1>${p.tagline ? `<p class="ab-tag">${esc(p.tagline)}</p>` : ''}${p.description ? `<p>${esc(p.description)}</p>` : ''}${meta.length ? `<div class="ab-meta">${meta.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</section>
    ${p.problem ? `<section class="card ab-sec"><h2>المشكلة</h2><p>${esc(p.problem)}</p></section>` : ''}
    ${(p.goals || []).length ? `<section class="card ab-sec"><h2>أهداف المشروع</h2>${list(p.goals)}</section>` : ''}
    ${(p.features || []).length ? `<section class="ab-sec"><h2>أبرز المزايا</h2><div class="row wrap gap-s">${p.features.map(x => `<span class="chip g">${esc(x)}</span>`).join('')}</div></section>` : ''}
    ${sup.name ? `<section class="ab-sec"><h2>الإشراف الأكاديمي</h2><article class="card ab-sup">${abPhoto(sup.photo_url, sup.name, 'lg')}<div><div class="xs muted">${esc(sup.title || 'المشرف على المشروع')}</div><h3>${esc(sup.name)}</h3></div></article></section>` : ''}
    ${(d.team || []).length ? `<section class="ab-sec"><h2>فريق العمل</h2><div class="ab-team">${team}</div></section>` : ''}
    ${(d.tech || []).length ? `<section class="ab-sec"><h2>التقنيات المستخدمة</h2><div class="ab-tech">${d.tech.map(g => `<div class="card flat"><b>${esc(g.group)}</b><div class="row wrap gap-s mt-s">${(g.items || []).map(i => `<span class="chip">${esc(i)}</span>`).join('')}</div></div>`).join('')}</div></section>` : ''}
    ${contact ? `<section class="ab-sec"><h2>تواصل معنا</h2><div class="row wrap gap-s">${contact}</div></section>` : ''}`;
}

/** Inside the app (logged in). */
async function viewAbout(el) {
  el.innerHTML = skeletons(2);
  const d = await get('/about', { auth: false });
  el.innerHTML = `<div class="ab-page">${aboutBody(d)}</div>`; abFixPhotos(el);
}

/** Outside the app — anyone (e.g. the supervisor) can open #/about without an account. */
async function renderAboutPublic() {
  $('#app').innerHTML = `<header class="ab-top"><a class="brand" href="#/about"><span class="mark">${icon('swap')}</span> خد وهات</a><button class="btn primary sm" id="ab-login">تسجيل الدخول</button></header><main class="ab-page" id="view" tabindex="-1">${skeletons(2)}</main>`;
  $('#ab-login').onclick = () => { history.replaceState(null, '', location.pathname); renderAuth(); };
  try { const d = await get('/about', { auth: false }); $('#view').innerHTML = aboutBody(d); abFixPhotos($('#view')); document.title = `${d.project?.name || 'خد وهات'} — عن المشروع`; }
  catch (e) { $('#view').innerHTML = `<div class="card">${emptyState('info', esc(errMsg(e)), '<button class="btn primary" onclick="renderAboutPublic()">إعادة المحاولة</button>')}</div>`; }
}

/* ── Admin editor (permission: settings) ── */
async function admAbout(box) {
  const strip = ({ updated_at, is_default, ...rest }) => rest;
  const raw = await get('/admin/about'); const isDefault = raw.is_default;
  let d = structuredClone(strip(raw));
  const setP = (path, val) => { const ks = path.split('.'); let o = d; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = val; };
  const f = (path, label, val, { area = false, ph = '', max = 200 } = {}) => `<div class="field"><label>${label}</label>${area ? `<textarea class="input" data-p="${path}" rows="3" maxlength="${max}" placeholder="${esc(ph)}">${esc(val)}</textarea>` : `<input class="input" data-p="${path}" value="${esc(val)}" maxlength="${max}" placeholder="${esc(ph)}">`}</div>`;
  const lines = (path, label, arr, ph) => `<div class="field"><label>${label} <span class="xs muted">(سطر لكل عنصر)</span></label><textarea class="input" data-lines="${path}" rows="${Math.max(3, (arr || []).length + 1)}" placeholder="${esc(ph || '')}">${esc((arr || []).join('\n'))}</textarea></div>`;
  const photoField = (path, url, name) => `<div class="ab-ph-edit">${abPhoto(url, name || '?')}<div><label class="btn sm">اختيار صورة<input type="file" accept="image/*" hidden data-photo="${path}"></label>${safeUrl(url) ? `<button type="button" class="btn ghost sm" data-act="rmphoto" data-path="${path}">حذف الصورة</button>` : ''}</div></div>`;
  const draw = () => {
    const y = window.scrollY;
    box.innerHTML = `<div class="settings-hero card"><div><span class="eyebrow">PROJECT PAGE</span><h2>صفحة «عن المشروع»</h2><p class="muted">اكتب بيانات المشروع والفريق والمشرف هنا. ${isDefault ? 'الصفحة الآن تعرض النص الافتراضي لحد ما تحفظ.' : ''} الصفحة عامة، ويفتحها أي شخص من الرابط <b dir="ltr">#/about</b> من غير تسجيل دخول.</p></div><a class="btn" href="#/about" target="_blank" rel="noopener">معاينة الصفحة</a></div>
    <section class="card"><h3>المشروع</h3>${f('project.name', 'اسم المشروع', d.project.name, { max: 80 })}${f('project.tagline', 'الشعار', d.project.tagline)}${f('project.description', 'وصف مختصر', d.project.description, { area: true, max: 1500 })}${f('project.problem', 'المشكلة التي يحلها', d.project.problem, { area: true, max: 1500 })}${lines('project.goals', 'الأهداف', d.project.goals)}${lines('project.features', 'أبرز المزايا', d.project.features)}</section>
    <section class="card mt"><h3>الجهة الأكاديمية والمشرف</h3><div class="grid2">${f('academic.university', 'الجامعة', d.academic.university, { max: 150 })}${f('academic.faculty', 'الكلية', d.academic.faculty, { max: 150 })}${f('academic.department', 'القسم', d.academic.department, { max: 150 })}${f('academic.year', 'العام الدراسي', d.academic.year, { max: 40, ph: '2026/2027' })}</div><div class="grid2">${f('academic.supervisor.name', 'اسم المشرف', d.academic.supervisor.name, { max: 120, ph: 'د. ...' })}${f('academic.supervisor.title', 'اللقب / الوظيفة', d.academic.supervisor.title, { max: 120 })}</div>${photoField('academic.supervisor', d.academic.supervisor.photo_url, d.academic.supervisor.name)}</section>
    <section class="card mt"><div class="row between"><h3>فريق العمل (${arNum(d.team.length)})</h3><button class="btn primary sm" data-act="addm">إضافة عضو</button></div>${d.team.map((m, i) => `<div class="ab-edit-member card flat"><div class="row between"><b>عضو ${arNum(i + 1)}</b><div class="row gap-s"><button class="btn ghost sm" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="تحريك لأعلى">↑</button><button class="btn ghost sm" data-act="down" data-i="${i}" ${i === d.team.length - 1 ? 'disabled' : ''} aria-label="تحريك لأسفل">↓</button><button class="btn danger sm" data-act="rmm" data-i="${i}">حذف</button></div></div>${photoField(`team.${i}`, m.photo_url, m.name)}<div class="grid2">${f(`team.${i}.name`, 'الاسم', m.name, { max: 100 })}${f(`team.${i}.role`, 'الدور في المشروع', m.role, { max: 120 })}</div>${f(`team.${i}.bio`, 'نبذة عن المهام', m.bio, { max: 300 })}<div class="grid2">${f(`team.${i}.linkedin`, 'رابط LinkedIn (اختياري)', m.linkedin, { max: 500, ph: 'https://' })}${f(`team.${i}.github`, 'رابط GitHub (اختياري)', m.github, { max: 500, ph: 'https://' })}</div></div>`).join('') || '<p class="muted">لا يوجد أعضاء.</p>'}</section>
    <section class="card mt"><div class="row between"><h3>التقنيات</h3><button class="btn sm" data-act="addg">إضافة مجموعة</button></div>${d.tech.map((g, i) => `<div class="card flat ab-edit-member"><div class="row between"><b>مجموعة ${arNum(i + 1)}</b><button class="btn danger sm" data-act="rmg" data-i="${i}">حذف</button></div>${f(`tech.${i}.group`, 'اسم المجموعة', g.group, { max: 80 })}${lines(`tech.${i}.items`, 'العناصر', g.items)}</div>`).join('')}</section>
    <section class="card mt"><h3>التواصل</h3><div class="grid2">${f('contact.email', 'البريد الإلكتروني', d.contact.email, { max: 200 })}${f('contact.github', 'رابط GitHub للمشروع', d.contact.github, { max: 500, ph: 'https://' })}</div>${f('contact.website', 'رابط الموقع', d.contact.website, { max: 500, ph: 'https://' })}</section>
    <div class="row gap-s mt ab-actions"><button class="btn primary" data-act="save">حفظ الصفحة</button><button class="btn ghost" data-act="reset">استعادة النص الافتراضي</button></div>`;
    abFixPhotos(box); window.scrollTo(0, y);
  };
  draw();
  box.oninput = e => { const t = e.target; if (t.dataset.p) setP(t.dataset.p, t.value); else if (t.dataset.lines) setP(t.dataset.lines, t.value.split('\n').map(s => s.trim()).filter(Boolean)); };
  box.onchange = async e => {
    const path = e.target.dataset.photo; if (!path) return; const file = e.target.files[0]; if (!file) return;
    try { const r = await api('/admin/uploads/team-photo', { method: 'POST', body: { data_url: await resizeImage(file, 480) } }); setP(`${path}.photo_url`, r.data.url); draw(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  box.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, i = Number(b.dataset.i);
    if (act === 'addm') { d.team.push({ name: 'عضو جديد', role: '', bio: '', photo_url: '', linkedin: '', github: '' }); draw(); }
    else if (act === 'rmm') { d.team.splice(i, 1); draw(); }
    else if (act === 'up' && i > 0) { [d.team[i - 1], d.team[i]] = [d.team[i], d.team[i - 1]]; draw(); }
    else if (act === 'down' && i < d.team.length - 1) { [d.team[i + 1], d.team[i]] = [d.team[i], d.team[i + 1]]; draw(); }
    else if (act === 'addg') { d.tech.push({ group: 'مجموعة جديدة', items: [] }); draw(); }
    else if (act === 'rmg') { d.tech.splice(i, 1); draw(); }
    else if (act === 'rmphoto') { setP(`${b.dataset.path}.photo_url`, ''); draw(); }
    else if (act === 'save') busy(b, async () => {
      if (d.team.some(m => !m.name.trim())) { toast('لازم يكون لكل عضو اسم', 'err'); return; }
      try { await api('/admin/about', { method: 'PUT', body: d }); toast('تم حفظ الصفحة'); } catch (x) { toast(errMsg(x), 'err'); }
    });
    else if (act === 'reset') { if (!confirm('هترجع الصفحة للنص الافتراضي وتفقد التعديلات. متأكد؟')) return; busy(b, async () => { try { const r = await api('/admin/about', { method: 'DELETE' }); d = structuredClone(strip(r.data)); draw(); toast('تمت الاستعادة'); } catch (x) { toast(errMsg(x), 'err'); } }); }
  };
}
