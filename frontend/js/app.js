'use strict';
/* ───────── App shell, router, assistant, boot ───────── */
const isStaff = () => ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE_MANAGER', 'ADS_MANAGER'].includes(state.user?.role);
function stopLive() { for (const f of state.cleanup.splice(0)) { try { f(); } catch { /* ignore */ } } }
let badgeTimer = null;

async function loadCatalog() { try { [state.skills, state.cats] = await Promise.all([get('/skills', { auth: false }), get('/categories', { auth: false })]); } catch { /* retried lazily */ } }

async function enterApp(data) {
  saveSession(data.session); state.user = data.user;
  await loadCatalog();
  if (!location.hash || location.hash.includes('access_token')) history.replaceState(null, '', '#/home');
  renderShell(); route(); refreshBadges(); startBadgePolling(); startRealtime();
}

const NAV = [['home', 'الرئيسية', 'home'], ['listings', 'خد وهات', 'swap'], ['browse', 'الأشخاص', 'search'], ['connections', 'التواصل', 'users', 'requests'], ['chat', 'الرسائل', 'chat', 'messages'], ['proposals', 'العروض', 'send'], ['exchanges', 'تبادلاتي', 'swap'], ['jobs', 'الوظائف', 'brief'], ['notifications', 'الإشعارات', 'bell', 'notifs'], ['profile', 'ملفي', 'user']];
function navHtml() {
  const cur = (state.route?.[0]) || 'home';
  return `<nav class="nav" aria-label="القائمة الرئيسية">${NAV.map(([r, l, ic, b]) => `<a href="#/${r}" ${cur === r || (r === 'exchanges' && cur === 'exchange') ? 'aria-current="page"' : ''}>${icon(ic)}<span>${l}</span>${b && state.badges[b] ? `<span class="count">${arNum(state.badges[b])}</span>` : ''}</a>`).join('')}${isStaff() ? `<hr><a href="#/admin" ${cur === 'admin' ? 'aria-current="page"' : ''}>${icon('shield')}<span>لوحة الإدارة</span></a>` : ''}</nav>`;
}
function bottomHtml() {
  const cur = (state.route?.[0]) || 'home';
  const items = [['home', 'الرئيسية', 'home'], ['listings', 'خد وهات', 'swap'], ['chat', 'الرسائل', 'chat', 'messages'], ['notifications', 'الإشعارات', 'bell', 'notifs'], ['profile', 'حسابي', 'user']];
  return items.map(([r, l, ic, b]) => `<a href="#/${r}" ${cur === r ? 'aria-current="page"' : ''}>${icon(ic)}${l}${b && state.badges[b] ? `<span class="badge-dot">${state.badges[b] > 9 ? '9+' : state.badges[b]}</span>` : ''}</a>`).join('');
}
function topRightHtml() {
  return `<button class="icon-btn" id="tt" aria-label="تبديل الوضع الداكن">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
    <a class="icon-btn" href="#/chat" aria-label="الرسائل">${icon('chat')}${state.badges.messages ? `<span class="badge-dot">${state.badges.messages > 9 ? '9+' : state.badges.messages}</span>` : ''}</a>
    <a class="icon-btn" href="#/notifications" aria-label="الإشعارات">${icon('bell')}${state.badges.notifs ? `<span class="badge-dot">${state.badges.notifs > 9 ? '9+' : state.badges.notifs}</span>` : ''}</a>
    <button class="icon-btn" id="um" aria-haspopup="menu" aria-expanded="false" aria-label="حسابي" style="padding:0;border-radius:50%">${avatar(state.user, 's')}</button>`;
}
function renderShell() {
  $('#app').innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="#/home"><span class="mark">${icon('swap')}</span><span>خد وهات</span></a>
    <form class="search" id="gs" role="search">${icon('search')}<input class="input" id="gq" type="search" placeholder="ابحث عن مهارة أو شخص…" aria-label="بحث"></form><div class="row" id="tr" style="margin-inline-start:auto">${topRightHtml()}</div></header>
    <aside class="side" id="sd">${navHtml()}</aside><main class="main" id="view" tabindex="-1"></main></div><nav class="bottom" id="bn" aria-label="التنقل السريع">${bottomHtml()}</nav>
    <button class="fab" id="fab" aria-haspopup="dialog">${icon('spark')} المساعد</button>`;
  bindShell(); $('#gs').onsubmit = e => { e.preventDefault(); location.hash = `#/browse?q=${encodeURIComponent($('#gq').value.trim())}`; };
}
function bindShell() {
  $('#tt').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme; try { localStorage.setItem('kw-theme', state.theme); } catch { /* ignore */ } paintShell(); };
  $('#um').onclick = e => {
    const ex = $('#umenu'); if (ex) { ex.remove(); e.currentTarget.setAttribute('aria-expanded', 'false'); return; }
    const m = document.createElement('div'); m.className = 'menu'; m.id = 'umenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div style="padding:8px 12px"><b>${esc(state.user.name)}</b><div class="xs muted">${L.role[state.user.role]}</div></div><hr style="border:0;border-top:1px solid var(--border);margin:4px 0"><a href="#/profile" role="menuitem">${icon('user')} ملفي الشخصي</a><a href="#/connections" role="menuitem">${icon('users')} التواصل${state.badges.requests ? ` <span class="chip r">${state.badges.requests}</span>` : ''}</a><a href="#/listings" role="menuitem">${icon('swap')} خد وهات</a><a href="#/proposals" role="menuitem">${icon('send')} العروض</a><a href="#/exchanges" role="menuitem">${icon('swap')} تبادلاتي</a><a href="#/jobs" role="menuitem">${icon('brief')} الوظائف</a><a href="#/about" role="menuitem">${icon('info')} عن المشروع</a>${isStaff() ? `<a href="#/admin" role="menuitem">${icon('shield')} لوحة الإدارة</a>` : ''}<hr style="border:0;border-top:1px solid var(--border);margin:4px 0"><button role="menuitem" id="lo">${icon('logout')} تسجيل الخروج</button>`;
    document.body.append(m); e.currentTarget.setAttribute('aria-expanded', 'true');
    const close = ev => { if (!m.contains(ev.target) && ev.target.closest('#um') == null) { m.remove(); document.removeEventListener('mousedown', close); } };
    setTimeout(() => document.addEventListener('mousedown', close), 0); m.addEventListener('click', ev => { if (ev.target.closest('a,button')) m.remove(); }); document.addEventListener('keydown', ev => { if (ev.key === 'Escape') m.remove(); }, { once: true });
    $('#lo', m).onclick = async () => { clearInterval(badgeTimer); await signOutLocal(); };
  };
  $('#fab').onclick = toggleBot;
}
function paintShell() { if (!$('#tr')) return; $('#tr').innerHTML = topRightHtml(); $('#sd').innerHTML = navHtml(); $('#bn').innerHTML = bottomHtml(); bindShell(); }
function paintBadges() { paintShell(); }
async function refreshBadges() {
  if (!state.user) return;
  try {
    const [c, n, conns] = await Promise.all([get('/chats/unread'), api('/notifications'), Promise.resolve(null)]);
    state.badges = { messages: c.messages, requests: c.requests, notifs: n.unread }; paintShell(); void conns;
  } catch { /* ignore */ }
}
function startBadgePolling() { clearInterval(badgeTimer); badgeTimer = setInterval(() => { if (!document.hidden && state.user) refreshBadges(); }, 30000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) refreshBadges(); });

