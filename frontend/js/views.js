'use strict';
/* ───────── Ads (company advertisements) ───────── */
const adSid = (() => { try { let s = sessionStorage.getItem('kw-sid'); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('kw-sid', s); } return s; } catch { return 'anon'; } })();
const adObserver = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { adObserver.unobserve(e.target); api(`/ads/${e.target.dataset.ad}/impression`, { method: 'POST', body: { sid: adSid } }).catch(() => {}); } }), { threshold: .5 });
function adCard(ad, hero = false) {
  const url = safeUrl(ad.target_url); const img = safeUrl(ad.image_url); const logo = safeUrl(ad.logo_url);
  return `<article class="ad ${hero ? 'hero-ad' : ''}" data-ad="${esc(ad.id)}" aria-label="إعلان من ${esc(ad.advertiser_name)}"><span class="tag">إعلان</span>
    ${img ? `<img class="cover" src="${esc(img)}" alt="" loading="lazy">` : ''}
    <div class="grow"><div class="row gap-s xs" style="opacity:.85">${logo ? `<img src="${esc(logo)}" alt="" width="22" height="22" style="border-radius:6px;object-fit:cover">` : ''}<b>${esc(ad.advertiser_name)}</b></div>
    <h3 style="margin:4px 0">${esc(ad.title)}</h3>${ad.description ? `<p class="small" style="margin:0 0 10px;opacity:.9">${esc(ad.description)}</p>` : ''}
    ${url ? `<button class="btn ${hero ? '' : 'primary'} sm" data-adgo="${esc(url)}" data-adid="${esc(ad.id)}">${esc(ad.cta_label || 'اعرف أكثر')} ${icon('link')}</button>` : ''}</div></article>`;
}
function mountAds(root) {
  $$('[data-ad]', root).forEach(el => adObserver.observe(el));
  $$('[data-adgo]', root).forEach(b => b.onclick = () => { api(`/ads/${b.dataset.adid}/click`, { method: 'POST', body: { sid: adSid } }).catch(() => {}); window.open(b.dataset.adgo, '_blank', 'noopener,noreferrer'); });
}
const adsFor = placement => get(`/ads?placement=${placement}`, { auth: false }).catch(() => []);

/* ───────── shared bits ───────── */
function personCard(u) {
  const offers = (u.offers || []).slice(0, 4);
  return `<article class="card person"><div class="row" style="align-items:flex-start">${avatar(u)}<div class="grow"><h3 style="margin:0" class="trunc"><a href="#/user/${esc(u.id)}" style="color:inherit">${esc(u.name)}</a> ${u.is_verified ? verifiedBadge : ''}</h3>
      <div class="small muted trunc">${esc(u.headline || '—')}</div>${u.location ? `<div class="xs muted row gap-s" style="margin-top:2px">${icon('pin')}${esc(u.location)}</div>` : ''}</div></div>
    <div class="row gap-s wrap">${u.review_count ? `${stars(u.rating)} <b>${Number(u.rating).toFixed(1)}</b> <span class="xs muted">(${arNum(u.review_count)})</span>` : `<span class="chip n">جديد — بلا تقييم بعد</span>`}${u.exchanges ? `<span class="chip g">${arNum(u.exchanges)} تبادل</span>` : ''}</div>
    <div><div class="xs muted" style="margin-bottom:4px">يقدّم</div><div class="chips">${offers.length ? offers.map(o => `<span class="chip">${esc(o.name)}</span>`).join('') : '<span class="xs muted">لم يضف مهارات بعد</span>'}${(u.offers || []).length > 4 ? `<span class="chip n">+${(u.offers || []).length - 4}</span>` : ''}</div></div>
    ${u.they_teach?.length ? `<div class="alert ok xs">${icon('swap')}<span>يعلّمك: ${u.they_teach.map(esc).join('، ')}${u.they_want?.length ? ` · ويريد منك: ${u.they_want.map(esc).join('، ')}` : ''}</span></div>` : ''}
    <a class="btn primary sm" href="#/user/${esc(u.id)}" style="margin-top:auto">عرض الملف</a></article>`;
}
const pageHead = (title, sub = '', actions = '') => `<div class="page-head"><div><h1 style="margin:0;font-size:1.7rem">${title}</h1>${sub ? `<p class="muted" style="margin:4px 0 0">${sub}</p>` : ''}</div><div class="row wrap">${actions}</div></div>`;

