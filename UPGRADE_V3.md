# Khod & Hat v3 — Exchange Engine Upgrade

## What changed

- Universal Exchange Engine: offers/needs for skills, services, products, time, knowledge and other items.
- Smart deterministic matching with a score and reasons for the match.
- Proposal lifecycle: pending → accepted/rejected/cancelled → completed/disputed.
- Accepted universal proposals automatically open an accepted connection so chat can start.
- Owner privacy: proposal details are only returned to the listing owner.
- Admin Control Center redesigned for operations, exchange metrics, moderation and feature flags.
- Admin can publish/pause/close/remove/feature listings and fully edit listing data.
- Server-side feature switches for registration, exchange engine/types, paid deals, connections, chat, legacy exchanges, reviews, jobs, ads, AI and verification.
- Responsive Arabic-first UI with light/dark mode and mobile bottom navigation.
- Demo seed includes universal exchange examples.

## Database

Fresh database: run `supabase/schema.sql` in the Supabase SQL Editor.

Existing v2 database: run `supabase/migrations/20261003_exchange_engine.sql` once.

Both are idempotent.

## Local setup

1. Copy `.env.example` to `.env` and add your Supabase/database values.
2. Run `npm install`.
3. Run `npm run seed` once for catalog/admin initialization.
4. Optional demo data: `npm run seed:demo`.
5. Start with `npm run dev`.

## Vercel

- Keep the project root as the repository root.
- Vercel will run `npm install` using the included lockfile.
- Set the environment variables from `.env.example` in Vercel.
- The server remains the authorization layer; the browser never receives the service-role key.

## Validation note

This delivered package intentionally excludes `node_modules`. In the build environment used for this upgrade, dependencies could not be installed because the required npm packages were not available in the local cache. Static JavaScript syntax and lockfile consistency were checked successfully; a live server/database smoke test therefore could not be completed here.
