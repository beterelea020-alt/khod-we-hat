import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../backend/src/app.js';
import router from '../backend/src/routes/index.js';
import { makeUser, query, uuid0, http } from './helpers/api.js';

// Every /admin route is discovered from the router itself, so a route added later is covered automatically.
const adminRoutes = router.stack
  .filter(l => l.route?.path?.startsWith('/admin'))
  .flatMap(l => Object.keys(l.route.methods).filter(m => l.route.methods[m]).map(m => ({ method: m, path: l.route.path.replace(/:\w+/g, uuid0) })));

const call = (u, { method, path }) => {
  const rq = request(app)[method](`/api${path}`);
  if (u) rq.set('Authorization', `Bearer ${u.token}`);
  return rq.send(method === 'get' ? undefined : {});
};

describe('admin API is closed to everyone who is not staff', () => {
  let user, anon = null;
  beforeAll(async () => { user = await makeUser('plain'); });

  it('discovers the admin routes', () => { expect(adminRoutes.length).toBeGreaterThan(30); });

  it('anonymous visitors get 401 on every admin route', async () => {
    for (const r of adminRoutes) {
      const res = await call(anon, r);
      expect(res.status, `${r.method.toUpperCase()} ${r.path}`).toBe(401);
    }
  });

  it('a normal account gets 403 on every admin route (all methods)', async () => {
    for (const r of adminRoutes) {
      const res = await call(user, r);
      expect(res.status, `${r.method.toUpperCase()} ${r.path}`).toBe(403);
    }
  });

  it('the /admin guard is blanket: even a path with no handler answers 401/403, never 404', async () => {
    // Proves protection does not depend on each route remembering its own permission check.
    const path = '/api/admin/route-that-does-not-exist';
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set('Authorization', `Bearer ${user.token}`)).status).toBe(403);
  });

  it('a normal account cannot promote itself, even by calling the role endpoint directly', async () => {
    const r = await user.patch(`/admin/users/${user.id}/role`, { role: 'SUPER_ADMIN' });
    expect(r.status).toBe(403);
    const db = await query('SELECT role FROM users WHERE id=$1', [user.id]);
    expect(db.rows[0].role).toBe('USER');
  });

  it('/auth/me reports no permissions for a normal account', async () => {
    const r = await user.get('/auth/me');
    const me = r.body.data.user ?? r.body.data;
    expect(me.permissions ?? []).toEqual([]);
  });
});

describe('role matrix', () => {
  let support, ads, moderator, admin, superAdmin, target;
  beforeAll(async () => {
    [support, ads, moderator, admin, superAdmin, target] = await Promise.all([
      makeUser('sup', { role: 'SUPPORT' }), makeUser('ads', { role: 'ADS_MANAGER' }), makeUser('mod', { role: 'MODERATOR' }),
      makeUser('adm', { role: 'ADMIN' }), makeUser('sa', { role: 'SUPER_ADMIN' }), makeUser('tgt'),
    ]);
  });

  it('SUPPORT can view users but cannot moderate them', async () => {
    expect((await support.get('/admin/users')).status).toBe(200);
    const r = await support.patch(`/admin/users/${target.id}/status`, { status: 'suspended', reason: 'x' });
    expect(r.status).toBe(403);
  });

  it('ADS_MANAGER can reach ads but not users or settings', async () => {
    expect((await ads.get('/admin/ads')).status).toBe(200);
    expect((await ads.get('/admin/users')).status).toBe(403);
    expect((await ads.get('/admin/settings')).status).toBe(403);
  });

  it('MODERATOR can read reports but not platform settings', async () => {
    expect((await moderator.get('/admin/reports')).status).toBe(200);
    expect((await moderator.get('/admin/settings')).status).toBe(403);
  });

  it('ADMIN can read settings but cannot change roles or delete users (SUPER_ADMIN only)', async () => {
    expect((await admin.get('/admin/settings')).status).toBe(200);
    expect((await admin.patch(`/admin/users/${target.id}/role`, { role: 'MODERATOR' })).status).toBe(403);
    expect((await admin.del(`/admin/users/${target.id}`)).status).toBe(403);
  });

  it('SUPER_ADMIN can list users and change another account’s role, which takes effect immediately', async () => {
    expect((await superAdmin.get('/admin/users')).status).toBe(200);
    const r = await superAdmin.patch(`/admin/users/${target.id}/role`, { role: 'SUPPORT' });
    expect(r.status).toBe(200);
    expect((await target.get('/admin/users')).status).toBe(200);          // now staff
    await superAdmin.patch(`/admin/users/${target.id}/role`, { role: 'USER' });
    expect((await target.get('/admin/users')).status).toBe(403);          // demoted again
  });

  it('nobody can change their own role', async () => {
    const r = await superAdmin.patch(`/admin/users/${superAdmin.id}/role`, { role: 'USER' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SELF_ADMIN_ACTION');
  });

  it('rejects an unknown role value', async () => {
    const r = await superAdmin.patch(`/admin/users/${target.id}/role`, { role: 'GOD' });
    expect(r.status).toBe(400);
  });

  it('a moderator cannot act on an account ranked above them', async () => {
    const r = await moderator.patch(`/admin/users/${superAdmin.id}/status`, { status: 'suspended', reason: 'test' });
    expect([403, 404]).toContain(r.status);
    const db = await query('SELECT status FROM users WHERE id=$1', [superAdmin.id]);
    expect(db.rows[0].status).toBe('active');
  });

  it('suspending a user locks their existing session; reactivating restores it', async () => {
    const v = await makeUser('victim');
    expect((await v.get('/auth/me')).status).toBe(200);
    const s = await moderator.patch(`/admin/users/${v.id}/status`, { status: 'suspended', reason: 'مخالفة' });
    expect(s.status).toBe(200);
    expect((await v.get('/auth/me')).status).toBe(403);
    expect((await http().post('/api/auth/login').send({ email: v.email, password: v.password })).status).toBe(403);
    const back = await moderator.patch(`/admin/users/${v.id}/status`, { status: 'active' });
    expect(back.status).toBe(200);
    expect((await v.get('/auth/me')).status).toBe(200);
  });

  it('a status change without a reason is refused', async () => {
    const r = await moderator.patch(`/admin/users/${target.id}/status`, { status: 'suspended' });
    expect(r.status).toBe(400);
  });

  it('staff actions are written to the audit log', async () => {
    const r = await superAdmin.get('/admin/actions');
    expect(r.status).toBe(200);
    const rows = Array.isArray(r.body.data) ? r.body.data : r.body.data?.items ?? [];
    expect(rows.length).toBeGreaterThan(0);
  });
});
