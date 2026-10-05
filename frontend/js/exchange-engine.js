'use strict';
/* ───────── Universal Exchange Engine UI ───────── */
const EX_ASSETS = {
  skill: ['مهارة', 'skill'], service: ['خدمة', 'brief'], product: ['منتج / شيء', 'tag'],
  time: ['وقت / مساعدة', 'clock'], knowledge: ['معرفة', 'spark'], other: ['شيء آخر', 'swap'],
};
const EX_MODES = { offer: ['أنا أقدّم', 'عرض'], need: ['أنا أحتاج', 'طلب'] };
const EX_DELIVERY = { online: 'أونلاين', in_person: 'حضوري', both: 'أونلاين أو حضوري' };

function listingCard(x, compact = false) {
  const [assetLabel, assetIcon] = EX_ASSETS[x.asset_type] || EX_ASSETS.other;
  const typeTag = x.mode === 'offer' ? `<span class="chip g">أقدّم ${esc(assetLabel)}</span>` : `<span class="chip b">أحتاج ${esc(assetLabel)}</span>`;
  const score = Number(x.match_score || 0);
  return `<article class="listing-card card ${compact ? 'compact' : ''}">
    <div class="listing-top"><div class="row gap-s wrap">${typeTag}<span class="chip n">${icon(assetIcon, '')}${esc(EX_DELIVERY[x.delivery_mode] || x.delivery_mode || 'مرن')}</span></div>${score ? `<span class="match-score"><b>${score}%</b> توافق</span>` : ''}</div>
    <div class="row listing-owner"><div class="avatar-ring">${avatar({name:x.owner_name, avatar_url:x.owner_avatar}, 's')}</div><div class="grow"><b class="trunc">${esc(x.owner_name || 'عضو')}</b>${x.owner_verified ? verifiedBadge : ''}<div class="xs muted">${esc(x.owner_city || x.city || 'مصر')} · ${x.owner_rating > 0 ? `${Number(x.owner_rating).toFixed(1)}★` : 'عضو جديد'}</div></div></div>
    <h3 class="listing-title">${esc(x.title)}</h3>
    ${x.description ? `<p class="small muted listing-desc">${esc(x.description)}</p>` : ''}
    <div class="chips">${x.category_name ? `<span class="chip n">${esc(x.category_name)}</span>` : ''}${x.skill_name ? `<span class="chip">${esc(x.skill_name)}</span>` : ''}${x.city ? `<span class="chip n">${esc(x.city)}</span>` : ''}</div>
    ${score && x.match_reasons?.length ? `<div class="match-reasons">${x.match_reasons.slice(0,3).map(r => `<span>${icon('check',14)}${esc(r)}</span>`).join('')}</div>` : ''}
    <div class="listing-foot"><span class="xs muted">${fmtDate(x.created_at)}</span><a class="btn primary sm" href="#/listing/${esc(x.id)}">${x.mode === 'need' ? 'قدّم عرضًا' : 'شوف التفاصيل'} ${icon('arrow')}</a></div>
  </article>`;
}

