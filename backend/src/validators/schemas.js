import { z } from 'zod';

const trim = (max, min = 0) => z.string().trim().min(min).max(max);
const phone = z.string().trim().regex(/^(\+?[0-9][0-9\s().-]{6,19})?$/, 'رقم هاتف غير صالح').or(z.literal(''));
const username = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_.-]+$/, 'Username may contain letters, numbers, dots, underscores and dashes');
const uuid = z.string().uuid();
const httpUrl = z.string().trim().max(1000).refine(v => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } }, 'Only http(s) links are allowed');
const optUrl = httpUrl.or(z.literal(''));

export const registerSchema = z.object({
  name: trim(120, 2),
  username,
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  phone: phone.optional().default(''),
  country: trim(80).optional().default(''),
  city: trim(80).optional().default(''),
  bio: trim(4000).optional().default(''),
  language: trim(80).optional().default('العربية'),
});
export const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) });

// Partial update: only fields that are sent change.
export const profileSchema = z.object({
  name: trim(120, 2),
  username,
  headline: trim(140),
  bio: trim(4000),
  phone,
  country: trim(80),
  city: trim(80),
  language: trim(80),
  availability: trim(80),
  preferred_exchange_type: z.enum(['swap', 'paid']),
}).partial();

export const avatarSchema = z.object({ data_url: z.string().max(2_500_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image') });

export const userSkillSchema = z.object({
  skill_id: uuid,
  type: z.enum(['offer', 'need']),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).default('Beginner'),
  experience_years: z.number().min(0).max(50).optional().default(0),
  description: trim(2000).optional().default(''),
  priority: z.number().int().min(0).max(100).optional().default(0),
});

export const exchangeSchema = z.object({
  receiver_id: uuid, offered_skill_id: uuid, requested_skill_id: uuid,
  deal_type: z.enum(['swap', 'paid']), message: trim(2000).optional().default(''),
});
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  communication_rating: z.number().int().min(1).max(5).optional(),
  knowledge_rating: z.number().int().min(1).max(5).optional(),
  commitment_rating: z.number().int().min(1).max(5).optional(),
  comment: trim(2000).optional().default(''),
});
export const sessionSchema = z.object({
  teacher_id: uuid, learner_id: uuid, scheduled_at: z.string().datetime({ offset: true }).or(z.string().min(10)),
  duration: z.number().int().min(15).max(480), notes: trim(4000).optional().default(''),
});
export const reportSchema = z.object({
  target_type: z.enum(['user', 'skill', 'message', 'review', 'advertisement', 'exchange']).default('user'),
  target_id: uuid.optional(),
  reported_user_id: uuid.optional(),
  exchange_id: uuid.optional(),
  reason: trim(120, 2),
  description: trim(2000).optional().default(''),
  evidence: trim(2000).optional().default(''),
}).refine(v => Boolean(v.target_id || v.reported_user_id || v.exchange_id), { message: 'target_id or reported_user_id is required' });


export const listingSchema = z.object({
  mode: z.enum(['offer','need']),
  asset_type: z.enum(['skill','service','product','time','knowledge','other']),
  title: trim(180, 3),
  description: trim(4000).optional().default(''),
  category_id: uuid.nullable().optional().default(null),
  skill_id: uuid.nullable().optional().default(null),
  city: trim(100).optional().default(''),
  delivery_mode: z.enum(['online','in_person','both']).default('both'),
  condition_note: trim(500).optional().default(''),
  estimated_value: z.number().min(0).max(1e9).nullable().optional().default(null),
  status: z.enum(['draft','published','paused','closed']).optional().default('published'),
});
export const adminListingPatchSchema = z.object({
  mode: z.enum(['offer','need']).optional(),
  asset_type: z.enum(['skill','service','product','time','knowledge','other']).optional(),
  title: trim(180, 3).optional(),
  description: trim(4000).optional(),
  category_id: uuid.nullable().optional(),
  skill_id: uuid.nullable().optional(),
  city: trim(100).optional(),
  delivery_mode: z.enum(['online','in_person','both']).optional(),
  condition_note: trim(500).optional(),
  estimated_value: z.number().min(0).max(1e9).nullable().optional(),
  status: z.enum(['draft','published','paused','closed','removed']).optional(),
  featured: z.boolean().optional(),
});
export const proposalSchema = z.object({
  offered_listing_id: uuid.nullable().optional().default(null),
  note: trim(2000).optional().default(''),
});
export const proposalStatusSchema = z.object({ status: z.enum(['accepted','rejected','cancelled','completed','disputed']) });

