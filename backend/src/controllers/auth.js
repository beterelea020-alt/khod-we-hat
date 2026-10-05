import { query } from '../config/db.js';
import { supabaseAuth, assertSupabaseAdmin } from '../config/supabase.js';
import { getSetting } from '../services/settings.js';
import { USER_COLUMNS, permissionsFor, blockedPayload } from '../middleware/auth.js';

const BLOCKED = new Set(['suspended', 'banned', 'closed']);
const withPermissions = u => ({ ...u, permissions: permissionsFor(u.role) });
const profileById = id => query(`SELECT ${USER_COLUMNS} FROM users WHERE id=$1`, [id]);
const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:4000').split(',')[0].trim().replace(/\/$/, '');
const resetRedirect = () => process.env.PASSWORD_RESET_REDIRECT_URL || `${clientUrl()}/#reset-password`;

function sessionPayload(s) {
  if (!s) return null;
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type };
}

export async function register(req, res, next) {
  let createdAuthId = null;
  try {
    if (!(await getSetting('registration_enabled'))) {
      return res.status(403).json({ success: false, message: 'Registration is currently disabled', code: 'REGISTRATION_DISABLED' });
    }
    const { name, username, email, password, phone, country, city, bio, language } = req.body;
    const existing = await query('SELECT 1 FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($2)', [email, username]);
    if (existing.rowCount) return res.status(409).json({ success: false, message: 'Email or username is already registered', code: 'ACCOUNT_EXISTS' });

    const { data, error } = await supabaseAuth.auth.signUp({
      email, password,
      options: { data: { name, username }, emailRedirectTo: clientUrl() },
    });
    if (error) return res.status(400).json({ success: false, message: error.message, code: 'SUPABASE_SIGNUP_FAILED' });
    if (!data.user) return res.status(400).json({ success: false, message: 'Unable to create account', code: 'SIGNUP_FAILED' });
    createdAuthId = data.user.id;

    const location = [city, country].filter(Boolean).join('، ');
    const insert = await query(
      `INSERT INTO users(id,name,username,email,phone,country,city,location,language,bio)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${USER_COLUMNS}`,
      [data.user.id, name, username, email.toLowerCase(), phone, country, city, location, language, bio]
    );
    createdAuthId = null;
    res.status(201).json({
      success: true,
      data: {
        user: withPermissions(insert.rows[0]),
        session: sessionPayload(data.session),
        email_confirmation_required: !data.session,
        message: !data.session ? 'تم إنشاء الحساب. افتح بريدك وفعّل الحساب ثم سجّل الدخول.' : 'تم إنشاء الحساب بنجاح.',
      },
    });
  } catch (e) {
    // Don't leave a half-created Supabase auth user behind.
    if (createdAuthId) { try { await assertSupabaseAdmin().auth.admin.deleteUser(createdAuthId); } catch { /* ignore */ } }
    if (e?.code === '23505') return res.status(409).json({ success: false, message: 'Email or username is already registered', code: 'ACCOUNT_EXISTS' });
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) {
      if (/banned/i.test(error.message)) {
        const p = await query('SELECT status,status_reason,status_until FROM users WHERE lower(email)=lower($1)', [email]);
        return res.status(403).json({ success: false, message: 'Account is not active', code: 'ACCOUNT_BLOCKED', details: p.rowCount ? blockedPayload(p.rows[0]) : { status: 'banned', reason: '', until: null } });
      }
      const code = /confirm|verified/i.test(error.message) ? 'EMAIL_NOT_VERIFIED' : 'INVALID_CREDENTIALS';
      return res.status(401).json({ success: false, message: code === 'EMAIL_NOT_VERIFIED' ? 'Email not verified' : 'Invalid email or password', code });
    }
    const p = await profileById(data.user.id);
    if (!p.rowCount) return res.status(404).json({ success: false, message: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
    let u = p.rows[0];
    if (u.status === 'suspended' && u.status_until && new Date(u.status_until) < new Date()) {
      u = (await query(`UPDATE users SET status='active',status_reason='',status_until=NULL,updated_at=now() WHERE id=$1 RETURNING ${USER_COLUMNS}`, [u.id])).rows[0];
    }
    if (BLOCKED.has(u.status)) {
      return res.status(403).json({ success: false, message: 'Account is not active', code: 'ACCOUNT_BLOCKED', details: blockedPayload(u) });
    }
    res.json({ success: true, data: { user: withPermissions(u), session: sessionPayload(data.session) } });
  } catch (e) { next(e); }
}

export async function refresh(req, res, next) {
  try {
    const refresh_token = String(req.body?.refresh_token || '').trim();
    if (!refresh_token) return res.status(400).json({ success: false, message: 'refresh_token is required', code: 'VALIDATION_ERROR' });
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
    if (error || !data.session) return res.status(401).json({ success: false, message: 'Session expired', code: 'REFRESH_FAILED' });
    const p = await profileById(data.user.id);
    if (!p.rowCount || BLOCKED.has(p.rows[0].status)) {
      return res.status(403).json({ success: false, message: 'Account is not active', code: 'ACCOUNT_BLOCKED', details: p.rowCount ? blockedPayload(p.rows[0]) : null });
    }
    res.json({ success: true, data: { user: withPermissions(p.rows[0]), session: sessionPayload(data.session) } });
  } catch (e) { next(e); }
}

export async function me(req, res) {
  res.json({ success: true, data: { user: withPermissions(req.user) } });
}

export async function logout(_req, res) {
  // Tokens live in the browser; the client discards them. (Supabase JWTs expire on their own.)
  res.json({ success: true });
}

export async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ success: false, message: 'Email is required', code: 'VALIDATION_ERROR' });
    await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo: resetRedirect() });
    // Same answer whether or not the email exists (no account enumeration).
    res.json({ success: true, message: 'لو البريد مسجّل عندنا، هتوصلك رسالة لإعادة تعيين كلمة المرور.' });
  } catch (e) { next(e); }
}

export async function resendVerification(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ success: false, message: 'Email is required', code: 'VALIDATION_ERROR' });
    await supabaseAuth.auth.resend({ type: 'signup', email, options: { emailRedirectTo: clientUrl() } });
    res.json({ success: true, message: 'لو الحساب موجود وغير مفعّل، أرسلنا رسالة التفعيل من جديد.' });
  } catch (e) { next(e); }
}

export async function updatePassword(req, res, next) {
  try {
    const access_token = String(req.body?.access_token || '').trim();
    const password = String(req.body?.password || '');
    if (!access_token || password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, message: 'A valid recovery token and a password of 8–72 characters are required', code: 'VALIDATION_ERROR' });
    }
    const { data, error } = await supabaseAuth.auth.getUser(access_token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Recovery link is invalid or expired', code: 'RECOVERY_INVALID' });
    const out = await assertSupabaseAdmin().auth.admin.updateUserById(data.user.id, { password });
    if (out.error) return res.status(400).json({ success: false, message: out.error.message, code: 'PASSWORD_UPDATE_FAILED' });
    res.json({ success: true, message: 'تم تغيير كلمة المرور.' });
  } catch (e) { next(e); }
}
