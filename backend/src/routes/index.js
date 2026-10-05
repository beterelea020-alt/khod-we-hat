import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me, logout, refresh, forgotPassword, resendVerification, updatePassword } from '../controllers/auth.js';
import { authenticate, optionalAuth, requirePermission, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from '../validators/schemas.js';
import * as d from '../controllers/data.js';
import * as a from '../controllers/admin.js';
import * as j from '../controllers/jobs.js';
import * as sess from '../controllers/sessions.js';
import * as conn from '../controllers/connections.js';
import * as chat from '../controllers/chat.js';
import * as up from '../controllers/uploads.js';
import * as about from '../controllers/about.js';
import * as ads from '../controllers/ads.js';
import { assistant } from '../controllers/assistant.js';
import { requireFeature } from '../middleware/features.js';
import * as xe from '../controllers/exchangeEngine.js';

const r = Router();
const strict = (max, windowMs = 60_000) => rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'محاولات كثيرة، حاول بعد قليل', code: 'RATE_LIMITED' } });

// ───────── Public ─────────
r.get('/health', (_req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));
// Browser-safe config (anon key is public by design; the service-role key never leaves the server).
r.get('/config', (_req, res) => res.json({ success: true, data: { supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '', aiAssistant: Boolean(process.env.ANTHROPIC_API_KEY) } }));
r.get('/stats', d.stats);
r.get('/about', about.readAbout);
r.get('/skills', d.skills);
r.get('/categories', d.categories);
r.get('/jobs', j.listPublished);
r.get('/ads', ads.listActive);
r.post('/ads/:id/impression', optionalAuth, strict(60), ads.impression);
r.post('/ads/:id/click', optionalAuth, strict(30), ads.click);

// ───────── Auth ─────────
r.post('/auth/register', strict(8, 10 * 60_000), validate(S.registerSchema), register);
r.post('/auth/login', strict(10, 5 * 60_000), validate(S.loginSchema), login);
r.post('/auth/refresh', strict(30), refresh);
r.post('/auth/forgot-password', strict(5, 10 * 60_000), forgotPassword);
r.post('/auth/resend-verification', strict(5, 10 * 60_000), resendVerification);
r.post('/auth/update-password', strict(10, 10 * 60_000), updatePassword);
r.post('/auth/logout', authenticate, logout);
r.get('/auth/me', authenticate, me);

// ───────── Assistant (works signed-out too; personalised when signed in) ─────────
r.post('/assistant', optionalAuth, strict(20), validate(S.assistantSchema), assistant);

// ───────── Discovery & profiles ─────────
r.get('/users', optionalAuth, d.users);
r.get('/users/matches', authenticate, d.matches);
r.get('/listings', optionalAuth, xe.listListings);
r.get('/listings/matches', authenticate, xe.matches);
r.get('/listings/mine', authenticate, xe.myListings);
r.get('/listings/proposals', authenticate, xe.listMyProposals);
r.get('/listings/:id', optionalAuth, xe.getListing);
r.post('/listings', authenticate, validate(S.listingSchema), xe.createListing);
r.patch('/listings/:id', authenticate, validate(S.listingSchema.partial()), xe.updateListing);
r.post('/listings/:id/proposals', authenticate, validate(S.proposalSchema), xe.createProposal);
r.patch('/listings/proposals/:id', authenticate, validate(S.proposalStatusSchema), xe.updateProposal);
r.get('/users/:id', optionalAuth, d.userById);
r.patch('/users/me', authenticate, validate(S.profileSchema), d.updateProfile);
r.post('/users/me/avatar', authenticate, strict(10, 10 * 60_000), validate(S.avatarSchema), up.avatar);
r.delete('/users/me/avatar', authenticate, up.removeAvatar);
r.get('/users/me/skills', authenticate, d.mySkills);
r.post('/users/me/skills', authenticate, validate(S.userSkillSchema), d.addUserSkill);
r.delete('/users/me/skills/:id', authenticate, d.deleteUserSkill);

// ───────── Connections (طلبات التواصل) & chat ─────────
r.get('/connections', authenticate, conn.list);
r.post('/connections', authenticate, requireFeature('connections_enabled'), validate(S.connectionRequestSchema), conn.request);
r.patch('/connections/:id', authenticate, validate(S.connectionActionSchema), conn.act);
r.get('/chats', authenticate, requireFeature('chat_enabled'), chat.inbox);
r.get('/chats/unread', authenticate, requireFeature('chat_enabled'), chat.unreadCount);
r.get('/chats/:connectionId/messages', authenticate, requireFeature('chat_enabled'), chat.messages);
r.post('/chats/:connectionId/messages', authenticate, requireFeature('chat_enabled'), validate(S.dmSchema), chat.send);
r.post('/chats/:connectionId/voice', authenticate, requireFeature('chat_enabled'), strict(20, 5 * 60_000), validate(S.voiceSchema), chat.sendVoice);

