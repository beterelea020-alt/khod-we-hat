'use strict';
/* ───────── Sign-in / sign-up / recovery ───────── */
async function signOutLocal(blocked) {
  try { if (state.session) await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${state.session.access_token}` } }); } catch { /* ignore */ }
  saveSession(null); state.user = null; stopLive(); stopRealtime(); closeAllModals();
  location.hash = ''; renderAuth({ blocked });
}

function pwScore(p) { let s = 0; if (p.length >= 8) s++; if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++; if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) s++; return s; }
const pwField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input class="input" id="${id}" type="password" autocomplete="${auto}" required minlength="8" maxlength="72" dir="ltr" style="text-align:start"><button type="button" data-eye="${id}" aria-label="إظهار كلمة المرور">${icon('eye')}</button></div></div>`;

function blockedNotice(b) {
  if (!b) return '';
  const label = { suspended: 'تم إيقاف حسابك مؤقتًا', banned: 'تم حظر حسابك', closed: 'تم إغلاق حسابك' }[b.status] || 'الحساب غير متاح';
  return `<div class="alert err" role="alert">${icon('block')}<div><b>${label}</b>${b.reason ? `<br>السبب: ${esc(b.reason)}` : ''}${b.until ? `<br>ينتهي الإيقاف: ${fmtDate(b.until)}` : ''}<br><span class="xs">لو شايف إن ده حصل بالغلط، تواصل مع الإدارة.</span></div></div>`;
}

async function renderAuth({ mode = 'login', blocked = null, notice = '' } = {}) {
  $('#app').innerHTML = `
  <main class="auth" id="view">
    <section class="auth-art" aria-label="عن المنصة">
      <div class="brand" style="color:#fff"><span class="mark" style="background:rgba(255,255,255,.18);box-shadow:none">${icon('swap')}</span> خد وهات</div>
      <div>
        <h1>علّم اللي تعرفه…<br>وتعلّم اللي محتاجه.</h1>
        <p style="opacity:.9;font-size:1.05rem;max-width:460px">مجتمع عربي لتبادل المهارات بين ناس حقيقيين، بتقييمات موثّقة وتواصل آمن.</p>
        <div class="perks">
          <div class="perk"><span class="ic">${icon('swap')}</span><div><b>تبادل بدون فلوس</b><span>انت تعلّمه تصميم وهو يعلّمك إنجليزي.</span></div></div>
          <div class="perk"><span class="ic">${icon('shield')}</span><div><b>تواصل آمن</b><span>محدش يكلّمك قبل ما توافق على طلب التواصل.</span></div></div>
          <div class="perk"><span class="ic">${icon('star')}</span><div><b>تقييمات حقيقية</b><span>كل تقييم بعد تبادل مكتمل فقط.</span></div></div>
        </div>
      </div>
      <div class="nums" id="auth-stats" aria-label="أرقام المنصة"></div>
    </section>
    <section class="auth-form"><div class="auth-card card" style="padding:28px" id="auth-card"></div></section>
  </main>`;
  get('/stats', { auth: false }).then(s => { const el = $('#auth-stats'); if (el && s.members) el.innerHTML = [[s.members, 'عضو'], [s.skills, 'مهارة'], [s.exchanges, 'تبادل مكتمل']].map(([n, l]) => `<div><b>${arNum(n)}</b><span>${l}</span></div>`).join(''); }).catch(() => {});
  const card = $('#auth-card');
  if (mode === 'forgot') return forgotForm(card);
  const seg = `<div class="seg" role="tablist"><button role="tab" aria-selected="${mode === 'login'}" data-m="login">تسجيل الدخول</button><button role="tab" aria-selected="${mode === 'register'}" data-m="register">حساب جديد</button></div>`;
  card.innerHTML = seg + `<div id="auth-body"></div>`;
  $$('[data-m]', card).forEach(b => b.onclick = () => renderAuth({ mode: b.dataset.m }));
  mode === 'login' ? loginForm($('#auth-body'), { blocked, notice }) : registerForm($('#auth-body'));
  bindEyes(card);
}
function bindEyes(root) { $$('[data-eye]', root).forEach(b => b.onclick = () => { const i = $(`#${b.dataset.eye}`); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'); }); }

function loginForm(box, { blocked, notice }) {
  box.innerHTML = `<h2>أهلًا بعودتك</h2><p class="muted">سجّل الدخول لتكمل رحلتك في خد وهات.</p>
    ${notice ? `<div class="alert ok" role="status">${esc(notice)}</div><div style="height:12px"></div>` : ''}${blockedNotice(blocked)}
    <div id="auth-err" role="alert" aria-live="assertive"></div>
    <form id="lf" novalidate>
      <div class="field"><label for="le">البريد الإلكتروني</label><input class="input" id="le" type="email" autocomplete="email" inputmode="email" required dir="ltr" style="text-align:start" placeholder="name@example.com"></div>
      ${pwField('lp', 'كلمة المرور', 'current-password')}
      <div class="row between" style="margin:-4px 0 16px"><span></span><a href="#" id="fg">نسيت كلمة المرور؟</a></div>
      <button class="btn primary block" id="lb" type="submit" style="min-height:50px">دخول</button>
    </form>
    <p class="center small muted mt">مستخدم جديد؟ <a href="#" id="toreg">أنشئ حسابك المجاني</a></p><p class="center small mt"><a href="#/about">عن المشروع وفريق العمل</a></p>`;
  $('#fg').onclick = e => { e.preventDefault(); renderAuth({ mode: 'forgot' }); };
  $('#toreg').onclick = e => { e.preventDefault(); renderAuth({ mode: 'register' }); };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const err = $('#auth-err'); err.innerHTML = '';
    const email = $('#le').value.trim(), password = $('#lp').value;
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) { err.innerHTML = `<div class="alert err">${icon('info')}اكتب بريدًا صحيحًا وكلمة المرور.</div>`; return; }
    const btn = $('#lb'); const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> جارٍ الدخول…';
    try { const j = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false }); await enterApp(j.data); }
    catch (x) {
      btn.disabled = false; btn.innerHTML = html;
      if (x.code === 'ACCOUNT_BLOCKED') err.innerHTML = blockedNotice(x.details);
      else if (x.code === 'EMAIL_NOT_VERIFIED') { err.innerHTML = `<div class="alert warn">${icon('mail')}<div>لازم تفعّل بريدك الأول. افتح رسالة التفعيل. <a href="#" id="rs">أعد إرسال الرسالة</a></div></div>`; $('#rs').onclick = async ev => { ev.preventDefault(); await api('/auth/resend-verification', { method: 'POST', body: { email }, auth: false }).catch(() => {}); toast('أرسلنا رسالة التفعيل من جديد', 'ok'); }; }
      else err.innerHTML = `<div class="alert err">${icon('info')}${esc(x.code === 'INVALID_CREDENTIALS' ? 'البريد أو كلمة المرور غير صحيحة.' : errMsg(x))}</div>`;
    }
  };
}

function registerForm(box) {
  box.innerHTML = `<h2>انضم لخد وهات</h2><p class="muted">حساب مجاني، وتبدأ التبادل في دقيقتين.</p><div id="auth-err" role="alert" aria-live="assertive"></div>
    <form id="rf" novalidate>
      <div class="field"><label for="rn">الاسم الكامل</label><input class="input" id="rn" autocomplete="name" required minlength="2" maxlength="120"></div>
      <div class="grid2"><div class="field"><label for="ru">اسم المستخدم</label><input class="input" id="ru" autocomplete="username" required minlength="3" maxlength="40" pattern="[A-Za-z0-9_.\\-]+" dir="ltr" style="text-align:start" placeholder="ahmed_99"><span class="hint">حروف إنجليزية وأرقام فقط</span></div>
        <div class="field"><label for="rc">المدينة</label><input class="input" id="rc" autocomplete="address-level2" maxlength="80" placeholder="دمياط"></div></div>
      <div class="field"><label for="re">البريد الإلكتروني</label><input class="input" id="re" type="email" autocomplete="email" inputmode="email" required dir="ltr" style="text-align:start"></div>
      <div class="field"><label for="rph">رقم الهاتف <span class="muted xs">(اختياري — يظهر فقط لمن تقبل التواصل معهم)</span></label><input class="input" id="rph" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" dir="ltr" style="text-align:start" placeholder="01xxxxxxxxx"></div>
      ${pwField('rpw', 'كلمة المرور', 'new-password')}
      <div class="pwbar" id="pwbar" aria-hidden="true"><i></i><i></i><i></i></div><p class="hint" id="pwhint">8 أحرف على الأقل، والأفضل تجمع حروف وأرقام.</p>
      <label class="check"><input type="checkbox" id="rt" required> <span class="small">أوافق على عدم مشاركة بيانات حساسة داخل المنصة والالتزام بقواعد المجتمع.</span></label>
      <button class="btn primary block" id="rb" type="submit" style="min-height:50px;margin-top:10px">إنشاء الحساب</button>
    </form>`;
  $('#rpw').oninput = e => { const s = pwScore(e.target.value); const bar = $('#pwbar'); bar.className = `pwbar ${s === 3 ? 's' : s === 2 ? 'm' : ''}`; $$('i', bar).forEach((i, k) => i.classList.toggle('on', k < s)); $('#pwhint').textContent = ['', 'ضعيفة — زوّد الطول وأضف أرقام', 'جيدة', 'قوية'][s] || ''; };
  $('#rf').oninput = e => e.target.removeAttribute?.('aria-invalid');
  $('#rf').onsubmit = async e => {
    e.preventDefault(); const err = $('#auth-err'); err.innerHTML = '';
    const arDigits = t => t.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));            // ٠١٠١٢٣٤٥٦٧٨ → 01012345678
    const body = { name: $('#rn').value.trim(), username: $('#ru').value.trim(), email: $('#re').value.trim(), password: $('#rpw').value, phone: arDigits($('#rph').value.trim()), city: $('#rc').value.trim(), country: 'مصر' };
    const problems = [];
    if (body.name.length < 2) problems.push(['rn', 'الاسم: اكتب اسمك (حرفين على الأقل)']);
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(body.username)) problems.push(['ru', 'اسم المستخدم: من 3 إلى 40 حرف إنجليزي أو رقم أو ( . _ - ) — من غير مسافات ولا حروف عربي']);
    if (!/^\S+@\S+\.\S+$/.test(body.email)) problems.push(['re', 'البريد الإلكتروني: اكتبه بشكل صحيح مثل name@example.com']);
    if (body.phone && !/^\+?[0-9][0-9\s().-]{6,19}$/.test(body.phone)) problems.push(['rph', 'رقم الهاتف: أرقام فقط، مثال 01012345678']);
    if (body.password.length < 8) problems.push(['rpw', 'كلمة المرور: 8 أحرف على الأقل']);
    else if (body.password.length > 72) problems.push(['rpw', 'كلمة المرور: أقصاها 72 حرف']);
    if (!$('#rt').checked) problems.push(['rt', 'لازم توافق على الشروط عشان تكمل']);
    $$('#rf [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    if (problems.length) { problems.forEach(([id]) => $('#' + id).setAttribute('aria-invalid', 'true')); err.innerHTML = `<div class="alert err">${icon('info')}<ul class="errlist">${problems.map(([, m]) => `<li>${esc(m)}</li>`).join('')}</ul></div>`; $('#' + problems[0][0]).focus(); return; }
    const btn = $('#rb'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> جارٍ الإنشاء…';
    try {
      const j = await api('/auth/register', { method: 'POST', body, auth: false });
      if (j.data.session) return enterApp(j.data);
      $('#auth-body').innerHTML = `<div class="center"><div class="stat" style="justify-content:center;margin-bottom:10px"><span class="ic" style="width:64px;height:64px;border-radius:50%;background:var(--accent-50);color:var(--accent);display:grid;place-items:center">${icon('mail')}</span></div><h2>افتح بريدك لتفعيل الحساب</h2><p class="muted">أرسلنا رابط تفعيل إلى <b dir="ltr">${esc(body.email)}</b>. بعد التفعيل سجّل الدخول.</p><button class="btn ghost" id="rs2">لم تصلني الرسالة</button> <button class="btn primary" id="gl">الذهاب لتسجيل الدخول</button></div>`;
      $('#gl').onclick = () => renderAuth({ mode: 'login' });
      $('#rs2').onclick = async () => { await api('/auth/resend-verification', { method: 'POST', body: { email: body.email }, auth: false }).catch(() => {}); toast('أعدنا إرسال الرسالة', 'ok'); };
    } catch (x) { btn.disabled = false; btn.innerHTML = 'إنشاء الحساب'; err.innerHTML = `<div class="alert err">${icon('info')}${esc(x.code === 'ACCOUNT_EXISTS' ? 'البريد أو اسم المستخدم مستخدم من قبل.' : errMsg(x))}</div>`; }
  };
}

