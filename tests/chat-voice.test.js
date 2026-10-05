import { describe, it, expect, beforeAll } from 'vitest';
import { makeUser, makeSkill, query } from './helpers/api.js';
import { files } from './helpers/fakeSupabase.js';

// A minimal-but-valid container header per format; the server sniffs magic bytes, never the declared MIME.
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 7)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(400, 7)]);
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(400, 7)]);
const url = (buf, mime = 'audio/webm;codecs=opus') => `data:${mime};base64,${buf.toString('base64')}`;
const cid = r => r.body.data.id ?? r.body.data.connection?.id;
async function pair(label) {
  const [a, b] = await Promise.all([makeUser(`${label}A`), makeUser(`${label}B`)]);
  const id = cid(await a.post('/connections', { user_id: b.id }));
  await b.patch(`/connections/${id}`, { action: 'accept' });
  return { a, b, id };
}

describe('chat opens automatically when an exchange is accepted', () => {
  it('no connection request needed: accepting the exchange unlocks the chat for both', async () => {
    const [a, b] = await Promise.all([makeUser('autoA'), makeUser('autoB')]);
    const [sa, sb] = [await makeSkill('d'), await makeSkill('e')];
    await a.post('/users/me/skills', { skill_id: sa.id, type: 'offer', level: 'Advanced' });
    await b.post('/users/me/skills', { skill_id: sb.id, type: 'offer', level: 'Advanced' });
    const ex = await a.post('/exchanges', { receiver_id: b.id, offered_skill_id: sa.id, requested_skill_id: sb.id, deal_type: 'swap', message: 'x' });
    const id = ex.body.data.id ?? ex.body.data.exchange?.id;

    const before = await query('SELECT count(*)::int n FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [a.id, b.id]);
    expect(before.rows[0].n).toBe(0);                                   // pending exchange ⇒ still no chat
    expect((await b.patch(`/exchanges/${id}/status`, { status: 'accepted' })).status).toBe(200);

    const conn = await query(`SELECT id,status FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`, [a.id, b.id]);
    expect(conn.rows[0].status).toBe('accepted');
    const msg = await a.post(`/chats/${conn.rows[0].id}/messages`, { body: 'أهلا بعد القبول' });
    expect(msg.status).toBe(201);

    // The inbox shows the exchange context (who gives / who takes).
    const inbox = await b.get('/chats');
    const row = inbox.body.data.find(x => x.connection_id === conn.rows[0].id);
    expect(row.exchange_status).toBe('accepted');
    expect(row.offered_name).toBe(sa.name);
    expect(row.requested_name).toBe(sb.name);
  });

  it('a rejected exchange does not open a chat', async () => {
    const [a, b] = await Promise.all([makeUser('rejA'), makeUser('rejB')]);
    const [sa, sb] = [await makeSkill('d2'), await makeSkill('e2')];
    await a.post('/users/me/skills', { skill_id: sa.id, type: 'offer', level: 'Advanced' });
    await b.post('/users/me/skills', { skill_id: sb.id, type: 'offer', level: 'Advanced' });
    const ex = await a.post('/exchanges', { receiver_id: b.id, offered_skill_id: sa.id, requested_skill_id: sb.id, deal_type: 'swap', message: 'x' });
    await b.patch(`/exchanges/${ex.body.data.id ?? ex.body.data.exchange?.id}/status`, { status: 'rejected' });
    const n = await query('SELECT count(*)::int n FROM connections WHERE requester_id=$1 OR addressee_id=$1', [a.id]);
    expect(n.rows[0].n).toBe(0);
  });
});

describe('voice messages', () => {
  let a, b, id, outsider;
  beforeAll(async () => { ({ a, b, id } = await pair('vc')); outsider = await makeUser('vcOut'); });

  it('a participant can send a voice message; the audio is stored privately and returned as a signed URL', async () => {
    const r = await a.post(`/chats/${id}/voice`, { data_url: url(WEBM), seconds: 7 });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ kind: 'voice', audio_seconds: 7, sender_id: a.id });
    expect(r.body.data.audio_url).toContain('/sign/voice/');
    expect(r.body.data).not.toHaveProperty('audio_path');                 // storage path is never exposed
    expect([...files.keys()].some(k => k.startsWith(`voice/${id}/`))).toBe(true);
  });

  it('the other participant receives it, with a signed URL', async () => {
    const r = await b.get(`/chats/${id}/messages`);
    const v = r.body.data.find(m => m.kind === 'voice');
    expect(v).toBeTruthy();
    expect(v.audio_url).toBeTruthy();
    expect(v).not.toHaveProperty('audio_path');
  });

  it('supports the Opus/WebM, Ogg and MP4 (Safari) containers', async () => {
    expect((await a.post(`/chats/${id}/voice`, { data_url: url(OGG, 'audio/ogg'), seconds: 3 })).status).toBe(201);
    expect((await a.post(`/chats/${id}/voice`, { data_url: url(MP4, 'audio/mp4'), seconds: 3 })).status).toBe(201);
  });

  it('rejects a file that is not really audio, even if it claims to be', async () => {
    const fake = Buffer.concat([Buffer.from('<script>alert(1)</script>'), Buffer.alloc(100)]);
    const r = await a.post(`/chats/${id}/voice`, { data_url: url(fake), seconds: 3 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_AUDIO');
  });

  it.each([
    ['an unsupported MIME type', () => ({ data_url: `data:audio/exe;base64,${WEBM.toString('base64')}`, seconds: 3 }), 400],
    ['a non-data-URL string', () => ({ data_url: 'https://evil.example/a.webm', seconds: 3 }), 400],
    ['zero seconds', () => ({ data_url: url(WEBM), seconds: 0 }), 400],
    ['more than 120 seconds', () => ({ data_url: url(WEBM), seconds: 121 }), 400],
    ['a recording over the size limit', () => ({ data_url: url(Buffer.concat([WEBM, Buffer.alloc(1_600_000)])), seconds: 60 }), 413],
  ])('rejects %s', async (_l, make, status) => {
    expect((await a.post(`/chats/${id}/voice`, make())).status).toBe(status);
  });

  it('an outsider cannot send voice into, or read voice from, someone else’s chat', async () => {
    const send = await outsider.post(`/chats/${id}/voice`, { data_url: url(WEBM), seconds: 3 });
    expect([403, 404]).toContain(send.status);
    const read = await outsider.get(`/chats/${id}/messages`);
    expect([403, 404]).toContain(read.status);
    expect(JSON.stringify(read.body)).not.toContain('/sign/voice/');
  });

  it('voice is blocked until the connection is accepted', async () => {
    const [x, y] = await Promise.all([makeUser('vcX'), makeUser('vcY')]);
    const pending = cid(await x.post('/connections', { user_id: y.id }));
    const r = await x.post(`/chats/${pending}/voice`, { data_url: url(WEBM), seconds: 3 });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CONNECTION_REQUIRED');
    expect([...files.keys()].some(k => k.startsWith(`voice/${pending}/`))).toBe(false);   // nothing was uploaded
  });

  it('the inbox previews a voice message as text', async () => {
    const { a: p, b: q, id: cc } = await pair('prev');
    await p.post(`/chats/${cc}/voice`, { data_url: url(WEBM), seconds: 5 });
    const row = (await q.get('/chats')).body.data.find(x => x.connection_id === cc);
    expect(row.last_body).toContain('رسالة صوتية');
    expect(row.unread).toBe(1);
  });

  it('removing the connection removes its messages', async () => {
    const { a: p, b: q, id: cc } = await pair('rm');
    await p.post(`/chats/${cc}/voice`, { data_url: url(WEBM), seconds: 5 });
    await p.patch(`/connections/${cc}`, { action: 'remove' });
    const n = await query('SELECT count(*)::int n FROM dm_messages WHERE connection_id=$1', [cc]);
    expect(n.rows[0].n).toBe(0);
    expect((await q.get(`/chats/${cc}/messages`)).status).toBe(404);
  });
});

describe('read receipts', () => {
  it('after the recipient opens the chat, the sender is told which messages were read', async () => {
    const { a, b, id } = await pair('rc');
    const m1 = (await a.post(`/chats/${id}/messages`, { body: 'one' })).body.data;
    const m2 = (await a.post(`/chats/${id}/voice`, { data_url: url(WEBM), seconds: 4 })).body.data;
    expect((await a.get(`/chats/${id}/messages`)).body.read_ids).toEqual([]);     // nobody has read yet
    await b.get(`/chats/${id}/messages`);                                            // recipient opens the thread
    const after = await a.get(`/chats/${id}/messages`);
    expect(after.body.read_ids).toEqual(expect.arrayContaining([m1.id, m2.id]));
  });

  it('your own messages are never marked read just because you open the chat', async () => {
    const { a, id } = await pair('rc2');
    const m = (await a.post(`/chats/${id}/messages`, { body: 'mine' })).body.data;
    await a.get(`/chats/${id}/messages`);
    expect((await a.get(`/chats/${id}/messages`)).body.read_ids).not.toContain(m.id);
  });
});
