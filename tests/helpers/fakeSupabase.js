// In-memory stand-in for Supabase Auth/Storage so the API can be tested end to end
// against a real Postgres without needing the Auth container.
import crypto from 'node:crypto';
import { query } from '../../backend/src/config/db.js';

const creds = new Map();      // email -> { id, password }
const tokens = new Map();     // access_token -> user id
const refresh = new Map();    // refresh_token -> user id
const banned = new Set();
export const files = new Map();   // 'bucket/path' -> Buffer (lets tests assert what was stored / cleaned up)

const session = id => {
  const access_token = `at_${crypto.randomUUID()}`; const refresh_token = `rt_${crypto.randomUUID()}`;
  tokens.set(access_token, id); refresh.set(refresh_token, id);
  return { access_token, refresh_token, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer' };
};
const err = message => ({ data: { user: null, session: null }, error: { message } });

export const supabaseAuth = {
  auth: {
    async signUp({ email, password }) {
      const id = crypto.randomUUID();
      await query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, email.toLowerCase()]);
      creds.set(email.toLowerCase(), { id, password });
      // Like a Supabase project with "Confirm email" OFF (the local default): sign-up returns a session immediately.
      return { data: { user: { id, email }, session: session(id) }, error: null };
    },
    async signInWithPassword({ email, password }) {
      const c = creds.get(String(email).toLowerCase());
      if (!c || c.password !== password) return err('Invalid login credentials');
      if (banned.has(c.id)) return err('User is banned');
      return { data: { user: { id: c.id }, session: session(c.id) }, error: null };
    },
    async getUser(token) {
      const id = tokens.get(token);
      if (!id || banned.has(id)) return { data: { user: null }, error: { message: 'invalid JWT' } };
      return { data: { user: { id } }, error: null };
    },
    async refreshSession({ refresh_token }) {
      const id = refresh.get(refresh_token);
      if (!id) return err('Invalid Refresh Token');
      return { data: { user: { id }, session: session(id) }, error: null };
    },
    async resend() { return { data: {}, error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
  },
};

export const supabaseAdmin = {
  auth: {
    admin: {
      async updateUserById(id, attrs = {}) {
        if (attrs.ban_duration) { if (attrs.ban_duration === 'none') banned.delete(id); else banned.add(id); }
        if (attrs.password) for (const c of creds.values()) if (c.id === id) c.password = attrs.password;
        return { data: { user: { id } }, error: null };
      },
      async createUser({ email, password }) {
        const id = crypto.randomUUID();
        await query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, email.toLowerCase()]);
        creds.set(email.toLowerCase(), { id, password });
        return { data: { user: { id, email } }, error: null };
      },
      async deleteUser(id) { await query('DELETE FROM auth.users WHERE id=$1', [id]); return { data: {}, error: null }; },
      async generateLink() { return { data: { properties: { action_link: 'http://localhost/recovery' } }, error: null }; },
    },
  },
  storage: { from: bucket => ({
    async upload(path, buf) { files.set(`${bucket}/${path}`, buf); return { data: { path }, error: null }; },
    async remove(paths) { for (const p of paths) files.delete(`${bucket}/${p}`); return { data: {}, error: null }; },
    async createSignedUrls(paths) { return { data: paths.map(path => ({ path, signedUrl: `http://localhost/sign/${bucket}/${path}?token=t` })), error: null }; },
    getPublicUrl: p => ({ data: { publicUrl: `http://localhost/${p}` } }),
  }) },
};
export const assertSupabaseAdmin = () => supabaseAdmin;
