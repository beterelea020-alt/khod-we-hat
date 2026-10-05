'use strict';
/* ───────── helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const safeUrl = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arNum = n => Number(n || 0).toLocaleString('ar-EG');

const state = {
  user: null, session: null, theme: document.documentElement.dataset.theme || 'light',
  badges: { messages: 0, requests: 0, notifs: 0 }, cfg: null, skills: [], cats: [], route: null, cleanup: [],
};
try { state.session = JSON.parse(localStorage.getItem('kw-session') || 'null'); } catch { /* ignore */ }

/* ───────── icons (inline SVG, no emoji) ───────── */
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  users: '<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 4.5a3.3 3.3 0 0 1 0 6.5M21 20v-1a4 4 0 0 0-3-3.85"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5"/>',
  swap: '<path d="M3 7h14l-3-3"/><path d="M21 17H7l3 3"/>',
  skill: '<path d="M9 21h6M10 17h4M8 14a6 6 0 1 1 8 0c-.8.7-1 1.6-1 3H9c0-1.4-.2-2.3-1-3Z"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.2 8.2 0 0 1-4.2-1.1L3 19l1.3-4A7.2 7.2 0 0 1 4.5 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>',
  shield: '<path d="M12 3 20 6v5c0 5-3.3 8.1-8 10-4.7-1.9-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5L4 12Z"/>', arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.7A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.3-1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cam: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
  edit: '<path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  chart: '<path d="M4 19V5M4 19h17"/><path d="M8 16v-5M12 16V8M16 16v-3M20 16v-7"/>', ad: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h5M7 11h8"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  log: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M5 12l7 7 7-7"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const stars = (r, n = 5) => { r = Math.round(Number(r) || 0); return `<span class="stars" role="img" aria-label="${r} من ${n}">${Array.from({ length: n }, (_, i) => `<svg viewBox="0 0 24 24" class="${i < r ? '' : 'off'}"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>`).join('')}</span>`; };
const verifiedBadge = `<span class="verified" title="حساب موثّق"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 2 3.1-.2 1 3 2.6 1.8-.9 3 .9 3-2.6 1.8-1 3-3.1-.2L12 22l-2.4-2-3.1.2-1-3-2.6-1.8.9-3-.9-3 2.6-1.8 1-3 3.1.2L12 2Z"/><path d="m8.5 12.2 2.4 2.4 4.6-5" fill="none" stroke="#fff" stroke-width="2"/></svg></span>`;

const COLORS = ['#DC2626', '#0369A1', '#15803D', '#B45309', '#BE185D', '#0F766E', '#9F1239', '#C2410C'];
function avatar(u, cls = '') {
  const name = u?.name || u?.reviewer_name || '?';
  const src = u?.avatar_url || u?.reviewer_avatar || u?.sender_avatar || u?.receiver_avatar;
  if (src && safeUrl(src)) return `<img class="av ${cls}" src="${esc(safeUrl(src))}" alt="${esc(name)}" loading="lazy" decoding="async">`;
  const ini = name.trim().split(/\s+/).slice(0, 2).map(x => [...x][0]).join('') || '?';
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av ${cls}" style="background:${COLORS[h % COLORS.length]}" aria-hidden="true">${esc(ini)}</span>`;
}
const fmtDate = v => { try { return new Date(v).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const fmtTime = v => { try { return new Date(v).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
function ago(v) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'الآن'; if (s < 3600) return `منذ ${arNum(Math.floor(s / 60))} د`; if (s < 86400) return `منذ ${arNum(Math.floor(s / 3600))} س`;
  if (s < 604800) return `منذ ${arNum(Math.floor(s / 86400))} يوم`; return fmtDate(v);
}

const L = {
  exchange: { pending: ['بانتظار الرد', 'w'], accepted: ['مقبول', 'g'], scheduled: ['تمت الجدولة', 'b'], in_progress: ['جارٍ', 'b'], completed: ['مكتمل', 'g'], disputed: ['نزاع', 'r'], cancelled: ['ملغي', 'n'], rejected: ['مرفوض', 'r'] },
  report: { open: ['جديد', 'r'], investigating: ['قيد المراجعة', 'w'], resolved: ['تم الحل', 'g'], dismissed: ['مرفوض', 'n'] },
  account: { active: ['نشط', 'g'], suspended: ['موقوف مؤقتًا', 'w'], banned: ['محظور', 'r'], closed: ['مغلق', 'r'] },
  job: { pending: ['قيد المراجعة', 'w'], published: ['منشور', 'g'], rejected: ['مرفوض', 'r'], closed: ['مغلق', 'n'], suspended: ['موقوف', 'r'] },
  jobType: { remote: 'عن بُعد', hybrid: 'هجين', on_site: 'حضوري' },
  level: { Beginner: 'مبتدئ', Intermediate: 'متوسط', Advanced: 'متقدم', Expert: 'خبير' },
  role: { USER: 'عضو', SUPER_ADMIN: 'مدير عام', ADMIN: 'مدير', MODERATOR: 'مشرف', SUPPORT: 'دعم', FINANCE_MANAGER: 'مالية', ADS_MANAGER: 'مدير إعلانات' },
  target: { user: 'مستخدم', exchange: 'تبادل', message: 'رسالة', review: 'تقييم', skill: 'مهارة', advertisement: 'إعلان' },
  placement: { HOME_HERO: 'واجهة الرئيسية (كبير)', HOME_FEED: 'الرئيسية (وسط الصفحة)', BROWSE: 'صفحة الاستكشاف', SIDEBAR: 'جانبي' },
  deal: { swap: 'تبادل مهارات', paid: 'مدفوع' },
};
const chip = (map, k) => { const [t, c] = map[k] || [k, 'n']; return `<span class="chip ${c}">${esc(t)}</span>`; };

/* ───────── API ───────── */
class ApiError extends Error { constructor(m, code, status, details, errors) { super(m); this.code = code; this.status = status; this.details = details; this.errors = errors; } }
const saveSession = s => { state.session = s; try { s ? localStorage.setItem('kw-session', JSON.stringify(s)) : localStorage.removeItem('kw-session'); } catch { /* ignore */ } };
let refreshing = null;
async function refreshSession() {
  if (!state.session?.refresh_token) return false;
  refreshing ||= fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: state.session.refresh_token }) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.success) return false; saveSession(j.data.session); state.user = j.data.user; window.dispatchEvent(new Event('kw:token')); return true; })
    .catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}
