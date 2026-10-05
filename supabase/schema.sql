-- خد وهات / Khod We Hat
-- Supabase Postgres schema for the full skill-exchange, moderation and monetization platform.
-- Run this file in Supabase SQL Editor or use supabase/schema.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================
-- Core identity / permissions
-- =============================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(40) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','FINANCE_MANAGER','ADS_MANAGER')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','banned')),
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  country VARCHAR(80) DEFAULT '',
  city VARCHAR(80) DEFAULT '',
  location VARCHAR(160) DEFAULT '',
  language VARCHAR(80) DEFAULT 'العربية',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  availability VARCHAR(80) DEFAULT 'Available now',
  preferred_exchange_type VARCHAR(20) DEFAULT 'swap' CHECK(preferred_exchange_type IN ('swap','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) UNIQUE NOT NULL,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,role_id)
);

INSERT INTO public.roles(name,description) VALUES
 ('USER','Standard member'),('SUPER_ADMIN','Full platform control'),('ADMIN','Daily administration and full moderation'),
 ('MODERATOR','Users, reports, reviews and content'),('SUPPORT','User support and tickets'),
 ('FINANCE_MANAGER','Payments, transactions, revenue and payouts'),('ADS_MANAGER','Advertisers, campaigns and advertisements')
ON CONFLICT(name) DO NOTHING;

-- =============================
-- Skill system
-- =============================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) UNIQUE NOT NULL, icon VARCHAR(80) DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL, name VARCHAR(100) UNIQUE NOT NULL, description TEXT DEFAULT '', is_hidden BOOLEAN NOT NULL DEFAULT false, is_featured BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK(type IN ('offer','need')), level VARCHAR(30) NOT NULL DEFAULT 'Beginner' CHECK(level IN ('Beginner','Intermediate','Advanced','Expert')),
  experience_years NUMERIC(4,1) DEFAULT 0, priority INT NOT NULL DEFAULT 0, description TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,skill_id,type)
);
CREATE TABLE IF NOT EXISTS public.skill_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE, alias VARCHAR(100) UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================
-- Exchange / matching lifecycle
-- =============================
CREATE TABLE IF NOT EXISTS public.exchange_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_id UUID NOT NULL REFERENCES public.users(id), receiver_id UUID NOT NULL REFERENCES public.users(id),
  offered_skill_id UUID NOT NULL REFERENCES public.skills(id), requested_skill_id UUID NOT NULL REFERENCES public.skills(id), message TEXT DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID REFERENCES public.exchange_requests(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES public.users(id), receiver_id UUID NOT NULL REFERENCES public.users(id),
  offered_skill_id UUID NOT NULL REFERENCES public.skills(id), requested_skill_id UUID NOT NULL REFERENCES public.skills(id), deal_type VARCHAR(10) NOT NULL CHECK(deal_type IN ('swap','paid')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','scheduled','in_progress','completed','disputed','cancelled','rejected')),
  message TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), accepted_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
  completion_requested_by UUID REFERENCES public.users(id), completion_confirmed_by UUID REFERENCES public.users(id)
);
CREATE TABLE IF NOT EXISTS public.exchange_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, role VARCHAR(30) NOT NULL, UNIQUE(exchange_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.exchange_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL, event_type VARCHAR(60) NOT NULL, note TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================
-- Sessions / availability
-- =============================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, teacher_id UUID NOT NULL REFERENCES public.users(id), learner_id UUID NOT NULL REFERENCES public.users(id),
  scheduled_at TIMESTAMPTZ NOT NULL, duration INT NOT NULL DEFAULT 60, status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','completed','cancelled','no_show')),
  notes TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.availabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, day_of_week SMALLINT NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), start_time TIME NOT NULL, end_time TIME NOT NULL, timezone VARCHAR(80) DEFAULT 'Africa/Cairo', UNIQUE(user_id,day_of_week,start_time,end_time)
);

-- =============================
-- Chat / social
-- =============================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID UNIQUE NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.conversation_users (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL, sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, attachment_url TEXT DEFAULT '', attachment_type VARCHAR(80) DEFAULT '', sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), read_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.favorites (user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, favorite_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,favorite_user_id));
CREATE TABLE IF NOT EXISTS public.follows (follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, following_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(follower_id,following_id));
CREATE TABLE IF NOT EXISTS public.blocked_users (blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id,blocked_id));

