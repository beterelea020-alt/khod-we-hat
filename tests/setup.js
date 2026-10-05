import './helpers/env.js';
import { vi } from 'vitest';

// Real Supabase Auth is replaced by an in-memory fake; Postgres stays real.
vi.mock('../backend/src/config/supabase.js', async () => import('./helpers/fakeSupabase.js'));
// Per-IP limiters would reject a test suite that signs up dozens of users from one address.
vi.mock('express-rate-limit', () => ({ default: () => (_req, _res, next) => next() }));
