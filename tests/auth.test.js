import { describe, it, expect, beforeAll } from 'vitest';
import { http, makeUser, query, uniq } from './helpers/api.js';
import { TEST_EMAIL_DOMAIN } from './helpers/env.js';

describe('public endpoints', () => {
  it('GET /api/health is up', async () => {
    const r = await http().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('GET /api/config exposes only public values (never the service-role key)', async () => {
    const r = await http().get('/api/config');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('test-service-key');
    expect(r.body.data).toHaveProperty('supabaseUrl');
  });

  it('unknown API route returns a JSON 404', async () => {
    const r = await http().get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NOT_FOUND');
  });
});

describe('registration', () => {
  const base = () => { const u = uniq('t_reg').slice(0, 38); return { name: 'Reg Test', username: u, email: `${u}${TEST_EMAIL_DOMAIN}`, password: 'Passw0rd!test' }; };

  it('creates a USER account and never returns the password', async () => {
    const body = base();
    const r = await http().post('/api/auth/register').send(body);
    expect(r.status).toBe(201);
    expect(r.body.data.user.role).toBe('USER');
    expect(JSON.stringify(r.body)).not.toContain(body.password);
  });

  it('ignores a "role" sent by the client (no self-promotion)', async () => {
    const body = { ...base(), role: 'SUPER_ADMIN', status: 'active', is_verified: true };
    const r = await http().post('/api/auth/register').send(body);
    expect(r.status).toBe(201);
    const db = await query('SELECT role,is_verified FROM users WHERE email=$1', [body.email]);
    expect(db.rows[0].role).toBe('USER');
    expect(db.rows[0].is_verified).toBe(false);
  });

  it('rejects duplicate email / username with 409', async () => {
    const body = base();
    await http().post('/api/auth/register').send(body);
    const again = await http().post('/api/auth/register').send(body);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ACCOUNT_EXISTS');
  });

  it.each([
    ['short password', { password: '123' }],
    ['bad email', { email: 'not-an-email' }],
    ['bad username characters', { username: 'bad name!' }],
    ['short name', { name: 'a' }],
  ])('rejects %s with 400', async (_label, patch) => {
    const r = await http().post('/api/auth/register').send({ ...base(), ...patch });
    expect(r.status).toBe(400);
  });
});

describe('login, session and profile', () => {
  let u;
  beforeAll(async () => { u = await makeUser('auth'); });

  it('wrong password → 401 INVALID_CREDENTIALS', async () => {
    const r = await http().post('/api/auth/login').send({ email: u.email, password: 'wrong-password' });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /auth/me needs a token, and returns the profile with a valid one', async () => {
    expect((await http().get('/api/auth/me')).status).toBe(401);
    const r = await u.get('/auth/me');
    expect(r.status).toBe(200);
    expect(r.body.data.user?.email ?? r.body.data.email).toBe(u.email);
  });

  it('a garbage token is rejected', async () => {
    const r = await http().get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(r.status).toBe(401);
  });

  it('refresh issues a new session; a bad refresh token is refused', async () => {
    const ok = await http().post('/api/auth/refresh').send({ refresh_token: u.refresh });
    expect(ok.status).toBe(200);
    expect(ok.body.data.session.access_token).toBeTruthy();
    const bad = await http().post('/api/auth/refresh').send({ refresh_token: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('PATCH /users/me updates allowed fields but cannot change role, status or verification', async () => {
    const r = await u.patch('/users/me', { headline: 'مطوّر', role: 'SUPER_ADMIN', status: 'banned', is_verified: true });
    expect(r.status).toBe(200);
    const db = await query('SELECT role,status,is_verified,headline FROM users WHERE id=$1', [u.id]);
    expect(db.rows[0]).toMatchObject({ role: 'USER', status: 'active', is_verified: false, headline: 'مطوّر' });
  });

  it('username already taken → 409', async () => {
    const other = await makeUser('auth2');
    const r = await u.patch('/users/me', { username: other.username });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('USERNAME_TAKEN');
  });

  it('a suspended account is locked out of the API and cannot log in', async () => {
    const v = await makeUser('susp');
    await query(`UPDATE users SET status='suspended', status_reason='test' WHERE id=$1`, [v.id]);
    const me = await v.get('/auth/me');
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('ACCOUNT_BLOCKED');
    const login = await http().post('/api/auth/login').send({ email: v.email, password: v.password });
    expect(login.status).toBe(403);
  });
});
