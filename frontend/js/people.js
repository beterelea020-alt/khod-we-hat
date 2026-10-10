'use strict';
/* ───────── Connection request modal ───────── */
function connectModal(userId, name, done) {
  const m = openModal({ title: `طلب تواصل مع ${name}`, body: `<p class="muted small">لن يتمكن ${esc(name)} من مراسلتك أو رؤية رقمك إلا بعد قبوله الطلب، والعكس صحيح.</p><div class="field"><label for="cm">رسالة قصيرة (اختياري)</label><textarea class="input" id="cm" maxlength="500" placeholder="عرّف بنفسك واذكر المهارة التي تهتم بها…"></textarea></div>`, footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">' + icon('send') + ' إرسال الطلب</button>' });
  m.$('[data-x2]').onclick = m.close;
  m.$('#ok').onclick = e => busy(e.currentTarget, async () => { const r = await api('/connections', { method: 'POST', body: { user_id: userId, message: m.$('#cm').value.trim() } }); toast(r.data.status === 'accepted' ? 'تم قبول الطلب — تقدروا تتراسلوا الآن' : 'تم إرسال طلب التواصل', 'ok'); m.close(); refreshBadges(); done?.(); });
}

/* ───────── Exchange request modal ───────── */
async function exchangeModal(target) {
  const mine = (await get('/users/me/skills')).filter(s => s.type === 'offer'); const theirs = (target.skills || []).filter(s => s.type === 'offer');
  if (!mine.length) { toast('أضف مهارة تقدّمها في ملفك أولًا', 'err'); location.hash = '#/profile'; return; }
  if (!theirs.length) { toast('هذا الشخص لم يضف مهارات يقدّمها بعد', 'err'); return; }
  const needs = new Set((state.mySkillNeeds || []));
  const m = openModal({ title: `طلب تبادل مع ${target.name}`, body: `<div class="field"><label for="xo">ما الذي ستقدّمه؟</label><select class="input" id="xo">${mine.map(s => `<option value="${esc(s.skill_id)}">${esc(s.name)} — ${L.level[s.level] || ''}</option>`).join('')}</select></div><div class="field"><label for="xr">ما الذي تريده منه؟</label><select class="input" id="xr">${theirs.map(s => `<option value="${esc(s.skill_id)}">${esc(s.name)} — ${L.level[s.level] || ''}</option>`).join('')}</select></div>
    <div class="field"><label for="xd">نوع الاتفاق</label><select class="input" id="xd"><option value="swap">تبادل مهارات (بدون مقابل مادي)</option><option value="paid">مدفوع</option></select></div><div class="field"><label for="xm">رسالة</label><textarea class="input" id="xm" maxlength="1500" placeholder="اقترح مواعيد أو أهدافك من التبادل…"></textarea></div>`, footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">إرسال الطلب</button>' });
  m.$('[data-x2]').onclick = m.close;
  m.$('#ok').onclick = e => busy(e.currentTarget, async () => { const r = await api('/exchanges', { method: 'POST', body: { receiver_id: target.id, offered_skill_id: m.$('#xo').value, requested_skill_id: m.$('#xr').value, deal_type: m.$('#xd').value, message: m.$('#xm').value.trim() } }); toast('تم إرسال طلب التبادل', 'ok'); m.close(); location.hash = `#/exchange/${r.data.id}`; });
}

/* ───────── Public profile ───────── */
async function viewUser(el, [id]) {
  if (id === state.user.id) { location.hash = '#/profile'; return; }
  el.innerHTML = skeletons(2);
  const u = await get(`/users/${id}`).catch(e => { if (e.status === 404) return null; throw e; });
  if (!u) { el.innerHTML = `<div class="card">${emptyState('user', 'هذا الحساب غير متاح.', '<a class="btn primary" href="#/browse">رجوع للاستكشاف</a>')}</div>`; return; }
  const c = u.connection; const offers = u.skills.filter(s => s.type === 'offer'); const needs = u.skills.filter(s => s.type === 'need'); const rs = u.rating_summary;
  const connBtn = !c ? `<button class="btn primary" id="cn">${icon('users')} طلب تواصل</button>`
    : c.status === 'accepted' ? `<a class="btn primary" href="#/chat/${esc(c.id)}">${icon('chat')} مراسلة</a>`
    : c.status === 'pending' && c.direction === 'outgoing' ? `<button class="btn ghost" id="cc">${icon('clock')} قيد الانتظار — إلغاء الطلب</button>`
    : c.status === 'pending' ? `<button class="btn success" data-ca="accept">${icon('check')} قبول طلب التواصل</button><button class="btn ghost" data-ca="decline">رفض</button>` : `<button class="btn primary" id="cn">${icon('users')} طلب تواصل</button>`;
  el.innerHTML = `<a class="btn ghost sm" href="javascript:history.back()">${icon('arrow')} رجوع</a>
    <div class="card mt" style="padding:0;overflow:hidden"><div style="height:110px;background:linear-gradient(135deg,#991B1B,#EF4444)"></div>
      <div style="padding:0 24px 24px"><div class="row wrap" style="align-items:flex-end;margin-top:-52px;gap:18px">${avatar(u, 'l')}<div class="grow" style="padding-top:56px"><h1 style="margin:0;font-size:1.6rem">${esc(u.name)} ${u.is_verified ? verifiedBadge : ''}</h1><div class="muted">${esc(u.headline || '')}</div></div></div>
      <div class="row wrap mt" style="gap:16px">${u.review_count ? `<span>${stars(u.rating)} <b>${Number(u.rating).toFixed(1)}</b> <span class="muted small">(${arNum(u.review_count)} تقييم)</span></span>` : '<span class="chip n">بلا تقييم بعد</span>'}<span class="chip g">${arNum(u.exchanges)} تبادل مكتمل</span>${u.location ? `<span class="small muted row gap-s">${icon('pin')}${esc(u.location)}</span>` : ''}<span class="chip ${u.availability ? 'b' : 'n'}">${esc(u.availability || '')}</span></div>
      <div class="row wrap mt">${connBtn}<button class="btn" id="ex">${icon('swap')} اطلب تبادل</button><button class="btn ghost" id="rp">${icon('flag')} إبلاغ</button></div></div></div>
    <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(310px,1fr));align-items:start">
      <div class="col"><div class="card"><h3>نبذة</h3><p style="margin:0;white-space:pre-wrap">${esc(u.bio || 'لم يكتب نبذة بعد.')}</p></div>
        <div class="card"><h3>بيانات التواصل</h3>${c?.status === 'accepted' ? `<div class="col"><div class="row">${icon('phone')}<b dir="ltr">${esc(u.phone || 'لم يضف رقمًا')}</b></div><p class="xs muted" style="margin:0">ظاهر لك لأنكم متواصلون.</p></div>` : `<div class="alert info">${icon('lock')}<span>رقم الهاتف يظهر بعد قبول طلب التواصل بينكم.</span></div>`}</div></div>
      <div class="col"><div class="card"><h3>مهارات يقدّمها</h3>${offers.length ? offers.map(s => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)"><div><b>${esc(s.name)}</b><div class="xs muted">${esc(s.category)}${s.experience_years > 0 ? ` · ${arNum(s.experience_years)} سنة خبرة` : ''}</div></div><span class="chip">${L.level[s.level] || ''}</span></div>`).join('') : '<p class="muted small">لا يوجد.</p>'}</div>
        <div class="card"><h3>يريد تعلّمها</h3><div class="chips">${needs.length ? needs.map(s => `<span class="chip g">${esc(s.name)}</span>`).join('') : '<span class="muted small">لا يوجد.</span>'}</div></div></div></div>
    <div class="card mt"><h3>التقييمات ${rs.total ? `(${arNum(rs.total)})` : ''}</h3>${rs.total ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:center"><div class="center"><div style="font-size:2.8rem;font-weight:800;color:var(--ink);line-height:1">${Number(rs.avg).toFixed(1)}</div>${stars(rs.avg)}<div class="xs muted">من ${arNum(rs.total)} تقييم</div></div>
      <div>${[5, 4, 3, 2, 1].map(n => `<div class="row" style="gap:8px"><span class="xs" style="width:14px">${n}</span><div class="meter grow"><i style="width:${rs.total ? rs['s' + n] / rs.total * 100 : 0}%"></i></div><span class="xs muted" style="width:24px">${arNum(rs['s' + n])}</span></div>`).join('')}</div>
      <div>${[['التواصل', rs.communication], ['المعرفة', rs.knowledge], ['الالتزام', rs.commitment]].filter(a => Number(a[1]) > 0).map(([l, v]) => `<div class="row between small"><span>${l}</span>${stars(v)}</div>`).join('')}</div></div>
      <div class="col mt">${u.reviews.map(r => `<div class="card flat" style="background:var(--surface-2)"><div class="row">${avatar({ name: r.reviewer_name, avatar_url: r.reviewer_avatar }, 's')}<div class="grow"><b class="small">${esc(r.reviewer_name)}</b><div class="xs muted">${esc(r.offered_skill)} ↔ ${esc(r.requested_skill)} · ${ago(r.created_at)}</div></div>${stars(r.rating)}</div>${r.comment ? `<p class="small" style="margin:8px 0 0">${esc(r.comment)}</p>` : ''}</div>`).join('')}</div>` : '<p class="muted">لا توجد تقييمات بعد. التقييمات تظهر بعد اكتمال التبادلات.</p>'}</div>`;
  const re = () => viewUser(el, [id]);
  $('#cn')?.addEventListener('click', () => connectModal(id, u.name, re));
  $('#cc')?.addEventListener('click', async () => { await api(`/connections/${c.id}`, { method: 'PATCH', body: { action: 'cancel' } }); re(); });
  $$('[data-ca]', el).forEach(b => b.onclick = async () => { await api(`/connections/${c.id}`, { method: 'PATCH', body: { action: b.dataset.ca } }).catch(e => toast(errMsg(e), 'err')); refreshBadges(); re(); });
  $('#ex').onclick = () => exchangeModal(u);
  $('#rp').onclick = () => reportModal({ target_type: 'user', target_id: id, reported_user_id: id, title: `إبلاغ عن ${u.name}` });
}

/* ───────── My profile ───────── */
async function viewProfile(el) {
  el.innerHTML = skeletons(2);
  const [me, skills, pub] = await Promise.all([get('/auth/me').then(d => d.user), get('/users/me/skills'), get(`/users/${state.user.id}`)]);
  state.user = { ...state.user, ...me }; state.mySkillNeeds = skills.filter(s => s.type === 'need').map(s => s.skill_id);
  const pc = profileCompleteness(state.user, skills); const rs = pub.rating_summary;
  el.innerHTML = pageHead('ملفي الشخصي', 'ده اللي بيشوفه الناس عنك', `<a class="btn ghost" href="#/user/${esc(me.id)}" id="pv">${icon('eye')} معاينة</a>`) +
    `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
    <div class="col"><div class="card center"><div style="position:relative;display:inline-block">${avatar(state.user, 'l')}<label class="icon-btn" style="position:absolute;bottom:0;inset-inline-end:-6px;background:var(--primary);color:#fff;border-color:var(--surface);cursor:pointer" title="تغيير الصورة">${icon('cam')}<input type="file" id="pf" accept="image/jpeg,image/png,image/webp" class="sr"></label></div>
        <h2 style="margin:10px 0 0">${esc(me.name)} ${me.is_verified ? verifiedBadge : ''}</h2><div class="muted small">@${esc(me.username)} · ${L.role[me.role] || ''}</div>${me.avatar_url ? '<button class="btn ghost sm mt" id="rmav">حذف الصورة</button>' : ''}
        <div class="mt" style="text-align:start"><div class="row between small"><span>اكتمال الملف</span><b>${arNum(pc.pct)}%</b></div><div class="meter"><i style="width:${pc.pct}%"></i></div>${pc.todo.length ? `<ul class="small muted" style="margin:8px 0 0;padding-inline-start:18px">${pc.todo.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="small" style="color:var(--accent);margin:8px 0 0">ملفك مكتمل!</p>'}</div></div>
      <div class="card"><h3>تقييماتي</h3>${rs.total ? `<div class="row"><div style="font-size:2.2rem;font-weight:800;color:var(--ink)">${Number(rs.avg).toFixed(1)}</div><div>${stars(rs.avg)}<div class="xs muted">${arNum(rs.total)} تقييم</div></div></div>${pub.reviews.slice(0, 3).map(r => `<div class="small" style="border-top:1px solid var(--border);padding:8px 0"><b>${esc(r.reviewer_name)}</b> ${stars(r.rating)}<div class="muted">${esc(r.comment || '')}</div></div>`).join('')}` : '<p class="muted small">لسه مفيش تقييمات. هتظهر بعد أول تبادل مكتمل.</p>'}</div></div>
    <div class="col"><form class="card" id="pform"><h3>البيانات الأساسية</h3>
      <div class="grid2"><div class="field"><label for="pn">الاسم</label><input class="input" id="pn" value="${esc(me.name)}" maxlength="120" required></div><div class="field"><label for="pu">اسم المستخدم</label><input class="input" id="pu" value="${esc(me.username)}" dir="ltr" style="text-align:start" pattern="[A-Za-z0-9_.\\-]+" minlength="3" maxlength="40" required></div></div>
      <div class="field"><label for="ph">المسمى التعريفي</label><input class="input" id="ph" value="${esc(me.headline || '')}" maxlength="140" placeholder="مثال: مصمم واجهات | محب للتعلّم"></div>
      <div class="field"><label for="pb">نبذة عنك</label><textarea class="input" id="pb" maxlength="1500" placeholder="عرّف الناس بخبرتك وأهدافك…">${esc(me.bio || '')}</textarea></div>
      <div class="grid2"><div class="field"><label for="pp">رقم الهاتف</label><input class="input" id="pp" type="tel" value="${esc(me.phone || '')}" dir="ltr" style="text-align:start" maxlength="20" placeholder="01xxxxxxxxx"><span class="hint">يظهر فقط لمن تقبل التواصل معهم.</span></div><div class="field"><label>البريد الإلكتروني</label><input class="input" value="${esc(me.email)}" dir="ltr" style="text-align:start" disabled><span class="hint">لا يظهر لأحد.</span></div></div>
      <div class="grid2"><div class="field"><label for="pc">المدينة</label><input class="input" id="pc" value="${esc(me.city || '')}" maxlength="80"></div><div class="field"><label for="pa">التوفّر</label><select class="input" id="pa">${['متاح الآن', 'متاح في عطلة الأسبوع', 'مشغول حاليًا'].map(v => `<option ${me.availability === v ? 'selected' : ''}>${v}</option>`).join('')}${['متاح الآن', 'متاح في عطلة الأسبوع', 'مشغول حاليًا'].includes(me.availability) ? '' : `<option selected>${esc(me.availability)}</option>`}</select></div></div>
      <button class="btn primary" type="submit">حفظ التغييرات</button></form>
      <div class="card"><div class="row between"><h3 style="margin:0">مهاراتي</h3><button class="btn primary sm" id="addsk">${icon('plus')} إضافة مهارة</button></div><div id="skl" class="mt"></div></div></div></div>`;
  const drawSkills = list => { $('#skl').innerHTML = [['offer', 'أقدّمها', 'chip'], ['need', 'أريد تعلّمها', 'chip g']].map(([t, label, cls]) => { const rows = list.filter(s => s.type === t); return `<div class="xs muted" style="margin:10px 0 6px">${label}</div>${rows.length ? `<div class="chips">${rows.map(s => `<span class="${cls}">${esc(s.name)}${t === 'offer' ? ` · ${L.level[s.level] || ''}` : ''}<button data-rm="${esc(s.id)}" aria-label="حذف ${esc(s.name)}" style="border:0;background:none;color:inherit;padding:0 0 0 2px;line-height:1">${icon('x')}</button></span>`).join('')}</div>` : '<p class="small muted" style="margin:0">لا يوجد بعد.</p>'}`; }).join(''); $$('[data-rm]', el).forEach(b => b.onclick = async () => { await api(`/users/me/skills/${b.dataset.rm}`, { method: 'DELETE' }); const fresh = await get('/users/me/skills'); drawSkills(fresh); }); };
  drawSkills(skills);
  $('#pform').onsubmit = async e => { e.preventDefault(); await busy(e.submitter, async () => { const r = await api('/users/me', { method: 'PATCH', body: { name: $('#pn').value.trim(), username: $('#pu').value.trim(), headline: $('#ph').value.trim(), bio: $('#pb').value.trim(), phone: $('#pp').value.trim(), city: $('#pc').value.trim(), availability: $('#pa').value } }); state.user = { ...state.user, ...r.data }; toast('تم حفظ ملفك', 'ok'); paintShell(); }); };
  $('#pf').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const dataUrl = await resizeImage(f, 480); const r = await api('/users/me/avatar', { method: 'POST', body: { data_url: dataUrl } }); state.user.avatar_url = r.data.avatar_url; toast('تم تحديث الصورة', 'ok'); paintShell(); viewProfile(el); } catch (x) { toast(errMsg(x), 'err'); } };
  $('#rmav')?.addEventListener('click', async () => { await api('/users/me/avatar', { method: 'DELETE' }); state.user.avatar_url = ''; paintShell(); viewProfile(el); });
  $('#addsk').onclick = () => {
    const m = openModal({ title: 'إضافة مهارة', body: `<div class="field"><label>النوع</label><div class="seg" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="check card flat" style="padding:10px"><input type="radio" name="st" value="offer" checked> أقدّمها</label><label class="check card flat" style="padding:10px"><input type="radio" name="st" value="need"> أريد تعلّمها</label></div></div><div class="field"><label for="sk">المهارة</label><select class="input" id="sk">${state.cats.map(c => `<optgroup label="${esc(c.name)}">${state.skills.filter(s => s.category_id === c.id).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="grid2"><div class="field"><label for="sl">المستوى</label><select class="input" id="sl">${Object.entries(L.level).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="field"><label for="sy">سنوات الخبرة</label><input class="input" id="sy" type="number" min="0" max="50" step="0.5" value="0"></div></div>`, footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">إضافة</button>' });
    m.$('[data-x2]').onclick = m.close;
    m.$('#ok').onclick = e => busy(e.currentTarget, async () => { await api('/users/me/skills', { method: 'POST', body: { skill_id: m.$('#sk').value, type: m.$('[name=st]:checked', m.el)?.value || $('input[name=st]:checked', m.el).value, level: m.$('#sl').value, experience_years: Number(m.$('#sy').value) || 0 } }); m.close(); drawSkills(await get('/users/me/skills')); toast('تمت الإضافة', 'ok'); });
  };
}

/* ───────── Connections ───────── */
async function viewConnections(el) {
  el.innerHTML = skeletons(2);
  const j = await api('/connections'); const all = j.data; let tab = all.some(x => x.status === 'pending' && x.direction === 'incoming') ? 'in' : 'ok';
  const draw = () => {
    const sets = { in: all.filter(x => x.status === 'pending' && x.direction === 'incoming'), out: all.filter(x => x.status === 'pending' && x.direction === 'outgoing'), ok: all.filter(x => x.status === 'accepted') };
    const names = { in: 'طلبات واردة', out: 'طلبات أرسلتها', ok: 'متواصلون' };
    const rows = sets[tab];
    el.innerHTML = pageHead('التواصل', 'لازم طلب التواصل يتقبّل قبل ما تتراسلوا') + `<div class="tabs" role="tablist">${Object.entries(names).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === tab}" data-t="${k}">${v} <span class="xs">(${arNum(sets[k].length)})</span></button>`).join('')}</div>` +
      (rows.length ? `<div class="col">${rows.map(c => `<div class="card row wrap">${avatar(c)}<div class="grow"><a href="#/user/${esc(c.user_id)}" style="color:inherit"><b>${esc(c.name)}</b></a> ${c.is_verified ? verifiedBadge : ''}<div class="small muted">${esc(c.headline || c.location || '')}</div>${c.message ? `<div class="small" style="margin-top:4px">«${esc(c.message)}»</div>` : ''}${c.phone ? `<div class="small row gap-s" style="margin-top:4px">${icon('phone')}<span dir="ltr">${esc(c.phone)}</span></div>` : ''}</div>
        <div class="row gap-s wrap">${tab === 'in' ? `<button class="btn success sm" data-a="accept" data-id="${esc(c.id)}">${icon('check')} قبول</button><button class="btn ghost sm" data-a="decline" data-id="${esc(c.id)}">رفض</button>` : tab === 'out' ? `<button class="btn ghost sm" data-a="cancel" data-id="${esc(c.id)}">إلغاء الطلب</button>` : `<a class="btn primary sm" href="#/chat/${esc(c.id)}">${icon('chat')} مراسلة</a><button class="btn ghost sm" data-a="remove" data-id="${esc(c.id)}" aria-label="إزالة">${icon('trash')}</button>`}</div></div>`).join('')}</div>` : `<div class="card">${emptyState('users', tab === 'in' ? 'مفيش طلبات واردة.' : tab === 'out' ? 'مفيش طلبات معلّقة.' : 'لسه مفيش حد متواصل معاه.', '<a class="btn primary" href="#/browse">استكشف الأشخاص</a>')}</div>`);
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    $$('[data-a]', el).forEach(b => b.onclick = async () => { if (b.dataset.a === 'remove' && !(await confirmBox({ title: 'إزالة التواصل', message: 'سيتم حذف المحادثة بينكم نهائيًا. متأكد؟', confirmText: 'إزالة', danger: true }))) return; try { await api(`/connections/${b.dataset.id}`, { method: 'PATCH', body: { action: b.dataset.a } }); } catch (e) { toast(errMsg(e), 'err'); } viewConnections(el); refreshBadges(); });
  };
  draw();
}

/* ───────── Chat: Supabase Realtime (one app-wide subscription) + adaptive polling fallback + voice ───────── */
let sbClient = null, rtChan = null, rtOk = false;
async function realtimeClient() {
  if (sbClient) return sbClient;
  if (!state.cfg?.supabaseUrl || !state.cfg?.supabaseAnonKey) return null;
  try {
    if (!window.supabase) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
    sbClient = window.supabase.createClient(state.cfg.supabaseUrl, state.cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    sbClient.realtime.setAuth(state.session.access_token); return sbClient;
  } catch { return null; }
}
window.addEventListener('kw:token', () => { try { sbClient?.realtime.setAuth(state.session.access_token); } catch { /* ignore */ } });

/** One channel for the whole session. Row-level security means the server only delivers rows of MY conversations. */
async function startRealtime() {
  if (rtChan || !state.user) return;
  const sb = await realtimeClient(); if (!sb || rtChan) return;
  rtChan = sb.channel('dm-all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, p => window.dispatchEvent(new CustomEvent('kw:dm', { detail: p })))
    .subscribe(st => { rtOk = st === 'SUBSCRIBED'; window.dispatchEvent(new CustomEvent('kw:rt', { detail: rtOk })); });
}
function stopRealtime() { try { if (rtChan) sbClient?.removeChannel(rtChan); } catch { /* ignore */ } rtChan = null; rtOk = false; sbClient = null; }
let badgeDebounce;
window.addEventListener('kw:dm', e => { const n = e.detail?.new; if (n && n.sender_id !== state.user?.id) { clearTimeout(badgeDebounce); badgeDebounce = setTimeout(() => refreshBadges(), 400); } });

const fmtDur = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const MIC_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';

async function viewChat(el, [connId]) {
  el.innerHTML = skeletons(1);
  let inbox = (await api('/chats')).data; let active = connId || null;
  el.innerHTML = pageHead('الرسائل') + `<div class="chat ${active ? 'open' : ''}" id="chat"><div class="chat-list" id="cl"></div><div class="thread" id="th"></div></div>`;
  const drawList = () => { $('#cl').innerHTML = inbox.length ? inbox.map(c => `<button class="chat-item" data-c="${esc(c.connection_id)}" ${c.connection_id === active ? 'aria-current="true"' : ''}>${avatar(c)}<div class="grow"><div class="row between"><b class="trunc">${esc(c.name)}</b><span class="xs muted nowrap">${c.last_at ? ago(c.last_at) : ''}</span></div><div class="small muted trunc">${c.last_body ? (c.last_sender === state.user.id ? 'أنت: ' : '') + esc(c.last_body) : 'ابدأ المحادثة'}</div></div>${c.unread ? `<span class="count" style="background:var(--danger);color:#fff;border-radius:99px;font-size:.72rem;padding:1px 8px">${arNum(c.unread)}</span>` : ''}</button>`).join('') : `<div class="empty">${icon('chat')}<p>لا توجد محادثات. أرسل طلب تواصل واقبل الطلبات الواردة لتبدأ.</p><a class="btn primary sm" href="#/browse">استكشف</a></div>`; $$('[data-c]', $('#cl')).forEach(b => b.onclick = () => { location.hash = `#/chat/${b.dataset.c}`; }); };
  drawList();
  const reloadInbox = async () => { try { const fresh = (await api('/chats')).data; if (active) { const cur = fresh.find(c => c.connection_id === active); if (cur) cur.unread = 0; } inbox = fresh; drawList(); } catch { /* ignore */ } };
  if (!active) {
    $('#th').innerHTML = `<div class="empty" style="margin:auto">${icon('chat')}<p>اختر محادثة من القائمة</p></div>`;
    let t; const onDm = () => { clearTimeout(t); t = setTimeout(reloadInbox, 300); };
    window.addEventListener('kw:dm', onDm); state.cleanup.push(() => { clearTimeout(t); window.removeEventListener('kw:dm', onDm); });
    return;
  }
  const peer = inbox.find(c => c.connection_id === active);
  if (!peer) { $('#th').innerHTML = `<div class="empty" style="margin:auto">${icon('lock')}<p>المحادثة غير متاحة. لازم طلب التواصل يتقبّل أولًا.</p></div>`; return; }
  // Who gives / who takes in the exchange behind this chat (if any).
  const iAmSender = peer.exchange_sender_id === state.user.id;
  const ctx = peer.exchange_id ? `<div class="ctx"><span><b>هات:</b> ${esc(iAmSender ? peer.offered_name : peer.requested_name)}</span><span><b>خُد:</b> ${esc(iAmSender ? peer.requested_name : peer.offered_name)}</span></div>` : '';
  $('#th').innerHTML = `<div class="thread-head"><button class="icon-btn" id="bk" aria-label="رجوع" style="display:none">${icon('arrow')}</button>${avatar(peer)}<div class="grow"><a href="#/user/${esc(peer.user_id)}" style="color:inherit"><b>${esc(peer.name)}</b></a> ${peer.is_verified ? verifiedBadge : ''}</div><button class="icon-btn" id="rpc" aria-label="إبلاغ">${icon('flag')}</button></div>${ctx}<div class="msgs" id="ms" aria-live="polite"><div class="empty">جارٍ التحميل…</div></div>
    <form class="composer" id="cf"><textarea class="input" id="ci" rows="1" maxlength="4000" placeholder="اكتب رسالة…" aria-label="الرسالة"></textarea><button type="button" class="icon-btn mic" id="mic" aria-label="تسجيل رسالة صوتية" title="رسالة صوتية">${MIC_SVG}</button><button class="btn primary" id="sendbtn" aria-label="إرسال" style="width:50px;padding:0">${icon('send')}</button>
      <div class="rbar" id="rbar" hidden><span class="rdot"></span><b id="rt">0:00</b><span class="grow muted small">جارٍ التسجيل…</span><button type="button" class="btn sm" id="rcancel">إلغاء</button><button type="button" class="btn primary sm" id="rsend">إرسال</button></div></form>`;
  if (matchMedia('(max-width:860px)').matches) { const b = $('#bk'); b.style.display = ''; b.onclick = () => { location.hash = '#/chat'; }; }
  const seen = new Set(); let last = null; const box = $('#ms');
  const tick = m => `<span class="tk${m.read_at ? ' rd' : ''}" aria-label="${m.read_at ? 'تمت القراءة' : 'تم الإرسال'}"></span>`;
  const bubble = m => {
    const mine = m.sender_id === state.user.id;
    const content = m.kind === 'voice'
      ? (m.audio_url ? `<div class="voice"><audio controls preload="none" src="${esc(m.audio_url)}"></audio></div>` : `<div class="small">🎤 التسجيل غير متاح حاليًا</div>`)
      : esc(m.body);
    return `<div class="msg ${mine ? 'me' : ''} ${m.kind === 'voice' ? 'is-voice' : ''}" data-id="${esc(m.id)}">${content}<time>${fmtTime(m.sent_at)}${m.kind === 'voice' && m.audio_seconds ? ` · ${fmtDur(m.audio_seconds)}` : ''}${mine ? tick(m) : ''}</time>${mine ? '' : `<button class="rp" data-rp="${esc(m.id)}" aria-label="إبلاغ عن الرسالة" title="إبلاغ">${icon('flag')}</button>`}</div>`;
  };
  const add = list => { const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140; let html = ''; for (const m of list) { if (seen.has(m.id)) continue; seen.add(m.id); last = m.sent_at; html += bubble(m); } if (html) { if (box.querySelector('.empty')) box.innerHTML = ''; box.insertAdjacentHTML('beforeend', html); if (nearBottom || list.length > 1) box.scrollTop = box.scrollHeight; } };
  const markRead = ids => { for (const id of ids || []) box.querySelector(`[data-id="${CSS.escape(id)}"] .tk`)?.classList.add('rd'); };
  try { const res = await api(`/chats/${active}/messages`); const first = res.data; box.innerHTML = first.length ? '' : `<div class="empty">${icon('chat')}<p>قل أهلًا لـ ${esc(peer.name)}</p></div>`; add(first); markRead(res.read_ids); box.scrollTop = box.scrollHeight; peer.unread = 0; drawList(); refreshBadges(); } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; return; }
  box.onclick = e => { const b = e.target.closest('[data-rp]'); if (b) reportModal({ target_type: 'message', target_id: b.dataset.rp, title: 'إبلاغ عن رسالة' }); };
  $('#rpc').onclick = () => reportModal({ target_type: 'user', target_id: peer.user_id, reported_user_id: peer.user_id, title: `إبلاغ عن ${peer.name}` });

  // Live updates: Realtime events trigger an immediate fetch; the timer is only a safety net (6 s offline, 30 s when Realtime is healthy).
  let lastPoll = Date.now();
  const poll = async () => { if (document.hidden) return; lastPoll = Date.now(); try { const res = await api(`/chats/${active}/messages${last ? `?after=${encodeURIComponent(last)}` : ''}`); add(res.data); markRead(res.read_ids); } catch { /* ignore */ } };
  const timer = setInterval(() => { if (rtOk && Date.now() - lastPoll < 30000) return; poll(); }, 6000); state.cleanup.push(() => clearInterval(timer));
  let inboxT; const onDm = e => { const row = e.detail?.new; if (row?.connection_id === active) poll(); clearTimeout(inboxT); inboxT = setTimeout(reloadInbox, 400); };
  window.addEventListener('kw:dm', onDm);
  const onVisible = () => { if (!document.hidden) { poll(); reloadInbox(); } }; document.addEventListener('visibilitychange', onVisible);
  const onRt = e => { if (e.detail) { poll(); reloadInbox(); } }; window.addEventListener('kw:rt', onRt);   // reconnected → catch up on anything missed
  state.cleanup.push(() => { clearTimeout(inboxT); window.removeEventListener('kw:dm', onDm); window.removeEventListener('kw:rt', onRt); document.removeEventListener('visibilitychange', onVisible); });

  const ta = $('#ci'); ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#cf').requestSubmit(); } };
  $('#cf').onsubmit = async e => { e.preventDefault(); const body = ta.value.trim(); if (!body) return; ta.value = ''; ta.style.height = 'auto'; const btn = $('#sendbtn'); btn.disabled = true; try { const r = await api(`/chats/${active}/messages`, { method: 'POST', body: { body } }); add([r.data]); box.scrollTop = box.scrollHeight; } catch (x) { ta.value = body; toast(errMsg(x), 'err'); } finally { btn.disabled = false; ta.focus(); } };

  // Voice messages (MediaRecorder → low-bitrate Opus; needs HTTPS or localhost for microphone access).
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const micOk = secure && !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder;
  if (!micOk) { const mb = $('#mic'); mb.classList.add('off'); mb.onclick = () => toast(!secure ? 'التسجيل الصوتي يحتاج اتصالًا آمنًا: افتح الموقع من localhost أو من رابط https' : 'متصفحك لا يدعم التسجيل الصوتي — جرّب Chrome أو Safari حديث', 'err'); }
  const micErr = x => ({ NotAllowedError: 'الميكروفون محظور. اضغط على أيقونة القفل بجانب عنوان الموقع واسمح بالميكروفون', PermissionDeniedError: 'الميكروفون محظور. اسمح به من إعدادات المتصفح', NotFoundError: 'مفيش ميكروفون متوصّل بالجهاز', NotReadableError: 'الميكروفون مستخدم من برنامج تاني، اقفله وجرّب', SecurityError: 'المتصفح منع الميكروفون لأسباب أمان' })[x?.name] || `تعذّر تشغيل الميكروفون (${x?.name || 'خطأ'})`;
  let rec = null, recTimer = null;
  const endRec = () => { clearInterval(recTimer); rec?.stream.getTracks().forEach(t => t.stop()); $('#cf').classList.remove('recording'); $('#rbar').hidden = true; $('#mic')?.removeAttribute('disabled'); };
  const blobToDataUrl = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  if (micOk) $('#mic').onclick = async () => {
    if (rec) return;
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (x) { toast(micErr(x), 'err'); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    let mr; try { mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }); } catch (x) { stream.getTracks().forEach(t => t.stop()); toast(`المتصفح لا يقدر يسجّل صوت هنا (${x?.name || 'خطأ'})`, 'err'); return; }
    const me = rec = { mr, stream, chunks: [], t0: Date.now(), send: false };
    mr.ondataavailable = ev => { if (ev.data.size) me.chunks.push(ev.data); };
    mr.onerror = () => { toast('حصل خطأ أثناء التسجيل، جرّب تاني', 'err'); me.send = false; endRec(); rec = null; };
    mr.onstop = async () => {
      endRec(); rec = null;
      if (!me.send) return;
      const secs = Math.min(120, Math.max(1, Math.round((Date.now() - me.t0) / 1000)));
      const blob = new Blob(me.chunks, { type: mr.mimeType || type || 'audio/webm' });
      if (blob.size < 300) { toast('التسجيل قصير جدًا', 'err'); return; }
      if (blob.size > 1_400_000) { toast('التسجيل كبير جدًا', 'err'); return; }
      try { const out = await api(`/chats/${active}/voice`, { method: 'POST', body: { data_url: await blobToDataUrl(blob), seconds: secs } }); add([out.data]); box.scrollTop = box.scrollHeight; } catch (x) { console.error('voice upload failed', x); toast(x.code === 'UPLOAD_FAILED' || x.status >= 500 ? 'تعذّر حفظ التسجيل على الخادم. جرّب تاني، ولو اتكرر بلّغ المسؤول.' : errMsg(x), 'err'); }
    };
    mr.start(); $('#cf').classList.add('recording'); $('#rbar').hidden = false; $('#rt').textContent = '0:00';
    recTimer = setInterval(() => { const sec = Math.floor((Date.now() - me.t0) / 1000); $('#rt').textContent = fmtDur(sec); if (sec >= 120) $('#rsend').click(); }, 250);
  };
  $('#rcancel').onclick = () => { if (rec) { rec.send = false; try { rec.mr.stop(); } catch { endRec(); rec = null; } } };
  $('#rsend').onclick = () => { if (rec) { rec.send = true; try { rec.mr.stop(); } catch { endRec(); rec = null; } } };
  state.cleanup.push(() => { if (rec) { rec.send = false; try { rec.mr.stop(); } catch { /* ignore */ } } });
  ta.focus();
}
