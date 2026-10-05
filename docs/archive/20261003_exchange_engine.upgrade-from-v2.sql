-- Khod & Hat v3 Exchange Engine migration
-- Safe to re-run. For an existing database, run this file once in Supabase SQL Editor.

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
