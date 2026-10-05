import { describe, it, expect, beforeAll } from 'vitest';
import { makeUser, makeSkill, query, uuid0 } from './helpers/api.js';

const exId = r => r.body.data.id ?? r.body.data.exchange?.id;
async function offerSkill(u, s) { return u.post('/users/me/skills', { skill_id: s.id, type: 'offer', level: 'Advanced' }); }

describe('exchange lifecycle → review', () => {
  let a, b, c, sa, sb, id;
  beforeAll(async () => {
    [a, b, c] = await Promise.all([makeUser('exA'), makeUser('exB'), makeUser('exC')]);
    [sa, sb] = [await makeSkill('design'), await makeSkill('english')];
    expect((await offerSkill(a, sa)).status).toBe(201);
    expect((await offerSkill(b, sb)).status).toBe(201);
  });
  const body = (extra = {}) => ({ receiver_id: b.id, offered_skill_id: sa.id, requested_skill_id: sb.id, deal_type: 'swap', message: 'نتبادل؟', ...extra });

  it('you cannot exchange with yourself', async () => {
    const r = await a.post('/exchanges', body({ receiver_id: a.id }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SELF_EXCHANGE');
  });

  it('you can only offer a skill that is on your own profile', async () => {
    const r = await c.post('/exchanges', body());
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('OFFER_NOT_ON_PROFILE');
  });

  it('you can only ask for a skill the other person actually offers', async () => {
    const other = await makeSkill('unoffered');
    const r = await a.post('/exchanges', body({ requested_skill_id: other.id }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REQUEST_NOT_OFFERED');
  });

  it('creates a pending exchange; an identical open one is refused', async () => {
    const r = await a.post('/exchanges', body());
    expect(r.status).toBe(201);
    id = exId(r);
    expect(id).toBeTruthy();
    const dup = await a.post('/exchanges', body());
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_EXCHANGE');
  });

  it('only the two participants can see it', async () => {
    expect((await a.get(`/exchanges/${id}`)).status).toBe(200);
    expect((await b.get(`/exchanges/${id}`)).status).toBe(200);
    expect((await c.get(`/exchanges/${id}`)).status).toBe(404);
    expect(JSON.stringify((await c.get('/exchanges')).body)).not.toContain(id);
  });

  it('the sender cannot accept their own request, and a stranger cannot touch it', async () => {
    expect((await a.patch(`/exchanges/${id}/status`, { status: 'accepted' })).status).toBe(403);
    expect((await c.patch(`/exchanges/${id}/status`, { status: 'accepted' })).status).toBe(403);
  });

  it('cannot be completed before it is in progress', async () => {
    const r = await b.patch(`/exchanges/${id}/status`, { status: 'completed' });
    expect(r.status).toBe(409);
  });

  it('reviews are refused until the exchange is completed', async () => {
    const r = await a.post(`/exchanges/${id}/reviews`, { rating: 5 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('REVIEW_NOT_ALLOWED');
  });

  it('accept → start → both parties confirm completion', async () => {
    expect((await b.patch(`/exchanges/${id}/status`, { status: 'accepted' })).status).toBe(200);
    expect((await b.patch(`/exchanges/${id}/status`, { status: 'in_progress' })).status).toBe(200);
    // First "completed" only records a request; it needs the other side to confirm.
    const first = await a.patch(`/exchanges/${id}/status`, { status: 'completed' });
    expect(first.status).toBe(200);
    let db = await query('SELECT status FROM exchanges WHERE id=$1', [id]);
    expect(db.rows[0].status).not.toBe('completed');
    const again = await a.patch(`/exchanges/${id}/status`, { status: 'completed' });
    expect(again.status).toBe(409);
    expect((await b.patch(`/exchanges/${id}/status`, { status: 'completed' })).status).toBe(200);
    db = await query('SELECT status FROM exchanges WHERE id=$1', [id]);
    expect(db.rows[0].status).toBe('completed');
  });

  it('after completion each side can review once; strangers and bad ratings are refused', async () => {
    expect((await c.post(`/exchanges/${id}/reviews`, { rating: 5 })).status).toBe(403);
    expect((await a.post(`/exchanges/${id}/reviews`, { rating: 6 })).status).toBe(400);
    expect((await a.post(`/exchanges/${id}/reviews`, { rating: 0 })).status).toBe(400);
    const ok = await a.post(`/exchanges/${id}/reviews`, { rating: 5, comment: 'تعامل ممتاز' });
    expect(ok.status).toBe(201);
    const dup = await a.post(`/exchanges/${id}/reviews`, { rating: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('REVIEW_EXISTS');
    expect((await b.post(`/exchanges/${id}/reviews`, { rating: 4 })).status).toBe(201);
  });

  it('a rejected request can never be reopened', async () => {
    const sc = await makeSkill('extra'); await offerSkill(a, sc);
    const r = await a.post('/exchanges', body({ offered_skill_id: sc.id }));
    const id2 = exId(r);
    expect((await b.patch(`/exchanges/${id2}/status`, { status: 'rejected' })).status).toBe(200);
    expect((await b.patch(`/exchanges/${id2}/status`, { status: 'accepted' })).status).toBe(409);
  });
});

describe('reports', () => {
  let a, b;
  beforeAll(async () => { [a, b] = await Promise.all([makeUser('rpA'), makeUser('rpB')]); });

  it('needs a login and a target', async () => {
    expect((await a.post('/reports', { reason: 'spam' })).status).toBe(400);
  });

  it('you cannot report yourself', async () => {
    const r = await a.post('/reports', { target_type: 'user', reported_user_id: a.id, reason: 'اختبار' });
    expect(r.status).toBe(400);
  });

  it('files a report against another member and staff can see it', async () => {
    const r = await a.post('/reports', { target_type: 'user', reported_user_id: b.id, reason: 'سلوك مسيء', description: 'تفاصيل' });
    expect(r.status).toBe(201);
    const staff = await makeUser('rpStaff', { role: 'MODERATOR' });
    const list = await staff.get('/admin/reports');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain('سلوك مسيء');
  });

  it('you cannot report an exchange you are not part of', async () => {
    const r = await a.post('/reports', { target_type: 'exchange', target_id: uuid0, reason: 'غش' });
    expect(r.status).toBe(403);
  });
});

describe('jobs (ownership and moderation)', () => {
  let a, b, mod, job;
  const payload = { title: 'مطلوب مصمم جرافيك', description: 'نبحث عن مصمم بخبرة سنتين على الأقل', company: 'شركة', location: 'عن بُعد', job_type: 'remote' };
  beforeAll(async () => { [a, b] = await Promise.all([makeUser('jbA'), makeUser('jbB')]); mod = await makeUser('jbMod', { role: 'MODERATOR' }); });

  it('a new job waits for moderation and is not public', async () => {
    const r = await a.post('/jobs', payload);
    expect(r.status).toBe(201);
    job = r.body.data;
    expect(job.status).toBe('pending');
    const list = await a.get('/jobs');
    expect(JSON.stringify(list.body)).not.toContain(job.id);
  });

  it('other members cannot edit or close someone else’s job', async () => {
    expect((await b.patch(`/jobs/${job.id}`, { ...payload, title: 'عنوان مسروق' })).status).toBe(404);
    expect((await b.post(`/jobs/${job.id}/close`, {})).status).toBe(404);
    const db = await query('SELECT title,status FROM job_posts WHERE id=$1', [job.id]);
    expect(db.rows[0].title).toBe(payload.title);
  });

  it('a moderator approves it and it becomes public', async () => {
    const r = await mod.patch(`/admin/jobs/${job.id}/moderation`, { status: 'published' });
    expect(r.status).toBe(200);
    const list = await b.get('/jobs');
    expect(JSON.stringify(list.body)).toContain(job.id);
  });

  it('editing a published job sends it back to review', async () => {
    const r = await a.patch(`/jobs/${job.id}`, { ...payload, title: 'عنوان محدّث' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('pending');
  });
});
