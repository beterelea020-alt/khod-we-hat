import request from 'supertest';
import app from '../../backend/src/app.js';
import { query } from '../../backend/src/config/db.js';
import { TEST_EMAIL_DOMAIN, TEST_SKILL_PREFIX } from './env.js';

export { query };
export const http = () => request(app);
const RUN = Math.random().toString(36).slice(2, 7);
let n = 0;
export const uniq = p => `${p}_${RUN}_${++n}`;
export const uuid0 = '00000000-0000-4000-8000-000000000000';

/** Registers + logs in a fresh user. `role` is applied directly in the DB (that is the only way roles are granted). */
export async function makeUser(label = 'u', { role } = {}) {
  const username = uniq(`t_${label}`).slice(0, 38);
  const email = `${username}${TEST_EMAIL_DOMAIN}`;
  const password = 'Passw0rd!test';
  const reg = await request(app).post('/api/auth/register').send({ name: `Test ${label}`, username, email, password });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const id = reg.body.data.user.id;
  if (role) await query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
  const login = await request(app).post('/api/auth/login').send({ email, password });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  const s = login.body.data.session;
  return {
    id, email, username, password, token: s.access_token, refresh: s.refresh_token,
    get: p => request(app).get(`/api${p}`).set('Authorization', `Bearer ${s.access_token}`),
    post: (p, b) => request(app).post(`/api${p}`).set('Authorization', `Bearer ${s.access_token}`).send(b),
    patch: (p, b) => request(app).patch(`/api${p}`).set('Authorization', `Bearer ${s.access_token}`).send(b),
    del: p => request(app).delete(`/api${p}`).set('Authorization', `Bearer ${s.access_token}`),
  };
}

export async function makeSkill(label) {
  const name = `${TEST_SKILL_PREFIX}${uniq(label)}`;
  const r = await query('INSERT INTO skills(name) VALUES($1) RETURNING id', [name]);
  return { id: r.rows[0].id, name };
}