-- =============================
-- Reviews / notifications / moderation
-- =============================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE, reviewer_id UUID NOT NULL REFERENCES public.users(id), reviewee_id UUID NOT NULL REFERENCES public.users(id),
  rating INT NOT NULL CHECK(rating BETWEEN 1 AND 5), communication_rating INT CHECK(communication_rating BETWEEN 1 AND 5), knowledge_rating INT CHECK(knowledge_rating BETWEEN 1 AND 5), commitment_rating INT CHECK(commitment_rating BETWEEN 1 AND 5), comment TEXT DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'active', moderated_by UUID REFERENCES public.users(id), moderated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(exchange_id,reviewer_id,reviewee_id)
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, type VARCHAR(60) NOT NULL, title VARCHAR(180) NOT NULL, body TEXT NOT NULL, reference_type VARCHAR(80), reference_id UUID, is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id UUID NOT NULL REFERENCES public.users(id), target_type VARCHAR(30) NOT NULL DEFAULT 'user' CHECK(target_type IN ('user','skill','message','review','advertisement')),
  target_id UUID, reported_user_id UUID REFERENCES public.users(id), exchange_id UUID REFERENCES public.exchanges(id), reason VARCHAR(120) NOT NULL, description TEXT DEFAULT '', evidence TEXT DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','dismissed')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_id UUID NOT NULL REFERENCES public.users(id), target_user_id UUID REFERENCES public.users(id), report_id UUID REFERENCES public.reports(id), action VARCHAR(120) NOT NULL, note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================
-- Jobs / business content
-- =============================
CREATE TABLE IF NOT EXISTS public.job_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, title VARCHAR(180) NOT NULL, description TEXT NOT NULL,
  company VARCHAR(180) DEFAULT '', location VARCHAR(180) DEFAULT '', job_type VARCHAR(20) NOT NULL DEFAULT 'remote' CHECK(job_type IN ('remote','hybrid','on_site')), required_skills VARCHAR(1200) DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','closed','suspended')),
  moderated_by UUID REFERENCES public.users(id), moderated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================
-- Monetization / advertising / business
-- =============================
CREATE TABLE IF NOT EXISTS public.advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_name VARCHAR(180) NOT NULL, logo TEXT DEFAULT '', description TEXT DEFAULT '', contact_email VARCHAR(255), phone VARCHAR(50), status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advertisement_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), advertiser_id UUID REFERENCES public.advertisers(id) ON DELETE CASCADE, name VARCHAR(180) NOT NULL, budget NUMERIC(12,2) DEFAULT 0, start_date DATE, end_date DATE, status VARCHAR(20) NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id UUID REFERENCES public.advertisement_campaigns(id) ON DELETE SET NULL, title VARCHAR(180) NOT NULL, description TEXT DEFAULT '', image_url TEXT DEFAULT '', target_url TEXT DEFAULT '', advertiser_name VARCHAR(160) NOT NULL,
  placement VARCHAR(40) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'disabled', priority INT NOT NULL DEFAULT 0, start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ad_impressions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), advertisement_id UUID NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE, user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, session_identifier VARCHAR(160), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.ad_clicks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), advertisement_id UUID NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE, user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, session_identifier VARCHAR(160), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(80) UNIQUE NOT NULL, price NUMERIC(12,2) NOT NULL DEFAULT 0, billing_period VARCHAR(30) NOT NULL DEFAULT 'monthly', features JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, plan_id UUID NOT NULL REFERENCES public.subscription_plans(id), start_date TIMESTAMPTZ NOT NULL DEFAULT now(), end_date TIMESTAMPTZ, status VARCHAR(20) NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS public.featured_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_skill_id UUID NOT NULL REFERENCES public.user_skills(id) ON DELETE CASCADE, start_date TIMESTAMPTZ NOT NULL, end_date TIMESTAMPTZ NOT NULL, price NUMERIC(12,2) NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, amount NUMERIC(12,2) NOT NULL, type VARCHAR(60) NOT NULL, payment_method VARCHAR(60) DEFAULT '', status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE, reference_type VARCHAR(80), reference_id UUID, amount NUMERIC(12,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, amount NUMERIC(12,2) NOT NULL DEFAULT 0, platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0, net_amount NUMERIC(12,2) NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(80) UNIQUE NOT NULL, discount_percent NUMERIC(5,2), discount_amount NUMERIC(12,2), applicable_to VARCHAR(80) DEFAULT 'all', expires_at TIMESTAMPTZ, status VARCHAR(20) NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE, user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, used_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(coupon_id,user_id)
);

