import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, makeUser, query } from './helpers/api.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 7)]);
const valid = (over = {}) => ({
  project: { name: 'خد وهات', tagline: 'شعار', description: 'وصف', problem: 'مشكلة', goals: ['هدف 1', 'هدف 2'], features: ['ميزة'] },
  academic: { university: 'جامعة', faculty: 'كلية', department: 'نظم المعلومات', year: '2026/2027', supervisor: { name: 'د. اختبار', title: 'مشرف', photo_url: '' } },
  team: [{ name: 'عضو 1', role: 'قائد', bio: 'نبذة', photo_url: '', linkedin: 'https://www.linkedin.com/in/test', github: '' }],
  tech: [{ group: 'الواجهة', items: ['HTML', 'CSS'] }],
  contact: { email: 'team@example.com', github: '', website: '' },
  ...over,
});

describe('About page — public read, restricted write', () => {
  let user, support, mod, admin;
  beforeAll(async () => {
    await query('DELETE FROM project_about');
    [user, support, mod, admin] = await Promise.all([makeUser('abU'), makeUser('abS', { role: 'SUPPORT' }), makeUser('abM', { role: 'MODERATOR' }), makeUser('abA', { role: 'ADMIN' })]);
  });
  afterAll(async () => { await query('DELETE FROM project_about'); });

  it('is readable without logging in, and ships sensible defaults (12 team roles)', async () => {
    const r = await http().get('/api/about');
    expect(r.status).toBe(200);
    expect(r.body.data.is_default).toBe(true);
    expect(r.body.data.project.name).toBe('خد وهات');
    expect(r.body.data.team).toHaveLength(12);
    expect(JSON.stringify(r.body)).not.toMatch(/service[_-]?role|password/i);
  });

  it('only staff with the "settings" permission can edit it', async () => {
    expect((await http().put('/api/admin/about').send(valid())).status).toBe(401);
    for (const u of [user, support, mod]) {
      const r = await http().put('/api/admin/about').set('Authorization', `Bearer ${u.token}`).send(valid());
      expect(r.status).toBe(403);
    }
    expect((await query('SELECT count(*)::int n FROM project_about')).rows[0].n).toBe(0);   // nothing was written
  });

  it('an admin can save, the change is public immediately, and it is audited', async () => {
    const put = await http().put('/api/admin/about').set('Authorization', `Bearer ${admin.token}`).send(valid());
    expect(put.status).toBe(200);
    const pub = await http().get('/api/about');
    expect(pub.body.data.is_default).toBe(false);
    expect(pub.body.data.team[0].name).toBe('عضو 1');
    expect(pub.body.data.academic.supervisor.name).toBe('د. اختبار');
    const log = await query(`SELECT count(*)::int n FROM admin_logs WHERE action='about_update' AND admin_id=$1`, [admin.id]);
    expect(log.rows[0].n).toBe(1);
    expect((await query('SELECT updated_by FROM project_about')).rows[0].updated_by).toBe(admin.id);
  });

  it.each([
    ['a javascript: link', () => valid({ team: [{ name: 'x', role: 'r', bio: '', photo_url: '', linkedin: 'javascript:alert(1)', github: '' }] })],
    ['a data: photo URL', () => valid({ academic: { ...valid().academic, supervisor: { name: 'د', title: '', photo_url: 'data:text/html,<script>1</script>' } } })],
    ['more than 30 team members', () => valid({ team: Array.from({ length: 31 }, (_, i) => ({ name: `m${i}`, role: '', bio: '', photo_url: '', linkedin: '', github: '' })) })],
    ['a member without a name', () => valid({ team: [{ name: '', role: 'r', bio: '', photo_url: '', linkedin: '', github: '' }] })],
    ['an invalid contact email', () => valid({ contact: { email: 'not-an-email', github: '', website: '' } })],
    ['an oversized description', () => valid({ project: { ...valid().project, description: 'x'.repeat(1501) } })],
    ['a missing section', () => { const v = valid(); delete v.team; return v; }],
  ])('rejects %s', async (_l, make) => {
    const r = await http().put('/api/admin/about').set('Authorization', `Bearer ${admin.token}`).send(make());
    expect(r.status).toBe(400);
  });

  it('restoring defaults brings the starter content back', async () => {
    const r = await admin.del('/admin/about');
    expect(r.status).toBe(200);
    expect(r.body.data.is_default).toBe(true);
    expect((await http().get('/api/about')).body.data.team).toHaveLength(12);
  });

  it('team photo upload accepts a real image for admins only', async () => {
    const ok = await admin.post('/admin/uploads/team-photo', { data_url: PNG });
    expect(ok.status).toBe(200);
    expect(ok.body.data.url).toContain('/photos/');
    expect((await user.post('/admin/uploads/team-photo', { data_url: PNG })).status).toBe(403);
    expect((await support.post('/admin/uploads/team-photo', { data_url: PNG })).status).toBe(403);
    const fake = await admin.post('/admin/uploads/team-photo', { data_url: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>----').toString('base64') });
    expect(fake.status).toBe(400);
  });
});

describe('admin can hear a reported voice message (and only the right staff can)', () => {
  let a, b, mod, support, user, reportId, msgId;
  beforeAll(async () => {
    [a, b, user] = await Promise.all([makeUser('evA'), makeUser('evB'), makeUser('evU')]);
    [mod, support] = await Promise.all([makeUser('evM', { role: 'MODERATOR' }), makeUser('evS', { role: 'SUPPORT' })]);
    const conn = (await a.post('/connections', { user_id: b.id })).body.data;
    const cid = conn.id ?? conn.connection?.id;
    await b.patch(`/connections/${cid}`, { action: 'accept' });
    await a.post(`/chats/${cid}/messages`, { body: 'نص عادي قبل الصوت' });
    msgId = (await a.post(`/chats/${cid}/voice`, { data_url: `data:audio/webm;base64,${WEBM.toString('base64')}`, seconds: 6 })).body.data.id;
    const rep = await b.post('/reports', { target_type: 'message', target_id: msgId, reason: 'محتوى مسيء', description: 'تسجيل صوتي' });
    expect(rep.status).toBe(201);
    reportId = rep.body.data.id ?? rep.body.data.report?.id;
  });

  it('a moderator sees the voice message with a short-lived link, never the storage path', async () => {
    const r = await mod.get(`/admin/reports/${reportId}`);
    expect(r.status).toBe(200);
    const v = r.body.data.context.messages.find(m => m.id === msgId);
    expect(v.kind).toBe('voice');
    expect(v.audio_url).toContain('/sign/voice/');
    expect(v).not.toHaveProperty('audio_path');
    expect(r.body.data.context.messages.some(m => m.body === 'نص عادي قبل الصوت')).toBe(true);   // surrounding context is included
  });

  it('opening the evidence is written to the audit log, noting the voice message', async () => {
    const log = await query(`SELECT note FROM admin_logs WHERE action='view_report_chat' AND admin_id=$1 ORDER BY created_at DESC LIMIT 1`, [mod.id]);
    expect(log.rows[0].note).toMatch(/voice/i);
  });

  it('support staff can open the report but cannot hear or read the private chat', async () => {
    const r = await support.get(`/admin/reports/${reportId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.context.messages).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('/sign/voice/');
  });

  it('a normal member cannot open the report at all', async () => {
    expect((await user.get(`/admin/reports/${reportId}`)).status).toBe(403);
  });
});