// ───────── Exchanges, sessions, reviews, reports ─────────
r.get('/exchanges', authenticate, d.exchanges);
r.post('/exchanges', authenticate, requireFeature('exchanges_enabled'), validate(S.exchangeSchema), d.createExchange);
r.get('/exchanges/:id', authenticate, d.exchangeById);
r.patch('/exchanges/:id/status', authenticate, d.updateExchange);
r.get('/sessions', authenticate, sess.list);
r.post('/exchanges/:exchangeId/sessions', authenticate, requireFeature('exchanges_enabled'), validate(S.sessionSchema), sess.create);
r.patch('/sessions/:id', authenticate, sess.update);
r.post('/exchanges/:exchangeId/reviews', authenticate, requireFeature('reviews_enabled'), validate(S.reviewSchema), d.createReview);
r.post('/reports', authenticate, validate(S.reportSchema), d.createReport);

// ───────── Notifications ─────────
r.get('/notifications', authenticate, d.notifications);
r.post('/notifications/read-all', authenticate, d.markNotifications);
r.post('/notifications/:id/read', authenticate, d.markNotification);

// ───────── Jobs ─────────
r.get('/jobs/mine', authenticate, j.listMine);
r.get('/jobs/:id', j.getOne);
r.post('/jobs', authenticate, requireFeature('jobs_enabled'), validate(S.jobSchema), j.create);
r.patch('/jobs/:id', authenticate, validate(S.jobSchema), j.updateMine);
r.post('/jobs/:id/close', authenticate, j.closeMine);

// ───────── Admin (every route gated by an explicit permission) ─────────
// Blanket guard: nothing under /admin is reachable without a valid session AND an admin-type role,
// even if a future route forgets its own permission check. Per-route permissions below narrow it further.
r.use('/admin', strict(120), authenticate, requireAdmin);
const P = requirePermission;
const A = (perm, ...h) => [P(perm), ...h]; // authenticate + requireAdmin already applied by the blanket guard above
r.get('/admin/analytics', ...A('analytics', a.analytics));
// users
r.get('/admin/users', ...A('users.view', a.listUsers));
r.get('/admin/users/:id', ...A('users.view', a.userDetail));
r.patch('/admin/users/:id/status', ...A('users.moderate', validate(S.accountStatusSchema), a.updateUserStatus));
r.patch('/admin/users/:id/verification', ...A('users.moderate', a.updateUserVerification));
r.patch('/admin/users/:id/role', ...A('users.manage', a.updateUserRole));
r.post('/admin/users/:id/password-reset', ...A('users.manage', a.resetUserPassword));
r.delete('/admin/users/:id', ...A('users.manage', a.deleteUser));
// reports (user / exchange / message reports)
r.get('/admin/reports', ...A('reports.view', a.listReports));
r.get('/admin/reports/:id', ...A('reports.view', a.reportDetail));
r.patch('/admin/reports/:id', ...A('reports', validate(S.reportActionSchema), a.updateReport));
// exchanges & reviews
r.get('/admin/exchanges', ...A('exchanges.view', a.listExchanges));
r.get('/admin/listings', ...A('listings', xe.adminListings));
r.patch('/admin/listings/:id', ...A('listings', validate(S.adminListingPatchSchema), xe.adminPatchListing));
r.patch('/admin/listings/:id/status', ...A('listings', xe.adminUpdateListing));
r.patch('/admin/exchanges/:id/status', ...A('exchanges', a.adminExchangeStatus));
r.get('/admin/reviews', ...A('reviews', a.listReviews));
r.patch('/admin/reviews/:id', ...A('reviews', a.updateReview));
// company ads
r.get('/admin/ads', ...A('ads', a.listAds));
r.post('/admin/ads', ...A('ads', validate(S.adSchema), a.createAd));
r.patch('/admin/ads/:id', ...A('ads', validate(S.adPatchSchema), a.updateAd));
r.delete('/admin/ads/:id', ...A('ads', a.deleteAd));
r.get('/admin/about', ...A('settings', about.readAbout));
r.put('/admin/about', ...A('settings', strict(30, 10 * 60_000), validate(S.aboutSchema), about.writeAbout));
r.delete('/admin/about', ...A('settings', about.restoreAbout));
r.post('/admin/uploads/team-photo', ...A('settings', strict(40, 10 * 60_000), validate(S.imageUploadSchema), about.teamPhoto));
r.post('/admin/uploads/ad-image', ...A('ads', strict(20, 10 * 60_000), validate(S.imageUploadSchema), up.adImage));
// taxonomy, jobs, logs, settings
r.get('/admin/skills', ...A('taxonomy', a.listSkillsAdmin));
r.post('/admin/skills', ...A('taxonomy', a.createSkill));
r.patch('/admin/skills/:id', ...A('taxonomy', a.updateSkill));
r.delete('/admin/skills/:id', ...A('taxonomy', a.deleteSkill));
r.get('/admin/categories', ...A('taxonomy', a.listCategoriesAdmin));
r.post('/admin/categories', ...A('taxonomy', a.createCategory));
r.patch('/admin/categories/:id', ...A('taxonomy', a.updateCategory));
r.delete('/admin/categories/:id', ...A('taxonomy', a.deleteCategory));
r.get('/admin/jobs', ...A('jobs', a.listJobs));
r.patch('/admin/jobs/:id/moderation', ...A('jobs', a.moderateJob));
r.get('/admin/actions', ...A('logs', a.actions));
r.get('/admin/settings', ...A('settings', a.readSettings));
r.patch('/admin/settings', ...A('settings', a.writeSettings));

export default r;