function profileCompleteness(u, skills) {
  const items = [[!!u.avatar_url, 'أضف صورة شخصية'], [!!u.phone, 'أضف رقم هاتفك'], [!!u.bio, 'اكتب نبذة عنك'], [!!u.headline, 'أضف مسمّى تعريفي'], [skills.some(s => s.type === 'offer'), 'أضف مهارة تقدّمها'], [skills.some(s => s.type === 'need'), 'أضف مهارة تريد تعلّمها']];
  return { pct: Math.round(items.filter(i => i[0]).length / items.length * 100), todo: items.filter(i => !i[0]).map(i => i[1]) };
}

/* ───────── Home ───────── */
async function viewHome(el) {
  el.innerHTML = `<div class="home-loading">${skeletons(4)}</div>`;
  const [matches, skillMatches, mine, heroAds, feedAds, ex, stats] = await Promise.all([
    get('/listings/matches').catch(() => []),
    get('/users/matches').catch(() => []),
    get('/listings/mine').catch(() => []),
    adsFor('HOME_HERO'), adsFor('HOME_FEED'),
    get('/exchanges').catch(() => []),
    get('/stats', { auth: false }).catch(() => ({})),
  ]);
  const offers = mine.filter(x => x.mode === 'offer' && x.status === 'published');
  const needs = mine.filter(x => x.mode === 'need' && x.status === 'published');
  const open = ex.filter(x => ['pending','accepted','scheduled','in_progress'].includes(x.status)).length;
  const done = ex.filter(x => x.status === 'completed').length;
  const completion = Math.min(100, 25 + (offers.length ? 25 : 0) + (needs.length ? 25 : 0) + (state.user.bio ? 25 : 0));

  el.innerHTML = `<section class="home-hero-v3">
      <div class="hero-copy"><span class="eyebrow">KHOD & HAT · EXCHANGE ENGINE</span><h1>خُد اللي تحتاجه، وهات اللي تقدر عليه.</h1><p>منصة تبادل مصرية تربطك بالناس اللي عندهم ما تحتاجه — أو يحتاجوا اللي أنت بتعرف تعمله.</p>
        <form id="hs" class="hero-search"><span>${icon('search')}</span><input id="hq" placeholder="دوّر على مهارة، خدمة، منتج، وقت أو معرفة…" aria-label="البحث في خد وهات"><button class="btn primary" type="submit">ابدأ البحث ${icon('arrow')}</button></form>
        <div class="hero-quick"><button data-home-type="offer" class="quick-card"><span class="q-icon offer">${icon('up')}</span><b>أنا أقدّم</b><small>عندي شيء أقدر أبادله</small></button><button data-home-type="need" class="quick-card"><span class="q-icon need">${icon('down')}</span><b>أنا أحتاج</b><small>بدور على شخص يوفّر اللي ناقصني</small></button><a href="#/listings" class="quick-card"><span class="q-icon match">${icon('spark')}</span><b>شوف التطابقات</b><small>مطابقات ذكية حسب عروضك وطلباتك</small></a></div>
      </div>
      <div class="hero-orbit" aria-hidden="true"><div class="orbit-ring one"></div><div class="orbit-ring two"></div><div class="orbit-center"><span>خ</span></div><div class="orbit-node n1">${icon('skill')}</div><div class="orbit-node n2">${icon('users')}</div><div class="orbit-node n3">${icon('swap')}</div><div class="orbit-node n4">${icon('tag')}</div></div>
    </section>
    ${heroAds[0] ? `<div class="home-ad">${adCard(heroAds[0], true)}</div>` : ''}
    <section class="home-stats grid">
      <a class="card stat-v3" href="#/listings"><span class="stat-ico">${icon('swap')}</span><div><b>${arNum(mine.length)}</b><small>منشوراتك</small></div></a>
      <a class="card stat-v3" href="#/listings?mode=offer"><span class="stat-ico">${icon('up')}</span><div><b>${arNum(offers.length)}</b><small>عروضك</small></div></a>
      <a class="card stat-v3" href="#/listings?mode=need"><span class="stat-ico">${icon('down')}</span><div><b>${arNum(needs.length)}</b><small>طلباتك</small></div></a>
      <a class="card stat-v3" href="#/proposals"><span class="stat-ico">${icon('send')}</span><div><b>${arNum(open)}</b><small>اتفاقات مفتوحة</small></div></a>
      <a class="card stat-v3" href="#/exchanges"><span class="stat-ico">${icon('check')}</span><div><b>${arNum(done)}</b><small>تبادلات مكتملة</small></div></a>
    </section>
    <section class="home-section-grid">
      <div class="card profile-progress-v3"><div class="section-heading"><div><span class="eyebrow">YOUR PROFILE</span><h2>خلّي الناس تثق فيك أسرع</h2></div><b>${arNum(completion)}%</b></div><div class="meter"><i style="width:${completion}%"></i></div><p class="muted">${completion < 100 ? 'أكمل صورة ملفك، نبذتك، وعروضك وطلباتك عشان تحصل على Matching أقوى.' : 'ملفك جاهز لاستقبال تطابقات أكثر.'}</p><a class="btn ghost" href="#/profile">تحسين الملف ${icon('arrow')}</a></div>
      <div class="card trust-card-v3"><div class="section-heading"><div><span class="eyebrow">TRUST LAYER</span><h2>ثقة قبل التبادل</h2></div><span class="trust-pulse">${icon('shield')}</span></div><div class="trust-grid"><div><b>${state.user.is_verified ? 'موثّق' : 'غير موثّق'}</b><small>حالة الحساب</small></div><div><b>${state.user.rating ? Number(state.user.rating).toFixed(1) : '—'}</b><small>التقييم</small></div><div><b>${arNum(state.user.exchanges || 0)}</b><small>تبادلات</small></div></div><p class="small muted">المنصة تعرض مؤشرات الالتزام والتقييم قبل إرسال العروض.</p></div>
    </section>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">SMART MATCHES</span><h2>مطابقات صُنعت لك</h2></div><a class="btn sm ghost" href="#/listings">كل التطابقات ${icon('arrow')}</a></div>${matches.length ? `<div class="listing-grid">${matches.slice(0,4).map(x => listingCard(x,true)).join('')}</div>` : `<div class="empty card">${emptyState('spark','أضف عرضًا وطلبًا واحدًا على الأقل لنبدأ المطابقة الذكية.','<a class="btn primary" href="#/listings">أنشئ منشورك الأول</a>')}</div>`}</section>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">SKILLS NETWORK</span><h2>أشخاص ممكن يناسبوك</h2></div><a class="btn sm ghost" href="#/browse">استكشف الناس ${icon('arrow')}</a></div>${skillMatches.length ? `<div class="grid">${skillMatches.slice(0,3).map(personCard).join('')}</div>` : `<div class="card">${emptyState('users','لما تضيف مهاراتك، هنرشح لك أشخاص مناسبين للتعلم والتبادل.')}</div>`}</section>
    ${feedAds.length ? `<section class="section-block"><div class="section-heading"><div><span class="eyebrow">PARTNERS</span><h2>شركاء داخل المجتمع</h2></div></div><div class="col">${feedAds.slice(0,2).map(a => adCard(a)).join('')}</div></section>` : ''}`;
  $('#hs').onsubmit = e => { e.preventDefault(); location.hash = `#/listings?q=${encodeURIComponent($('#hq').value.trim())}`; };
  $$('[data-home-type]', el).forEach(b => b.onclick = () => listingEditor({ initialMode: b.dataset.homeType || 'offer', done: () => route() }));
  mountAds(el);
}

