import { query } from '../config/db.js';
import { supabaseAuth } from '../config/supabase.js';

export const USER_COLUMNS = `id,name,username,email,role,status,status_reason,status_until,bio,headline,phone,avatar_url,country,city,location,language,is_verified,availability,preferred_exchange_type,created_at,updated_at`;

// ───────── Roles & permissions ─────────
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE_MANAGER', 'ADS_MANAGER'];
const RANK = { USER: 0, SUPPORT: 1, ADS_MANAGER: 1, FINANCE_MANAGER: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };
const PERMISSIONS = {
  SUPER_ADMIN: '*',
  ADMIN: ['analytics', 'users.view', 'users.moderate', 'reports', 'reviews', 'exchanges', 'jobs', 'ads', 'taxonomy', 'settings', 'logs', 'listings'],
  MODERATOR: ['analytics', 'users.view', 'users.moderate', 'reports', 'reviews', 'exchanges', 'jobs', 'logs', 'listings'],
  SUPPORT: ['analytics', 'users.view', 'reports.view', 'exchanges.view'],
  ADS_MANAGER: ['analytics', 'ads'],
  FINANCE_MANAGER: ['analytics'],
};
// 'users.manage' (change roles, delete users, password-reset links) is intentionally SUPER_ADMIN only.

export const rank = role => RANK[role] ?? 0;
export function can(role, perm) {
  const p = PERMISSIONS[role];
  if (!p) return false;
  if (p === '*') return true;
  return p.includes(perm) || p.includes(perm.split('.')[0]);
}
export const permissionsFor = role => {
  const p = PERMISSIONS[role];
  if (!p) return [];
  return p === '*' ? ['*'] : p;
};
export const isAdminRole = role => ADMIN_ROLES.includes(role);
/** An admin may only act on accounts ranked strictly below their own. */
export const canActOn = (actorRole, targetRole) => rank(actorRole) > rank(targetRole);

// ───────── Authentication ─────────
const BLOCKED = new Set(['suspended', 'banned', 'closed']);

export function blockedPayload(u) {
  return { status: u.status, reason: u.status_reason || '', until: u.status_until || null };
}

async function resolveUser(token) {
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return { error: 'AUTH_INVALID' };
  const r = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id=$1`, [data.user.id]);
  if (!r.rowCount) return { error: 'USER_NOT_FOUND' };
  let u = r.rows[0];
  // Timed suspensions lift themselves.
  if (u.status === 'suspended' && u.status_until && new Date(u.status_until) < new Date()) {
    const up = await query(`UPDATE users SET status='active',status_reason='',status_until=NULL,updated_at=now() WHERE id=$1 RETURNING ${USER_COLUMNS}`, [u.id]);
    u = up.rows[0];
  }
  return { user: u, supabaseUser: data.user };
}

const bearer = req => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

export async function authenticate(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    const out = await resolveUser(token);
    if (out.error === 'AUTH_INVALID') return res.status(401).json({ success: false, message: 'Invalid or expired session', code: 'AUTH_INVALID' });
    if (out.error) return res.status(401).json({ success: false, message: 'User profile not found', code: out.error });
    if (BLOCKED.has(out.user.status)) {
      return res.status(403).json({ success: false, message: 'Account is not active', code: 'ACCOUNT_BLOCKED', details: blockedPayload(out.user) });
    }
    req.user = out.user;
    req.supabaseUser = out.supabaseUser;
    next();
  } catch (e) { next(e); }
}

/** Attaches req.user when a valid token is present, but never rejects. */
export async function optionalAuth(req, _res, next) {
  try {
    const token = bearer(req);
    if (token) {
      const out = await resolveUser(token);
      if (out.user && !BLOCKED.has(out.user.status)) req.user = out.user;
    }
  } catch { /* anonymous */ }
  next();
}

export const requirePermission = perm => (req, res, next) => {
  if (!req.user || !can(req.user.role, perm)) {
    return res.status(403).json({ success: false, message: 'You do not have permission for this action', code: 'FORBIDDEN_PERMISSION', permission: perm });
  }
  next();
};
export const requireAdmin = (req, res, next) => {
  if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ success: false, message: 'Admin access required', code: 'ADMIN_REQUIRED' });
  next();
};
export const requireSuperAdmin = requirePermission('users.manage');