-- =============================
-- Platform configuration / analytics support
-- =============================
CREATE TABLE IF NOT EXISTS public.platform_settings (key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO public.platform_settings(key,value) VALUES
 ('platform_name','"خد وهات"'::jsonb),('registration_enabled','true'::jsonb),('advertising_enabled','true'::jsonb),('maintenance_mode','false'::jsonb),('max_exchange_requests_day','20'::jsonb),('max_message_length','4000'::jsonb),('commission_percent','15'::jsonb),('currency','"EGP"'::jsonb),('default_language','"ar"'::jsonb)
ON CONFLICT(key) DO NOTHING;
UPDATE public.platform_settings SET value='"خد وهات"'::jsonb, updated_at=now() WHERE key='platform_name';

-- Seed plans safely; prices are placeholders and are meant to be edited by the admin.
INSERT INTO public.subscription_plans(name,price,billing_period,features) VALUES
 ('Free',0,'monthly','["Core skill exchange","Basic profile"]'::jsonb),
 ('Pro Monthly',99,'monthly','["Verified badge","Higher visibility","Advanced analytics"]'::jsonb),
 ('Pro Yearly',990,'yearly','["Verified badge","Higher visibility","Advanced analytics","Priority matching"]'::jsonb)
ON CONFLICT(name) DO NOTHING;

-- =============================
-- Compatibility upgrades
-- =============================
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS communication_rating INT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS knowledge_rating INT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS commitment_rating INT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username VARCHAR(40);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country VARCHAR(80);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city VARCHAR(80);

-- =============================
-- Indexes
-- =============================
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_type ON public.user_skills(skill_id,type);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_type ON public.user_skills(user_id,type);
CREATE INDEX IF NOT EXISTS idx_exchanges_receiver_status ON public.exchanges(receiver_id,status);
CREATE INDEX IF NOT EXISTS idx_exchanges_sender_status ON public.exchanges(sender_id,status);
CREATE INDEX IF NOT EXISTS idx_exchange_events_exchange_created ON public.exchange_events(exchange_id,created_at);
CREATE INDEX IF NOT EXISTS idx_messages_exchange_sent ON public.messages(exchange_id,sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id,is_read,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_status_created ON public.users(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON public.job_posts(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_active_window ON public.advertisements(status,start_at,end_at,priority DESC);

-- =============================
-- RLS baseline
-- =============================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- The application backend uses the privileged database connection after server-side authorization.
-- Keep direct browser table access closed by default; add narrowly-scoped policies only if a future
-- version intentionally exposes tables directly to the frontend through supabase-js.


-- ============================================================================
-- v2 — Connections (friend-request style), direct chat, richer profiles,
--      account moderation, company ads, storage, and full RLS lockdown
-- Safe to re-run (idempotent).
-- ============================================================================

-- ───────── Profiles ─────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS headline VARCHAR(140) DEFAULT '';

-- ───────── Account moderation (suspend / close / ban) ─────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_reason TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_until TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_status_check CHECK (status IN ('active','suspended','banned','closed'));

-- ───────── Reports: allow exchange reports + resolution trail ─────────
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('user','skill','message','review','advertisement','exchange'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS admin_note TEXT DEFAULT '';
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ───────── Connections (طلب تواصل) ─────────
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  message VARCHAR(500) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_pair ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON public.connections(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id, status);

-- ───────── Direct chat (only between accepted connections) ─────────
CREATE TABLE IF NOT EXISTS public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dm_connection_sent ON public.dm_messages(connection_id, sent_at DESC);

-- Voice messages: audio lives in the PRIVATE 'voice' bucket and is only ever served through short-lived signed URLs.
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'text';
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS audio_path TEXT;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS audio_seconds INT;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS audio_mime VARCHAR(40);
ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_body_check;
ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_content_check;
ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_content_check CHECK (
  (kind = 'text'  AND length(body) BETWEEN 1 AND 4000 AND audio_path IS NULL) OR
  (kind = 'voice' AND audio_path IS NOT NULL AND audio_seconds BETWEEN 1 AND 120)
);

-- Used by the Realtime RLS policy (SECURITY DEFINER so it can read connections/users).
CREATE OR REPLACE FUNCTION public.can_read_connection(conn UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connections c
    JOIN public.users u ON u.id = auth.uid() AND u.status = 'active'
    WHERE c.id = conn AND c.status = 'accepted' AND auth.uid() IN (c.requester_id, c.addressee_id)
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_connection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_connection(UUID) TO authenticated;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dm_select_participants ON public.dm_messages;
CREATE POLICY dm_select_participants ON public.dm_messages FOR SELECT TO authenticated USING (public.can_read_connection(connection_id));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- ───────── Company ads ─────────
ALTER TABLE public.advertisements ADD COLUMN IF NOT EXISTS cta_label VARCHAR(60) DEFAULT 'اعرف أكثر';
ALTER TABLE public.advertisements ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
ALTER TABLE public.advertisements ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ad_impr_ad ON public.ad_impressions(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON public.ad_clicks(advertisement_id);

-- ───────── Settings ─────────
INSERT INTO public.platform_settings(key,value) VALUES
 ('max_connection_requests_day','30'::jsonb),
 ('assistant_enabled','true'::jsonb)
ON CONFLICT(key) DO NOTHING;

-- ───────── Storage buckets (uploads go through the server with the service role) ─────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
 ('avatars','avatars',true,1048576,ARRAY['image/jpeg','image/png','image/webp']),
 ('ads','ads',true,2097152,ARRAY['image/jpeg','image/png','image/webp']),
 ('voice','voice',false,2097152,ARRAY['audio/webm','audio/ogg','audio/mp4']),
 ('team','team',true,1048576,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- "About the project" page content (single row, editable from the admin panel; defaults live in the API code).
CREATE TABLE IF NOT EXISTS public.project_about (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- ───────── SECURITY: lock down EVERY table in public ─────────
-- The browser holds the public anon key. Without RLS, any table without a policy would be readable
-- and writable straight through the Supabase REST API. All real access goes through the server API.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- v3 — Khod & Hat Exchange Engine: universal offers/needs
-- Adds a generic exchange layer for skills, services, products, time, knowledge.
-- Safe to re-run (idempotent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exchange_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode VARCHAR(8) NOT NULL CHECK(mode IN ('offer','need')),
  asset_type VARCHAR(16) NOT NULL CHECK(asset_type IN ('skill','service','product','time','knowledge','other')),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  city VARCHAR(100) DEFAULT '',
  delivery_mode VARCHAR(14) NOT NULL DEFAULT 'both' CHECK(delivery_mode IN ('online','in_person','both')),
  condition_note VARCHAR(500) DEFAULT '',
  estimated_value NUMERIC(12,2),
  status VARCHAR(14) NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','paused','closed','removed')),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exchange_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.exchange_listings(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offered_listing_id UUID REFERENCES public.exchange_listings(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  status VARCHAR(14) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled','completed','disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(listing_id, proposer_id)
);

CREATE TABLE IF NOT EXISTS public.exchange_proposal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.exchange_proposals(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_listings_feed ON public.exchange_listings(status, mode, asset_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_owner ON public.exchange_listings(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_category ON public.exchange_listings(category_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_skill ON public.exchange_listings(skill_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_proposals_listing ON public.exchange_proposals(listing_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_proposals_proposer ON public.exchange_proposals(proposer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_proposal_events_proposal ON public.exchange_proposal_events(proposal_id, created_at DESC);

ALTER TABLE public.exchange_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_proposal_events ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings(key,value) VALUES
 ('exchange_engine_enabled','true'::jsonb),
 ('skills_exchange_enabled','true'::jsonb),
 ('services_exchange_enabled','true'::jsonb),
 ('products_exchange_enabled','true'::jsonb),
 ('time_exchange_enabled','true'::jsonb),
 ('knowledge_exchange_enabled','true'::jsonb),
 ('paid_deals_enabled','true'::jsonb),
 ('verification_enabled','true'::jsonb),
 ('connections_enabled','true'::jsonb),
 ('chat_enabled','true'::jsonb),
 ('exchanges_enabled','true'::jsonb),
 ('reviews_enabled','true'::jsonb),
 ('jobs_enabled','true'::jsonb)
ON CONFLICT(key) DO NOTHING;
