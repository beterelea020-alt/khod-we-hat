import { describe, it, expect, beforeAll } from 'vitest';
import { makeUser, query, uuid0 } from './helpers/api.js';

const connectionId = r => r.body.data.id ?? r.body.data.connection?.id;

describe('connection requests', () => {
  let a, b, c, id;
  beforeAll(async () => { [a, b, c] = await Promise.all([makeUser('cnA'), makeUser('cnB'), makeUser('cnC')]); });

  it('you cannot connect with yourself', async () => {
    const r = await a.post('/connections', { user_id: a.id });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SELF_CONNECTION');
  });

  it('an unknown user is refused', async () => {
    expect((await a.post('/connections', { user_id: uuid0 })).status).toBe(404);
  });

  it('A → B creates a pending request, and repeating it is refused', async () => {
    const r = await a.post('/connections', { user_id: b.id, message: 'أهلا' });
    expect(r.status).toBe(201);
    id = connectionId(r);
    expect(id).toBeTruthy();
    const dup = await a.post('/connections', { user_id: b.id });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ALREADY_PENDING');
  });

  it('chat stays locked until the request is accepted', async () => {
    const r = await a.post(`/chats/${id}/messages`, { body: 'مرحبا' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CONNECTION_REQUIRED');
  });

  it('only the receiver can accept — not the requester, not a stranger', async () => {
    expect((await a.patch(`/connections/${id}`, { action: 'accept' })).status).toBe(403);
    expect((await c.patch(`/connections/${id}`, { action: 'accept' })).status).toBe(403);
    const ok = await b.patch(`/connections/${id}`, { action: 'accept' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('accepted');
  });

  it('after accepting, a second request is refused as already connected', async () => {
    const r = await a.post('/connections', { user_id: b.id });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ALREADY_CONNECTED');
  });

  it('an invalid action is rejected', async () => {
    expect((await b.patch(`/connections/${id}`, { action: 'explode' })).status).toBe(400);
  });
});

describe('direct messages', () => {
  let a, b, outsider, id;
  beforeAll(async () => {
    [a, b, outsider] = await Promise.all([makeUser('dmA'), makeUser('dmB'), makeUser('dmC')]);
    id = connectionId(await a.post('/connections', { user_id: b.id }));
    await b.patch(`/connections/${id}`, { action: 'accept' });
  });

  it('participants can exchange messages', async () => {
    const s = await a.post(`/chats/${id}/messages`, { body: 'السلام عليكم' });
    expect(s.status).toBe(201);
    const read = await b.get(`/chats/${id}/messages`);
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.body)).toContain('السلام عليكم');
  });

  it('empty and oversized messages are rejected', async () => {
    expect((await a.post(`/chats/${id}/messages`, { body: '' })).status).toBe(400);
    expect((await a.post(`/chats/${id}/messages`, { body: 'x'.repeat(4001) })).status).toBe(400);
  });

  it('a non-participant can neither read nor write the conversation', async () => {
    const read = await outsider.get(`/chats/${id}/messages`);
    expect([403, 404]).toContain(read.status);
    expect(JSON.stringify(read.body)).not.toContain('السلام عليكم');
    const write = await outsider.post(`/chats/${id}/messages`, { body: 'اختراق' });
    expect([403, 404]).toContain(write.status);
    const db = await query(`SELECT count(*)::int n FROM dm_messages WHERE connection_id=$1 AND body='اختراق'`, [id]);
    expect(db.rows[0].n).toBe(0);
  });

  it('the unread counter reflects new messages for the recipient', async () => {
    await a.post(`/chats/${id}/messages`, { body: 'رسالة جديدة' });
    const r = await b.get('/chats/unread');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toMatch(/[1-9]/);
  });

  it('removing the connection deletes the conversation', async () => {
    const r = await a.patch(`/connections/${id}`, { action: 'remove' });
    expect(r.status).toBe(200);
    const db = await query('SELECT count(*)::int n FROM dm_messages WHERE connection_id=$1', [id]);
    expect(db.rows[0].n).toBe(0);
    expect((await b.get(`/chats/${id}/messages`)).status).toBe(404);
  });

  it('a blocked/suspended counterpart cannot be messaged', async () => {
    const [x, y] = await Promise.all([makeUser('dmX'), makeUser('dmY')]);
    const cid = connectionId(await x.post('/connections', { user_id: y.id }));
    await y.patch(`/connections/${cid}`, { action: 'accept' });
    await query(`UPDATE users SET status='suspended' WHERE id=$1`, [y.id]);
    const r = await x.post(`/chats/${cid}/messages`, { body: 'هل أنت هناك' });
    expect(r.status).toBe(403);
  });
});