async function api(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && state.session?.access_token) headers.authorization = `Bearer ${state.session.access_token}`;
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError('تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.', 'NETWORK', 0); }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && auth && retry && state.session && ['AUTH_INVALID', 'AUTH_REQUIRED'].includes(json.code)) {
    if (await refreshSession()) return api(path, { method, body, auth, retry: false });
    await signOutLocal(); throw new ApiError('انتهت الجلسة. سجّل الدخول من جديد.', 'AUTH_INVALID', 401);
  }
  if (res.status === 403 && json.code === 'ACCOUNT_BLOCKED' && state.user) { await signOutLocal(json.details); throw new ApiError(json.message, json.code, 403, json.details); }
  if (!res.ok || json.success === false) throw new ApiError(json.message || 'حدث خطأ غير متوقع', json.code, res.status, json.details, json.errors);
  return json;
}
const get = (p, o) => api(p, o).then(j => j.data);

/* ───────── UI: toast / modal / confirm ───────── */
function toast(msg, kind = '') { const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = msg; $('#toasts').append(el); setTimeout(() => el.remove(), 4200); }
const errMsg = e => (e?.errors?.fieldErrors && Object.values(e.errors.fieldErrors).flat()[0]) || e?.message || 'حدث خطأ';
let modalStack = [];
function openModal({ title, body, footer = '', wide = false, onMount, onClose } = {}) {
  const root = $('#modal-root'); const prev = document.activeElement;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="إغلاق">${icon('x')}</button></div><div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
  const close = () => { ov.remove(); modalStack = modalStack.filter(m => m !== api2); onClose?.(); prev?.focus?.(); };
  const api2 = { el: ov, close, $: s => $(s, ov), $$: s => $$(s, ov) };
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { const f = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', ov).filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } }
  });
  $('[data-x]', ov).onclick = close;
  root.append(ov); modalStack.push(api2);
  (ov.querySelector('[autofocus],input:not([type=hidden]),select,textarea') || $('[data-x]', ov)).focus();
  onMount?.(api2); return api2;
}
const closeAllModals = () => [...modalStack].forEach(m => m.close());
function confirmBox({ title, message, confirmText = 'تأكيد', danger = false }) {
  return new Promise(res => {
    let done = false; const finish = v => { if (!done) { done = true; res(v); } };
    const m = openModal({ title, body: `<p>${message}</p>`, footer: `<button class="btn ghost" data-no>إلغاء</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(confirmText)}</button>`, onClose: () => finish(false) });
    m.$('[data-no]').onclick = () => m.close(); m.$('[data-yes]').onclick = () => { finish(true); m.close(); };
  });
}
/** Runs an async action on a button with a spinner and error toast. */
async function busy(btn, fn) {
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try { return await fn(); } catch (e) { toast(errMsg(e), 'err'); return undefined; } finally { btn.disabled = false; btn.innerHTML = html; }
}
const emptyState = (ic, text, extra = '') => `<div class="empty">${icon(ic)}<p>${text}</p>${extra}</div>`;
const skeletons = (n = 6) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skel" style="height:190px"></div>').join('')}</div>`;

/* image → resized JPEG data URL (keeps uploads small and under Vercel's body limit) */
function resizeImage(file, max = 480, q = .85) {
  return new Promise((res, rej) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('اختر صورة JPG أو PNG أو WebP'));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('تعذّر قراءة الصورة')); }; img.src = url;
  });
}
function rateInput(name, val = 0) {
  return `<div class="rate-in" role="radiogroup" aria-label="${esc(name)}" data-rate="${esc(name)}" data-val="${val}">${[1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" aria-checked="false" aria-label="${i}" data-v="${i}">${`<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>`}</button>`).join('')}</div>`;
}
function bindRate(root) {
  $$('.rate-in', root).forEach(g => { const paint = () => $$('button', g).forEach(b => { const on = Number(b.dataset.v) <= Number(g.dataset.val); b.classList.toggle('on', on); b.setAttribute('aria-checked', Number(b.dataset.v) === Number(g.dataset.val)); }); g.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { g.dataset.val = b.dataset.v; paint(); } }); paint(); });
}