/* ───────── Browse ───────── */
async function viewBrowse(el, _p, qs) {
  const f = { search: qs.get('q') || '', category: qs.get('category') || '', skill: qs.get('skill') || '', verified: '', sort: 'rating', min_rating: '' };
  el.innerHTML = `${pageHead('استكشف المهارات والأشخاص', 'قارن التقييمات قبل ما تبعت طلب')}
    <div class="card mb"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end">
      <div class="field" style="margin:0;grid-column:span 2"><label for="fq">بحث</label><input class="input" id="fq" value="${esc(f.search)}" placeholder="اسم، مهارة، مدينة…"></div>
      <div class="field" style="margin:0"><label for="fc">التصنيف</label><select class="input" id="fc"><option value="">الكل</option>${state.cats.map(c => `<option value="${esc(c.id)}" ${f.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="fs">المهارة</label><select class="input" id="fs"><option value="">الكل</option>${state.skills.map(s => `<option value="${esc(s.id)}" ${f.skill === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="fr">أدنى تقييم</label><select class="input" id="fr"><option value="">أي تقييم</option><option value="4">4★ فأكثر</option><option value="3">3★ فأكثر</option></select></div>
      <div class="field" style="margin:0"><label for="fo">الترتيب</label><select class="input" id="fo"><option value="rating">الأعلى تقييمًا</option><option value="exchanges">الأكثر تبادلًا</option><option value="newest">الأحدث</option></select></div>
      <label class="check" style="min-height:46px"><input type="checkbox" id="fv"> موثّقون فقط</label></div></div>
    <div id="bads"></div><div id="bres">${skeletons(6)}</div>`;
  const run = async () => {
    const p = new URLSearchParams(); if (f.search) p.set('search', f.search); if (f.category) p.set('category', f.category); if (f.skill) p.set('skill', f.skill); if (f.verified) p.set('verified', '1'); if (f.min_rating) p.set('min_rating', f.min_rating); p.set('sort', f.sort);
    const box = $('#bres'); try { const list = await get(`/users?${p}`); box.innerHTML = list.length ? `<p class="muted small">${arNum(list.length)} نتيجة</p><div class="grid">${list.map(personCard).join('')}</div>` : `<div class="card">${emptyState('search', 'مفيش نتائج مطابقة. جرّب تغيّر البحث أو الفلاتر.')}</div>`; } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
  };
  const d = debounce(run, 350);
  $('#fq').oninput = e => { f.search = e.target.value.trim(); d(); };
  for (const [id, k] of [['fc', 'category'], ['fs', 'skill'], ['fr', 'min_rating'], ['fo', 'sort']]) $(`#${id}`).onchange = e => { f[k] = e.target.value; run(); };
  $('#fv').onchange = e => { f.verified = e.target.checked ? '1' : ''; run(); };
  run(); adsFor('BROWSE').then(a => { const b = $('#bads'); if (b && a[0]) { b.innerHTML = `<div class="mb">${adCard(a[0])}</div>`; mountAds(b); } });
}

/* ───────── Reports (generic) ───────── */
function reportModal({ target_type = 'user', target_id, reported_user_id, exchange_id, title = 'إبلاغ للإدارة' }) {
  const reasons = ['سلوك مسيء أو تحرش', 'احتيال أو نصب', 'طلب بيانات دفع أو كلمات مرور', 'عدم التزام بالموعد', 'محتوى مضلل أو سبام', 'انتحال شخصية', 'أخرى'];
  const m = openModal({ title, body: `<p class="muted small">بلاغك يصل للإدارة فقط ويُراجع بسرية. الإبلاغ الكاذب قد يعرّض حسابك للإجراء.</p><div class="field"><label for="rr">السبب</label><select class="input" id="rr">${reasons.map(r => `<option>${r}</option>`).join('')}</select></div><div class="field"><label for="rd">تفاصيل (اختياري)</label><textarea class="input" id="rd" maxlength="2000" placeholder="اشرح اللي حصل…"></textarea></div>`,
    footer: `<button class="btn ghost" data-x2>إلغاء</button><button class="btn danger" id="rs">${icon('flag')} إرسال البلاغ</button>` });
  m.$('[data-x2]').onclick = m.close;
  m.$('#rs').onclick = e => busy(e.currentTarget, async () => { await api('/reports', { method: 'POST', body: { target_type, target_id, reported_user_id, exchange_id, reason: m.$('#rr').value, description: m.$('#rd').value.trim() } }); toast('تم إرسال البلاغ، شكرًا لك', 'ok'); m.close(); });
}

/* ───────── Exchanges ───────── */
const otherOf = x => (x.sender_id === state.user.id ? { id: x.receiver_id, name: x.receiver_name, avatar_url: x.receiver_avatar } : { id: x.sender_id, name: x.sender_name, avatar_url: x.sender_avatar });
async function viewExchanges(el) {
  el.innerHTML = pageHead('تبادلاتي', 'كل طلباتك وتبادلاتك في مكان واحد') + skeletons(3);
  const list = await get('/exchanges'); let tab = 'all';
  const groups = { all: () => true, pending: x => x.status === 'pending', active: x => ['accepted', 'scheduled', 'in_progress'].includes(x.status), done: x => ['completed'].includes(x.status), closed: x => ['cancelled', 'rejected', 'disputed'].includes(x.status) };
  const names = { all: 'الكل', pending: 'بانتظار الرد', active: 'جارية', done: 'مكتملة', closed: 'ملغاة/مرفوضة' };
  const draw = () => {
    const rows = list.filter(groups[tab]);
    el.innerHTML = pageHead('تبادلاتي', 'كل طلباتك وتبادلاتك في مكان واحد', '<a class="btn primary" href="#/browse">' + icon('plus') + ' تبادل جديد</a>') +
      `<div class="tabs" role="tablist">${Object.entries(names).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === tab}" data-t="${k}">${v} <span class="xs">(${arNum(list.filter(groups[k]).length)})</span></button>`).join('')}</div>` +
      (rows.length ? `<div class="col">${rows.map(x => { const o = otherOf(x); const mine = x.sender_id === state.user.id; return `<a class="card row" href="#/exchange/${esc(x.id)}" style="text-decoration:none;color:inherit">${avatar(o)}<div class="grow"><b>${esc(o.name)}</b><div class="small muted">${mine ? 'تقدّم' : 'يقدّم'} <b>${esc(x.offered_skill)}</b> ${icon('swap')} ${mine ? 'وتأخذ' : 'ويأخذ'} <b>${esc(x.requested_skill)}</b></div><div class="xs muted">${ago(x.updated_at || x.created_at)}</div></div><div class="col" style="align-items:flex-end;gap:6px">${chip(L.exchange, x.status)}${x.status === 'pending' && !mine ? '<span class="chip w">بانتظار ردّك</span>' : ''}</div></a>`; }).join('')}</div>` : `<div class="card">${emptyState('swap', 'مفيش تبادلات هنا لسه.', '<a class="btn primary" href="#/browse">ابدأ بالاستكشاف</a>')}</div>`);
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
  };
  draw();
}

async function viewExchange(el, [id]) {
  el.innerHTML = skeletons(2);
  const reload = () => viewExchange(el, [id]);
  const x = await get(`/exchanges/${id}`); const me = state.user.id; const o = otherOf(x); const isRecv = x.receiver_id === me;
  const act = async (status, label) => { if (['cancelled', 'rejected'].includes(status) && !(await confirmBox({ title: label, message: 'هل أنت متأكد؟', confirmText: label, danger: true }))) return; try { const r = await api(`/exchanges/${id}/status`, { method: 'PATCH', body: { status } }); toast(r.data.completion_pending ? 'تم إرسال طلب الإنهاء، بانتظار تأكيد الطرف الآخر' : 'تم التحديث', 'ok'); reload(); } catch (e) { toast(errMsg(e), 'err'); } };
  const btns = [];
  if (x.status === 'pending') btns.push(isRecv ? `<button class="btn success" data-a="accepted">${icon('check')} قبول</button><button class="btn ghost" data-a="rejected">رفض</button>` : `<button class="btn ghost" data-a="cancelled">إلغاء الطلب</button>`);
  if (['accepted', 'scheduled'].includes(x.status)) btns.push(`<button class="btn primary" data-a="in_progress">بدء التبادل</button>`);
  if (['accepted', 'scheduled', 'in_progress'].includes(x.status)) btns.push(`<button class="btn" id="sess">${icon('clock')} تحديد جلسة</button>`);
  if (['in_progress', 'scheduled'].includes(x.status)) btns.push(x.completion_requested_by === me ? `<span class="chip w">بانتظار تأكيد ${esc(o.name)} للإنهاء</span>` : `<button class="btn success" data-a="completed">${icon('check')} ${x.completion_requested_by ? 'تأكيد الإنهاء' : 'طلب إنهاء التبادل'}</button>`);
  if (['accepted', 'scheduled', 'in_progress'].includes(x.status)) btns.push(`<button class="btn ghost" data-a="cancelled">إلغاء التبادل</button>`);
  if (x.status === 'completed' && !x.reviewed_by_me) btns.push(`<button class="btn primary" id="rev">${icon('star')} قيّم ${esc(o.name)}</button>`);
  const conn = x.connection;
  el.innerHTML = `<a class="btn ghost sm" href="#/exchanges">${icon('arrow')} تبادلاتي</a>
    <div class="card mt"><div class="row wrap between"><div class="row">${avatar(o, '')}<div><h2 style="margin:0"><a href="#/user/${esc(o.id)}" style="color:inherit">${esc(o.name)}</a></h2><div class="small muted">${L.deal[x.deal_type] || ''} · أُنشئ ${ago(x.created_at)}</div></div></div>${chip(L.exchange, x.status)}</div>
      <div class="grid2 mt"><div class="card flat" style="background:var(--primary-50)"><div class="xs muted">${x.sender_id === me ? 'ستقدّم' : 'سيقدّم'}</div><b>${esc(x.offered_skill)}</b></div><div class="card flat" style="background:var(--accent-50)"><div class="xs muted">${x.sender_id === me ? 'ستأخذ' : 'سيأخذ'}</div><b>${esc(x.requested_skill)}</b></div></div>
      ${x.message ? `<p class="mt"><span class="muted small">الرسالة:</span> ${esc(x.message)}</p>` : ''}
      <div class="row wrap mt">${btns.join('')}${conn?.status === 'accepted' ? `<a class="btn" href="#/chat/${esc(conn.id)}">${icon('chat')} مراسلة</a>` : conn?.status === 'pending' ? '<span class="chip w">طلب التواصل قيد الانتظار</span>' : `<button class="btn" id="cn">${icon('users')} طلب تواصل</button>`}<button class="btn ghost" id="rp">${icon('flag')} إبلاغ</button></div></div>
    <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="card"><h3>المسار الزمني</h3><ul class="timeline">${x.events.map(e => `<li><b class="small">${esc(e.note || e.event_type)}</b><div class="xs muted">${esc(e.actor_name || 'النظام')} · ${ago(e.created_at)}</div></li>`).join('')}</ul></div>
      <div class="card"><h3>الجلسات</h3>${x.sessions.length ? x.sessions.map(s => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)"><div><b class="small">${fmtDate(s.scheduled_at)} · ${fmtTime(s.scheduled_at)}</b><div class="xs muted">${arNum(s.duration)} دقيقة${s.notes ? ' · ' + esc(s.notes) : ''}</div></div><div class="row gap-s">${chip({ upcoming: ['قادمة', 'b'], completed: ['تمت', 'g'], cancelled: ['ملغاة', 'n'], no_show: ['لم يحضر', 'r'] }, s.status)}${s.status === 'upcoming' ? `<button class="btn sm ghost" data-ss="${esc(s.id)}" data-st="completed" aria-label="تمت">${icon('check')}</button>` : ''}</div></div>`).join('') : '<p class="muted small">لسه ما فيش جلسات.</p>'}</div></div>`;
  $$('[data-a]', el).forEach(b => b.onclick = () => act(b.dataset.a, b.textContent.trim()));
  $$('[data-ss]', el).forEach(b => b.onclick = async () => { await api(`/sessions/${b.dataset.ss}`, { method: 'PATCH', body: { status: b.dataset.st } }).catch(e => toast(errMsg(e), 'err')); reload(); });
  $('#rp').onclick = () => reportModal({ target_type: 'exchange', target_id: id, title: 'إبلاغ عن هذا التبادل' });
  $('#cn')?.addEventListener('click', () => connectModal(o.id, o.name, reload));
  $('#sess')?.addEventListener('click', () => sessionModal(x, o, reload));
  $('#rev')?.addEventListener('click', () => reviewModal(x, o, reload));
}
function sessionModal(x, o, done) {
  const m = openModal({ title: 'تحديد جلسة', body: `<div class="grid2"><div class="field"><label for="sd">التاريخ والوقت</label><input class="input" id="sd" type="datetime-local" required></div><div class="field"><label for="sl">المدة (دقيقة)</label><input class="input" id="sl" type="number" min="15" max="480" step="15" value="60"></div></div>
    <div class="field"><label for="st">من سيقدّم الجلسة؟</label><select class="input" id="st"><option value="${esc(state.user.id)}">أنا</option><option value="${esc(o.id)}">${esc(o.name)}</option></select></div><div class="field"><label for="sn">ملاحظات / رابط الاجتماع</label><textarea class="input" id="sn" maxlength="1000"></textarea></div>`,
    footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">حفظ الجلسة</button>' });
  m.$('[data-x2]').onclick = m.close;
  m.$('#ok').onclick = e => busy(e.currentTarget, async () => { const v = m.$('#sd').value; if (!v) throw new Error('اختر التاريخ والوقت'); const teacher = m.$('#st').value; const learner = teacher === state.user.id ? o.id : state.user.id;
    await api(`/exchanges/${x.id}/sessions`, { method: 'POST', body: { teacher_id: teacher, learner_id: learner, scheduled_at: new Date(v).toISOString(), duration: Number(m.$('#sl').value) || 60, notes: m.$('#sn').value.trim() } }); toast('تم حفظ الجلسة', 'ok'); m.close(); done(); });
}
function reviewModal(x, o, done) {
  const m = openModal({ title: `قيّم ${o.name}`, body: `<div class="field"><label>التقييم العام *</label>${rateInput('rating')}</div><div class="grid2"><div class="field"><label>التواصل</label>${rateInput('communication_rating')}</div><div class="field"><label>المعرفة</label>${rateInput('knowledge_rating')}</div></div><div class="field"><label>الالتزام</label>${rateInput('commitment_rating')}</div><div class="field"><label for="rc">تعليقك</label><textarea class="input" id="rc" maxlength="1500" placeholder="شاركنا تجربتك…"></textarea></div>`, footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">نشر التقييم</button>' });
  bindRate(m.el); m.$('[data-x2]').onclick = m.close;
  m.$('#ok').onclick = e => busy(e.currentTarget, async () => { const v = n => Number($(`[data-rate=${n}]`, m.el).dataset.val) || undefined; if (!v('rating')) throw new Error('اختر التقييم العام'); await api(`/exchanges/${x.id}/reviews`, { method: 'POST', body: { rating: v('rating'), communication_rating: v('communication_rating'), knowledge_rating: v('knowledge_rating'), commitment_rating: v('commitment_rating'), comment: m.$('#rc').value.trim() } }); toast('شكرًا لتقييمك', 'ok'); m.close(); done(); });
}

/* ───────── Notifications ───────── */
async function viewNotifications(el) {
  el.innerHTML = skeletons(2);
  const j = await api('/notifications'); const list = j.data;
  const ic = { exchange_request: 'swap', exchange_update: 'swap', connection_request: 'users', connection_accepted: 'users', new_message: 'chat', review_received: 'star', account_status: 'shield', moderation: 'shield', job_moderation: 'brief', report_update: 'flag', report_created: 'flag' };
  el.innerHTML = pageHead('الإشعارات', '', list.some(n => !n.is_read) ? '<button class="btn ghost" id="ra">تعليم الكل كمقروء</button>' : '') +
    (list.length ? `<div class="col">${list.map(n => `<button class="card row" data-n="${esc(n.id)}" data-rt="${esc(n.reference_type || '')}" data-ri="${esc(n.reference_id || '')}" style="text-align:start;width:100%;${n.is_read ? '' : 'border-color:var(--primary);background:var(--primary-50)'}"><span class="stat"><span class="ic">${icon(ic[n.type] || 'bell')}</span></span><div class="grow"><b>${esc(n.title)}</b><div class="small muted">${esc(n.body)}</div></div><span class="xs muted nowrap">${ago(n.created_at)}</span></button>`).join('')}</div>` : `<div class="card">${emptyState('bell', 'مفيش إشعارات.')}</div>`);
  $('#ra')?.addEventListener('click', async () => { await api('/notifications/read-all', { method: 'POST' }); state.badges.notifs = 0; paintBadges(); viewNotifications(el); });
  $$('[data-n]', el).forEach(b => b.onclick = async () => { api(`/notifications/${b.dataset.n}/read`, { method: 'POST' }).catch(() => {}); const t = b.dataset.rt, i = b.dataset.ri; location.hash = t === 'exchange' && i ? `#/exchange/${i}` : t === 'connection' ? '#/connections' : t === 'chat' && i ? `#/chat/${i}` : t === 'job' ? '#/jobs' : '#/notifications'; });
}

/* ───────── Jobs ───────── */
async function viewJobs(el) {
  let tab = 'all', q = '';
  const draw = async () => {
    const list = tab === 'mine' ? await get('/jobs/mine') : await get(`/jobs?q=${encodeURIComponent(q)}`);
    el.innerHTML = pageHead('فرص العمل', 'فرص منشورة بعد مراجعة الإدارة', '<button class="btn primary" id="nj">' + icon('plus') + ' أضف فرصة</button>') +
      `<div class="row wrap mb"><div class="tabs" style="margin:0" role="tablist"><button class="tab" role="tab" aria-selected="${tab === 'all'}" data-t="all">كل الفرص</button><button class="tab" role="tab" aria-selected="${tab === 'mine'}" data-t="mine">فرصي</button></div>${tab === 'all' ? `<input class="input grow" id="jq" placeholder="ابحث عن فرصة…" value="${esc(q)}" style="max-width:340px">` : ''}</div>` +
      (list.length ? `<div class="grid">${list.map(j => `<article class="card col"><div class="row between"><h3 style="margin:0">${esc(j.title)}</h3>${tab === 'mine' ? chip(L.job, j.status) : ''}</div><div class="small muted">${esc(j.company || j.owner_name || '')} ${j.owner_verified ? verifiedBadge : ''} · ${esc(j.location || '—')}</div><div class="chips"><span class="chip b">${L.jobType[j.job_type] || ''}</span>${(j.required_skills || '').split(',').filter(s => s.trim()).slice(0, 4).map(s => `<span class="chip">${esc(s.trim())}</span>`).join('')}</div><p class="small" style="margin:0">${esc(j.description.slice(0, 220))}${j.description.length > 220 ? '…' : ''}</p>${tab === 'mine' && j.status !== 'closed' ? `<button class="btn ghost sm" data-close="${esc(j.id)}">إغلاق الفرصة</button>` : ''}</article>`).join('')}</div>` : `<div class="card">${emptyState('brief', tab === 'mine' ? 'لم تضف فرصًا بعد.' : 'مفيش فرص منشورة حاليًا.')}</div>`);
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    $('#jq')?.addEventListener('input', debounce(e => { q = e.target.value.trim(); draw().then(() => { const i = $('#jq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400));
    $$('[data-close]', el).forEach(b => b.onclick = async () => { await api(`/jobs/${b.dataset.close}/close`, { method: 'POST' }); draw(); });
    $('#nj').onclick = () => jobModal(draw);
  };
  await draw();
}
function jobModal(done) {
  const m = openModal({ title: 'فرصة عمل جديدة', body: `<p class="muted small">تُراجع الفرصة من الإدارة قبل ظهورها للعامة.</p><div class="field"><label for="jt">المسمى</label><input class="input" id="jt" maxlength="180"></div><div class="grid2"><div class="field"><label for="jc">الشركة / الجهة</label><input class="input" id="jc" maxlength="180"></div><div class="field"><label for="jl">المكان</label><input class="input" id="jl" maxlength="180"></div></div><div class="grid2"><div class="field"><label for="jy">نوع العمل</label><select class="input" id="jy"><option value="remote">عن بُعد</option><option value="hybrid">هجين</option><option value="on_site">حضوري</option></select></div><div class="field"><label for="js">المهارات المطلوبة</label><input class="input" id="js" placeholder="Figma, Excel…" maxlength="400"></div></div><div class="field"><label for="jd">الوصف</label><textarea class="input" id="jd" maxlength="6000"></textarea></div>`, footer: '<button class="btn ghost" data-x2>إلغاء</button><button class="btn primary" id="ok">إرسال للمراجعة</button>' });
  m.$('[data-x2]').onclick = m.close;
  m.$('#ok').onclick = e => busy(e.currentTarget, async () => { await api('/jobs', { method: 'POST', body: { title: m.$('#jt').value.trim(), company: m.$('#jc').value.trim(), location: m.$('#jl').value.trim(), job_type: m.$('#jy').value, required_skills: m.$('#js').value.trim(), description: m.$('#jd').value.trim() } }); toast('تم الإرسال للمراجعة', 'ok'); m.close(); done(); });
}