/* ───────── Router ───────── */
const VIEWS = { home: viewHome, listings: viewListings, listing: viewListing, proposals: viewProposals, browse: viewBrowse, user: viewUser, profile: viewProfile, connections: viewConnections, chat: viewChat, exchanges: viewExchanges, exchange: viewExchange, notifications: viewNotifications, jobs: viewJobs, about: viewAbout, admin: viewAdmin };
function parseHash() { const raw = location.hash.replace(/^#\/?/, ''); const [path, qs = ''] = raw.split('?'); const [name = 'home', ...params] = path.split('/').filter(Boolean); return { name: name || 'home', params: params.map(decodeURIComponent), qs: new URLSearchParams(qs) }; }
async function route() {
  if (!state.user) return;
  const { name, params, qs } = parseHash(); document.body.dataset.route = name; stopLive(); closeAllModals(); $('#umenu')?.remove();
  state.route = [name, params];
  const view = VIEWS[name] || viewHome; const el = $('#view'); if (!el) return;
  const mine = Symbol(); state.token = mine;
  $('#sd').innerHTML = navHtml(); $('#bn').innerHTML = bottomHtml();
  if (name === 'admin' && !isStaff()) { el.innerHTML = `<div class="card">${emptyState('shield', 'غير مصرّح لك.')}</div>`; return; }
  try { await view(el, params, qs); } catch (e) { if (state.token !== mine) return; el.innerHTML = `<div class="card">${emptyState('info', esc(errMsg(e)), '<button class="btn primary" onclick="route()">إعادة المحاولة</button>')}</div>`; }
  if (state.token === mine) { window.scrollTo({ top: 0 }); if (name !== 'chat') el.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', () => { if (state.user) route(); else if (!bootFromHash() && !state.session) renderAuth(); });

/* ───────── Assistant ───────── */
const bot = { open: false, history: [], busy: false };
function toggleBot() {
  const ex = $('#bot'); if (ex) { ex.remove(); $('#fab').setAttribute('aria-expanded', 'false'); bot.open = false; return; }
  bot.open = true; const el = document.createElement('section'); el.id = 'bot'; el.className = 'bot'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'مساعد خد وهات');
  el.innerHTML = `<header><span class="stat"><span class="ic" style="background:rgba(255,255,255,.2);color:#fff">${icon('spark')}</span></span><div class="grow"><b>مساعد خد وهات</b><div class="xs" style="opacity:.85">أسألني عن المهارات والتبادل والتواصل</div></div><button class="icon-btn" id="bx" aria-label="إغلاق" style="background:rgba(255,255,255,.15);border:0;color:#fff">${icon('x')}</button></header><div class="log" id="blog" aria-live="polite"></div>
    <div class="chips" id="bsug" style="padding:8px 12px 0"></div><form class="composer" id="bf"><input class="input" id="bi" maxlength="600" placeholder="اكتب سؤالك…" aria-label="سؤالك" autocomplete="off"><button class="btn primary" aria-label="إرسال" style="width:50px;padding:0">${icon('send')}</button></form>`;
  document.body.append(el); $('#fab').setAttribute('aria-expanded', 'true');
  $('#bx').onclick = toggleBot; el.addEventListener('keydown', e => { if (e.key === 'Escape') toggleBot(); });
  const log = $('#blog');
  const say = (text, who, actions = []) => { const d = document.createElement('div'); d.className = `m ${who}`; d.textContent = text; if (actions.length) { const w = document.createElement('div'); w.className = 'chips'; w.style.marginTop = '8px'; for (const a of actions) { const b = document.createElement('button'); b.className = 'btn sm'; b.type = 'button'; b.textContent = a.label; b.onclick = () => { location.hash = `#/${a.route}${a.query ? `?q=${encodeURIComponent(a.query)}` : ''}`; if (matchMedia('(max-width:1023px)').matches) toggleBot(); }; w.append(b); } d.append(w); } log.append(d); log.scrollTop = log.scrollHeight; return d; };
  if (!bot.history.length) say(`أهلًا ${state.user.name.split(' ')[0]}! أنا مساعد خد وهات. أقدر ألاقيلك شخص يعلّمك مهارة، أشرحلك التواصل والتبادل، أو أساعدك تكمّل ملفك.`, 'a'); else for (const h of bot.history) say(h.content, h.role === 'user' ? 'u' : 'a', h.actions || []);
  const sug = ['عايز أتعلم تصميم', 'إزاي أتواصل مع حد؟', 'ازاي أقوّي ملفي؟', 'إزاي أبلّغ عن مشكلة؟']; $('#bsug').innerHTML = sug.map(s => `<button class="chip" type="button" style="cursor:pointer">${s}</button>`).join(''); $$('#bsug .chip').forEach(b => b.onclick = () => send(b.textContent));
  const send = async text => {
    text = text.trim(); if (!text || bot.busy) return; bot.busy = true; $('#bi').value = ''; $('#bsug').innerHTML = ''; say(text, 'u');
    const typing = document.createElement('div'); typing.className = 'm a'; typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; log.append(typing); log.scrollTop = log.scrollHeight;
    try { const r = await api('/assistant', { method: 'POST', body: { message: text, history: bot.history.slice(-6).map(h => ({ role: h.role, content: h.content })) } }); typing.remove(); say(r.data.reply, 'a', r.data.actions || []); bot.history.push({ role: 'user', content: text }, { role: 'assistant', content: r.data.reply, actions: r.data.actions }); }
    catch (e) { typing.remove(); say(e.code === 'RATE_LIMITED' ? 'استنى شوية وجرّب تاني.' : 'حصلت مشكلة مؤقتة، جرّب تاني.', 'a'); }
    bot.busy = false; $('#bi')?.focus();
  };
  $('#bf').onsubmit = e => { e.preventDefault(); send($('#bi').value); }; $('#bi').focus();
}

/* ───────── Boot ───────── */
function bootFromHash() {
  if (!state.session && /^#\/about/.test(location.hash)) { renderAboutPublic(); return true; }   // public page, no account needed
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  if (h.get('access_token') && h.get('type') === 'recovery') { renderRecovery(h.get('access_token')); return true; }
  if (h.get('access_token') && ['signup', 'email', 'magiclink', 'invite'].includes(h.get('type'))) { history.replaceState(null, '', location.pathname); renderAuth({ mode: 'login', notice: 'تم تفعيل بريدك الإلكتروني. سجّل الدخول للمتابعة.' }); return true; }
  if (h.get('error_description')) { const msg = h.get('error_description').replace(/\+/g, ' '); history.replaceState(null, '', location.pathname); renderAuth({ mode: 'login', notice: '' }); toast(msg, 'err'); return true; }
  if (location.hash === '#reset-password') { renderAuth({ mode: 'forgot' }); return true; }
  return false;
}
(async function boot() {
  try { state.cfg = (await get('/config', { auth: false })); } catch { state.cfg = null; }
  if (bootFromHash()) return;
  if (!state.session) { renderAuth(); return; }
  $('#app').innerHTML = `<div style="display:grid;place-items:center;min-height:100vh"><span class="spin" style="width:34px;height:34px;color:var(--primary)"></span></div>`;
  try { const me = await get('/auth/me'); state.user = me.user; await loadCatalog(); renderShell(); route(); refreshBadges(); startBadgePolling(); startRealtime(); }
  catch (e) { if (e.code === 'ACCOUNT_BLOCKED') renderAuth({ blocked: e.details }); else if (e.code === 'NETWORK') { $('#app').innerHTML = `<div class="empty" style="min-height:100vh;display:grid;place-content:center">${icon('info')}<p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">إعادة المحاولة</button></div>`; } else { saveSession(null); renderAuth(); } }
})();
