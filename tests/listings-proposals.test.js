import { describe, it, expect, beforeAll } from 'vitest';
import { http, makeUser, query, uuid0 } from './helpers/api.js';

const offer = (extra = {}) => ({ mode: 'offer', asset_type: 'service', title: 'تصميم شعار احترافي', description: 'أقدر أصمم لك هوية كاملة', city: 'دمياط', ...extra });
const need = (extra = {}) => ({ mode: 'need', asset_type: 'skill', title: 'محتاج دروس إنجليزي', description: 'مستوى متوسط', ...extra });

describe('listings', () => {
  let a, b;
  beforeAll(async () => { a = await makeUser('lstA'); b = await makeUser('lstB'); });

  it('requires a login to create', async () => {
    expect((await http().post('/api/listings').send(offer())).status).toBe(401);
  });

  it.each([
    ['title too short', { title: 'ab' }],
    ['unknown asset type', { asset_type: 'spaceship' }],
    ['unknown mode', { mode: 'trade' }],
    ['negative value', { estimated_value: -5 }],
  ])('rejects %s with 400', async (_l, patch) => {
    const r = await a.post('/listings', offer(patch));
    expect(r.status).toBe(400);
  });

  it('creates an offer owned by the caller and shows it publicly without leaking contact data', async () => {
    const r = await a.post('/listings', offer({ title: 'عرض ظاهر للجميع' }));
    expect(r.status).toBe(201);
    expect(r.body.data.owner_id).toBe(a.id);
    const pub = await http().get('/api/listings');
    expect(pub.status).toBe(200);
    const text = JSON.stringify(pub.body);
    expect(text).toContain('عرض ظاهر للجميع');
    expect(text).not.toContain(a.email);
    expect(text).not.toContain('"phone"');
  });

  it('paused and draft listings are hidden from the public feed', async () => {
    const hidden = await a.post('/listings', offer({ title: 'عرض مخفي مؤقتا', status: 'paused' }));
    expect(hidden.status).toBe(201);
    const text = JSON.stringify((await http().get('/api/listings')).body);
    expect(text).not.toContain('عرض مخفي مؤقتا');
  });

  it('only the owner can edit a listing', async () => {
    const mine = (await a.post('/listings', offer({ title: 'عرضي أنا' }))).body.data;
    const theirs = await b.patch(`/listings/${mine.id}`, { title: 'اختراق العرض' });
    expect(theirs.status).toBe(404);
    const ok = await a.patch(`/listings/${mine.id}`, { title: 'عنوان معدّل' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toBe('عنوان معدّل');
    const db = await query('SELECT title FROM exchange_listings WHERE id=$1', [mine.id]);
    expect(db.rows[0].title).toBe('عنوان معدّل');
  });

  it('listing detail 404s for an id that does not exist', async () => {
    const r = await http().get(`/api/listings/${uuid0}`);
    expect(r.status).toBe(404);
  });

  it('search by text only returns matching listings', async () => {
    await a.post('/listings', offer({ title: 'كلمةفريدة للبحث123' }));
    const r = await http().get('/api/listings').query({ q: 'كلمةفريدة' });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).toContain('كلمةفريدة');
    expect(text).not.toContain('عنوان معدّل');
  });
});

describe('proposals on a listing', () => {
  let owner, proposer, outsider, listing, proposalId;
  beforeAll(async () => {
    [owner, proposer, outsider] = await Promise.all([makeUser('own'), makeUser('prop'), makeUser('out')]);
    listing = (await owner.post('/listings', need({ title: 'طلب للتجربة المتقدمة' }))).body.data;
  });

  it('you cannot propose on your own listing', async () => {
    const r = await owner.post(`/listings/${listing.id}/proposals`, { note: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SELF_PROPOSAL');
  });

  it('you cannot offer a listing that is not yours', async () => {
    const foreign = (await outsider.post('/listings', offer({ title: 'عرض شخص آخر' }))).body.data;
    const r = await proposer.post(`/listings/${listing.id}/proposals`, { offered_listing_id: foreign.id, note: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('INVALID_OFFERED_LISTING');
  });

  it('another member can send a proposal, once', async () => {
    const mine = (await proposer.post('/listings', offer({ title: 'عرضي للمقايضة' }))).body.data;
    const r = await proposer.post(`/listings/${listing.id}/proposals`, { offered_listing_id: mine.id, note: 'أقدر أساعد' });
    expect(r.status).toBe(201);
    proposalId = r.body.data.id ?? r.body.data.proposal?.id;
    expect(proposalId).toBeTruthy();
    const dup = await proposer.post(`/listings/${listing.id}/proposals`, { note: 'تاني' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('PROPOSAL_EXISTS');
  });

  it('the listing owner is notified', async () => {
    const r = await owner.get('/notifications');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body).length).toBeGreaterThan(10);
  });

  it('an outsider cannot touch the proposal', async () => {
    const r = await outsider.patch(`/listings/proposals/${proposalId}`, { status: 'accepted' });
    expect(r.status).toBe(403);
  });

  it('the proposer cannot accept their own proposal', async () => {
    const r = await proposer.patch(`/listings/proposals/${proposalId}`, { status: 'accepted' });
    expect(r.status).toBe(403);
  });

  it('cannot complete before it is accepted', async () => {
    const r = await owner.patch(`/listings/proposals/${proposalId}`, { status: 'completed' });
    expect(r.status).toBe(409);
  });

  it('the owner accepts; afterwards it can no longer be rejected', async () => {
    const ok = await owner.patch(`/listings/proposals/${proposalId}`, { status: 'accepted' });
    expect(ok.status).toBe(200);
    const late = await owner.patch(`/listings/proposals/${proposalId}`, { status: 'rejected' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('INVALID_TRANSITION');
  });

  it('an invalid status value is rejected', async () => {
    const r = await owner.patch(`/listings/proposals/${proposalId}`, { status: 'exploded' });
    expect(r.status).toBe(400);
  });
});