function listingEditor({ listing = null, initialMode = 'offer', done = () => {} } = {}) {
  const skillOpts = state.skills.map(s => `<option value="${esc(s.id)}" ${String(listing?.skill_id || '') === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const catOpts = state.cats.map(c => `<option value="${esc(c.id)}" ${String(listing?.category_id || '') === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const m = openModal({
    title: listing ? 'تعديل العرض أو الطلب' : 'أنشئ عرضًا أو طلبًا',
    wide: true,
    body: `<div class="modal-grid">
      <section>
        <div class="field"><label>أنا <span class="req">*</span></label><div class="choice-grid" id="lm">${Object.entries(EX_MODES).map(([k,v]) => `<label class="choice ${listing?.mode === k || (!listing && k === initialMode) ? 'selected' : ''}"><input type="radio" name="mode" value="${k}" ${listing?.mode === k || (!listing && k === initialMode) ? 'checked' : ''}><span><b>${v[0]}</b><small>${k === 'offer' ? 'مهارة، خدمة، منتج، وقت أو معرفة' : 'شيء تريد الحصول عليه من شخص آخر'}</small></span></label>`).join('')}</div></div>
        <div class="field"><label>نوع التبادل <span class="req">*</span></label><select class="input" id="la">${Object.entries(EX_ASSETS).map(([k,v]) => `<option value="${k}" ${listing?.asset_type === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        <div class="field"><label>العنوان <span class="req">*</span></label><input class="input" id="lt" maxlength="180" value="${esc(listing?.title || '')}" placeholder="مثال: أقدم تصميم هوية بصرية مقابل تطوير موقع"></div>
        <div class="field"><label>التفاصيل</label><textarea class="input" id="ld" maxlength="4000" placeholder="اشرح ما الذي تقدمه أو تحتاجه، وما المتوقع من الطرف الآخر">${esc(listing?.description || '')}</textarea></div>
      </section>
      <section>
        <div class="field"><label>التصنيف</label><select class="input" id="lc"><option value="">بدون تصنيف</option>${catOpts}</select></div>
        <div class="field"><label>المهارة المرتبطة (اختياري)</label><select class="input" id="ls"><option value="">ليست مهارة محددة</option>${skillOpts}</select></div>
        <div class="grid2"><div class="field"><label>المدينة</label><input class="input" id="lcity" maxlength="100" value="${esc(listing?.city || state.user?.city || '')}" placeholder="دمياط الجديدة"></div><div class="field"><label>التنفيذ</label><select class="input" id="ldm">${Object.entries(EX_DELIVERY).map(([k,v]) => `<option value="${k}" ${listing?.delivery_mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <div class="grid2"><div class="field"><label>قيمة تقديرية بالجنيه <span class="muted xs">اختياري</span></label><input class="input" id="lv" type="number" min="0" step="50" value="${listing?.estimated_value ?? ''}" placeholder="مثال: 1500"></div><div class="field"><label>حالة/ملاحظات</label><input class="input" id="lcond" maxlength="500" value="${esc(listing?.condition_note || '')}" placeholder="حالة المنتج، الشروط، إلخ"></div></div>
        <div class="notice info">اكتب عرضًا محددًا. كلما كان المطلوب والمقابل أوضح، كان الـMatching أفضل.</div>
      </section>
    </div>`,
    footer: `<button class="btn ghost" data-cancel>إلغاء</button><button class="btn primary" id="save-listing">${listing ? 'حفظ التعديلات' : 'نشر الآن'} ${icon('arrow')}</button>`
  });
  $$('input[name="mode"]', m.root).forEach(r => r.onchange = () => $$('label.choice', m.root).forEach(x => x.classList.toggle('selected', x.querySelector('input').checked)));
  m.$('[data-cancel]').onclick = m.close;
  m.$('#save-listing').onclick = e => busy(e.currentTarget, async () => {
    const body = { mode: m.root.querySelector('input[name="mode"]:checked')?.value, asset_type: m.$('#la').value, title: m.$('#lt').value.trim(), description: m.$('#ld').value.trim(), category_id: m.$('#lc').value || null, skill_id: m.$('#ls').value || null, city: m.$('#lcity').value.trim(), delivery_mode: m.$('#ldm').value, estimated_value: m.$('#lv').value ? Number(m.$('#lv').value) : null, condition_note: m.$('#lcond').value.trim(), status: 'published' };
    if (body.title.length < 3) throw new Error('اكتب عنوانًا واضحًا');
    await api(listing ? `/listings/${listing.id}` : '/listings', { method: listing ? 'PATCH' : 'POST', body });
    toast(listing ? 'تم تعديل العرض' : 'تم نشر العرض بنجاح', 'ok'); m.close(); done();
  });
}

function proposalModal(listing, done = () => {}) {
  if (String(listing.owner_id) === String(state.user.id)) return listingEditor({ listing, done });
  const minePromise = get('/listings/mine');
  minePromise.then(mine => {
    const options = mine.filter(x => x.mode === 'offer' && x.status === 'published');
    const m = openModal({ title: `قدّم عرضًا على: ${listing.title}`, wide: false, body: `<div class="proposal-summary"><span class="chip ${listing.mode === 'need' ? 'b' : 'g'}">${listing.mode === 'need' ? 'طلب' : 'عرض'}</span><h3>${esc(listing.title)}</h3><p class="muted">${esc(listing.description || 'بدون تفاصيل إضافية')}</p></div><div class="field"><label>ماذا ستقدّم مقابله؟</label><select class="input" id="po"><option value="">سأشرح المقابل في الرسالة</option>${options.map(o => `<option value="${esc(o.id)}">${esc(o.title)}</option>`).join('')}</select></div><div class="field"><label>رسالتك</label><textarea class="input" id="pn" maxlength="2000" placeholder="اكتب المقابل، الوقت، أو أي نقطة مهمة للاتفاق"></textarea></div><div class="notice info">بعد قبول العرض، يمكنكم الانتقال للتواصل وتنفيذ الاتفاق.</div>`, footer: '<button class="btn ghost" data-c>إلغاء</button><button class="btn primary" id="send-proposal">إرسال العرض</button>' });
    m.$('[data-c]').onclick = m.close;
    m.$('#send-proposal').onclick = e => busy(e.currentTarget, async () => { await api(`/listings/${listing.id}/proposals`, { method: 'POST', body: { offered_listing_id: m.$('#po').value || null, note: m.$('#pn').value.trim() } }); toast('تم إرسال العرض لصاحب المنشور', 'ok'); m.close(); done(); });
  }).catch(e => toast(errMsg(e), 'err'));
}

async function viewListings(el, _params, qs) {
  const q = qs.get('q') || ''; const mode = qs.get('mode') || ''; const asset = qs.get('asset_type') || ''; const city = qs.get('city') || ''; const dm = qs.get('delivery_mode') || '';
  el.innerHTML = `<div class="exchange-hero card"><div><span class="eyebrow">KHOD & HAT EXCHANGE ENGINE</span><h1>خُد اللي تحتاجه، وهات اللي تقدر عليه.</h1><p>من مهارة وخدمة إلى منتج ووقت ومعرفة. اكتب عرضك أو طلبك، وسيظهر لك الأشخاص الأقرب لاحتياجك.</p></div><button class="btn light" id="new-listing">${icon('plus')} أنشئ عرضًا أو طلبًا</button></div>
    <div class="exchange-tabs"><a href="#/listings" class="${!mode ? 'active' : ''}">الكل</a><a href="#/listings?mode=offer" class="${mode === 'offer' ? 'active' : ''}">أصحاب العروض</a><a href="#/listings?mode=need" class="${mode === 'need' ? 'active' : ''}">أصحاب الطلبات</a><a href="#/proposals" class="${state.route?.[0] === 'proposals' ? 'active' : ''}">عروضي المرسلة</a></div>
    <div class="card filters-card"><form id="lf"><div class="search-big"><input class="input" id="lq" value="${esc(q)}" placeholder="مثال: تصميم، PlayStation، تصوير، Excel…">${icon('search')}<button class="btn primary" type="submit">بحث</button></div><div class="filter-row"><select class="input" id="la"><option value="">كل الأنواع</option>${Object.entries(EX_ASSETS).map(([k,v]) => `<option value="${k}" ${asset===k?'selected':''}>${v[0]}</option>`).join('')}</select><input class="input" id="lcity" value="${esc(city)}" placeholder="المدينة"><select class="input" id="ld"><option value="">كل طرق التنفيذ</option>${Object.entries(EX_DELIVERY).map(([k,v]) => `<option value="${k}" ${dm===k?'selected':''}>${v}</option>`).join('')}</select></div></form></div>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">DISCOVER</span><h2>عروض وطلبات قريبة منك</h2></div><span id="listing-count" class="muted small"></span></div><div id="listing-results">${skeletons(6)}</div></section>`;
  $('#new-listing').onclick = () => listingEditor({ done: () => route() });
  $('#lf').onsubmit = e => { e.preventDefault(); const p = new URLSearchParams(); const delivery = $('#ld').value; if($('#lq').value.trim()) p.set('q',$('#lq').value.trim()); if($('#la').value) p.set('asset_type',$('#la').value); if($('#lcity').value.trim()) p.set('city',$('#lcity').value.trim()); if(mode) p.set('mode',mode); if(delivery) p.set('delivery_mode',delivery); location.hash = `#/listings?${p}`; };
  const results = await get(`/listings${location.hash.split('?')[1] ? '?' + location.hash.split('?')[1] : ''}`, { auth: true });
  $('#listing-count').textContent = `${arNum(results.length)} نتيجة`;
  $('#listing-results').innerHTML = results.length ? `<div class="listing-grid">${results.map(x => listingCard(x)).join('')}</div>` : `<div class="card">${emptyState('swap','لسه مفيش نتائج مطابقة. جرّب نوعًا آخر أو اكتب طلبك بنفسك.','<button class="btn primary" id="empty-create">أنشئ أول طلب</button>')}</div>`;
  $('#empty-create')?.addEventListener('click', () => listingEditor({ done: () => route() }));
}

async function viewListing(el, [id]) {
  el.innerHTML = skeletons(2);
  const x = await get(`/listings/${encodeURIComponent(id)}`);
  const own = String(x.owner_id) === String(state.user.id);
  const score = Number(x.match_score || 0);
  el.innerHTML = `<div class="detail-top"><a class="btn ghost sm" href="#/listings">${icon('arrow')} رجوع</a><span class="muted small">${fmtDate(x.created_at)}</span></div>
    <div class="listing-detail card"><div class="detail-main"><div class="row gap-s wrap"><span class="chip ${x.mode === 'offer' ? 'g' : 'b'}">${x.mode === 'offer' ? 'عرض' : 'طلب'} · ${esc(EX_ASSETS[x.asset_type]?.[0] || x.asset_type)}</span>${x.featured ? '<span class="chip">مميز</span>' : ''}${score ? `<span class="match-score large"><b>${score}%</b> توافق</span>` : ''}</div><h1>${esc(x.title)}</h1><p class="lead">${esc(x.description || 'لم يضف صاحب المنشور تفاصيل إضافية.')}</p><div class="detail-tags">${x.category_name ? `<span class="chip n">${esc(x.category_name)}</span>` : ''}${x.skill_name ? `<span class="chip">${esc(x.skill_name)}</span>` : ''}${x.city ? `<span class="chip n">${esc(x.city)}</span>` : ''}<span class="chip n">${esc(EX_DELIVERY[x.delivery_mode] || '')}</span>${x.estimated_value ? `<span class="chip n">~ ${Number(x.estimated_value).toLocaleString('ar-EG')} جنيه</span>` : ''}</div>${x.condition_note ? `<div class="notice info mt"><b>ملاحظات:</b> ${esc(x.condition_note)}</div>` : ''}${score && x.match_reasons?.length ? `<div class="match-panel"><b>ليه ده ظهر لك؟</b>${x.match_reasons.map(r => `<span>${icon('check',15)}${esc(r)}</span>`).join('')}</div>` : ''}</div><aside class="owner-card"><div class="owner-avatar">${avatar({name:x.owner_name,avatar_url:x.owner_avatar},'l')}</div><h3>${esc(x.owner_name)} ${x.owner_verified ? verifiedBadge : ''}</h3><p class="muted">${esc(x.owner_headline || 'عضو في خد وهات')}</p><div class="owner-trust"><b>${x.owner_rating > 0 ? Number(x.owner_rating).toFixed(1) : '—'}</b><span>${stars(x.owner_rating)}<small>${arNum(x.owner_completed_exchanges)} تبادل مكتمل</small></span></div><a class="btn ghost block" href="#/user/${esc(x.owner_id)}">عرض الملف</a>${own ? `<button class="btn block" id="edit-listing">تعديل المنشور</button><button class="btn danger block" id="close-listing">إغلاق المنشور</button>` : `<button class="btn primary block" id="proposal">${x.mode === 'need' ? 'قدّم عرضك' : 'تفاعل مع العرض'} ${icon('arrow')}</button>`}</aside></div>
    <div class="grid2 detail-bottom"><section class="card"><div class="section-heading"><h2>قواعد التبادل المقترحة</h2></div><div class="deal-steps"><span><b>1</b> إرسال العرض</span><span><b>2</b> قبول الطرف الآخر</span><span><b>3</b> تنفيذ الاتفاق</span><span><b>4</b> تأكيد الإتمام</span></div></section><section class="card"><div class="section-heading"><h2>عروض حديثة</h2></div>${x.recent_proposals?.length ? x.recent_proposals.slice(0,4).map(p => `<div class="proposal-row"><div class="row">${avatar({name:p.proposer_name,avatar_url:p.proposer_avatar},'s')}<div><b>${esc(p.proposer_name)}</b><div class="xs muted">${esc(p.offered_title || 'عرض مخصص')} · ${chip({pending:['معلق','w'],accepted:['مقبول','g'],rejected:['مرفوض','r'],cancelled:['ملغي','n'],completed:['مكتمل','g'],disputed:['نزاع','r']},p.status)}</div></div></div></div>`).join('') : '<p class="muted">لا توجد عروض بعد.</p>'}</section></div>`;
  $('#proposal')?.addEventListener('click', () => proposalModal(x, () => viewListing(el,[id])));
  $('#edit-listing')?.addEventListener('click', () => listingEditor({ listing: x, done: () => viewListing(el,[id]) }));
  $('#close-listing')?.addEventListener('click', async () => { if (!confirm('إغلاق هذا المنشور؟')) return; await api(`/listings/${x.id}`, { method:'PATCH', body:{...x,status:'closed'} }); toast('تم إغلاق المنشور','ok'); location.hash='#/listings'; });
}

async function viewProposals(el) {
  const list = await get('/listings/proposals');
  const incoming = list.filter(p => String(p.listing_owner_id) === String(state.user.id));
  const outgoing = list.filter(p => String(p.proposer_id) === String(state.user.id));
  const proposalRow = p => `<article class="proposal-card card"><div class="row between wrap"><div class="row">${avatar({name:p.proposer_id===state.user.id ? p.listing_owner_name : p.proposer_name, avatar_url:p.proposer_id===state.user.id ? p.listing_owner_avatar : p.proposer_avatar},'s')}<div><b>${esc(p.listing_title)}</b><div class="small muted">${p.proposer_id===state.user.id ? `إلى ${esc(p.listing_owner_name)}` : `من ${esc(p.proposer_name)}`}</div></div></div>${chip({pending:['بانتظار الرد','w'],accepted:['مقبول','g'],rejected:['مرفوض','r'],cancelled:['ملغي','n'],completed:['مكتمل','g'],disputed:['نزاع','r']},p.status)}</div><p class="small" style="margin:14px 0">${esc(p.note || 'بدون رسالة')}</p><div class="row between wrap"><span class="xs muted">${p.offered_title ? `المقابل: ${esc(p.offered_title)}` : 'مقابل مخصص'}</span><div class="row">${p.proposer_id!==state.user.id && p.status==='pending' ? `<button class="btn success sm" data-accept="${esc(p.id)}">قبول</button><button class="btn ghost sm" data-reject="${esc(p.id)}">رفض</button>` : ''}${p.status==='accepted' ? `<button class="btn primary sm" data-done="${esc(p.id)}">تأكيد الإتمام</button><button class="btn danger sm" data-dispute="${esc(p.id)}">نزاع</button>` : ''}<a class="btn sm" href="#/listing/${esc(p.listing_id)}">المنشور</a></div></div></article>`;
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">EXCHANGE OFFERS</span><h1>العروض والاتفاقات</h1><p class="muted">تابع ما أرسلته وما وصلك حتى إتمام التبادل.</p></div><a class="btn primary" href="#/listings">استكشف التبادلات ${icon('arrow')}</a></div><div class="proposal-columns"><section><div class="section-heading"><h2>وصلتني</h2><span class="chip">${arNum(incoming.length)}</span></div>${incoming.length ? incoming.map(proposalRow).join('') : `<div class="card">${emptyState('users','لم تصلك عروض بعد.')}</div>`}</section><section><div class="section-heading"><h2>أرسلتها</h2><span class="chip">${arNum(outgoing.length)}</span></div>${outgoing.length ? outgoing.map(proposalRow).join('') : `<div class="card">${emptyState('send','لم ترسل عروضًا بعد.')}</div>`}</section></div>`;
  $$('[data-accept]', el).forEach(b => b.onclick = async () => { await api(`/listings/proposals/${b.dataset.accept}`, {method:'PATCH',body:{status:'accepted'}}); toast('تم قبول العرض','ok'); viewProposals(el); });
  $$('[data-reject]', el).forEach(b => b.onclick = async () => { await api(`/listings/proposals/${b.dataset.reject}`, {method:'PATCH',body:{status:'rejected'}}); toast('تم رفض العرض','ok'); viewProposals(el); });
  $$('[data-done]', el).forEach(b => b.onclick = async () => { await api(`/listings/proposals/${b.dataset.done}`, {method:'PATCH',body:{status:'completed'}}); toast('تم تسجيل إتمام التبادل','ok'); viewProposals(el); });
  $$('[data-dispute]', el).forEach(b => b.onclick = async () => { await api(`/listings/proposals/${b.dataset.dispute}`, {method:'PATCH',body:{status:'disputed'}}); toast('تم فتح النزاع','ok'); viewProposals(el); });
}