function forgotForm(card) {
  card.innerHTML = `<button class="btn ghost sm" id="bk">${icon('arrow')} رجوع</button><h2 class="mt">استعادة كلمة المرور</h2><p class="muted">اكتب بريدك وهنبعتلك رابط لتعيين كلمة مرور جديدة.</p><div id="auth-err" role="alert"></div>
    <form id="ff"><div class="field"><label for="fe">البريد الإلكتروني</label><input class="input" id="fe" type="email" required dir="ltr" style="text-align:start" autocomplete="email"></div><button class="btn primary block" type="submit">إرسال الرابط</button></form>`;
  $('#bk').onclick = () => renderAuth({ mode: 'login' });
  $('#ff').onsubmit = async e => { e.preventDefault(); const b = e.submitter; await busy(b, async () => { const j = await api('/auth/forgot-password', { method: 'POST', body: { email: $('#fe').value.trim() }, auth: false }); $('#auth-err').innerHTML = `<div class="alert ok">${icon('check')}${esc(j.message)}</div>`; }); };
}

function renderRecovery(token) {
  renderAuth({ mode: 'forgot' }).then?.(() => {});
  setTimeout(() => {
    const card = $('#auth-card'); if (!card) return;
    card.innerHTML = `<h2>كلمة مرور جديدة</h2><p class="muted">اختر كلمة مرور قوية لحسابك.</p><div id="auth-err" role="alert"></div><form id="nf">${pwField('np', 'كلمة المرور الجديدة', 'new-password')}${pwField('np2', 'تأكيد كلمة المرور', 'new-password')}<button class="btn primary block" type="submit">حفظ والدخول</button></form>`;
    bindEyes(card);
    $('#nf').onsubmit = async e => { e.preventDefault(); const a = $('#np').value, b = $('#np2').value; if (a !== b) { $('#auth-err').innerHTML = `<div class="alert err">كلمتا المرور غير متطابقتين.</div>`; return; }
      await busy(e.submitter, async () => { await api('/auth/update-password', { method: 'POST', body: { access_token: token, password: a }, auth: false }); history.replaceState(null, '', location.pathname); renderAuth({ mode: 'login', notice: 'تم تغيير كلمة المرور. سجّل الدخول بها.' }); }); };
  }, 0);
}