export const jobSchema = z.object({
  title: trim(180, 3), description: trim(8000, 10), company: trim(180).optional().default(''),
  location: trim(180).optional().default(''), job_type: z.enum(['remote', 'hybrid', 'on_site']).default('remote'),
  required_skills: trim(1200).optional().default(''),
});

// ───────── Connections & chat ─────────
export const connectionRequestSchema = z.object({ user_id: uuid, message: trim(500).optional().default('') });
export const connectionActionSchema = z.object({ action: z.enum(['accept', 'decline', 'cancel', 'remove']) });
export const dmSchema = z.object({ body: trim(4000, 1) });
export const voiceSchema = z.object({ data_url: z.string().max(2_200_000), seconds: z.coerce.number().int().min(1).max(120) });

// ───────── Assistant ─────────
export const assistantSchema = z.object({
  message: trim(600, 1),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: trim(1500) })).max(8).optional().default([]),
});

// ───────── Admin ─────────
export const accountStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned', 'closed']),
  reason: trim(500).optional().default(''),
  days: z.number().int().min(1).max(365).optional(),   // only for timed suspension
});
export const reportActionSchema = z.object({
  action: z.enum(['dismiss', 'investigate', 'warn', 'suspend', 'close', 'ban', 'resolve']),
  note: trim(1000).optional().default(''),
  days: z.number().int().min(1).max(365).optional(),
});
export const adSchema = z.object({
  title: trim(180, 2),
  description: trim(1000).optional().default(''),
  advertiser_name: trim(160, 2),
  image_url: optUrl.optional().default(''),
  logo_url: optUrl.optional().default(''),
  target_url: optUrl.optional().default(''),
  cta_label: trim(60).optional().default('اعرف أكثر'),
  placement: z.enum(['HOME_HERO', 'HOME_FEED', 'BROWSE', 'SIDEBAR']).default('HOME_FEED'),
  status: z.enum(['active', 'paused', 'disabled']).default('active'),
  priority: z.number().int().min(0).max(100).default(0),
  start_at: z.string().datetime({ offset: true }).nullable().optional(),
  end_at: z.string().datetime({ offset: true }).nullable().optional(),
});
export const adPatchSchema = adSchema.partial();
export const imageUploadSchema = avatarSchema;

// ───────── "About the project" page ─────────
const txt = (max, min = 0) => z.string().trim().min(min).max(max);
const link = z.string().trim().max(500).refine(v => v === '' || /^https?:\/\/[^\s<>"']+$/i.test(v), 'Only http(s) links are allowed');
const lines = (n, max) => z.array(txt(max, 1)).max(n);
export const aboutSchema = z.object({
  project: z.object({ name: txt(80, 1), tagline: txt(200), description: txt(1500), problem: txt(1500), goals: lines(12, 300), features: lines(20, 120) }),
  academic: z.object({
    university: txt(150), faculty: txt(150), department: txt(150), year: txt(40),
    supervisor: z.object({ name: txt(120), title: txt(120), photo_url: link }),
  }),
  team: z.array(z.object({ name: txt(100, 1), role: txt(120), bio: txt(300), photo_url: link, linkedin: link, github: link })).max(30),
  tech: z.array(z.object({ group: txt(80, 1), items: lines(20, 60) })).max(12),
  contact: z.object({ email: z.string().trim().max(200).refine(v => v === '' || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v), 'Invalid email'), github: link, website: link }),
});
