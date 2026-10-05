// Resolves the database the tests may touch — and refuses anything that is not local.
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.TEST_DB_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  throw new Error('Set TEST_DB_URL (or SUPABASE_DB_URL in .env) to your LOCAL Supabase database, e.g. postgresql://postgres:postgres@127.0.0.1:54322/postgres');
}
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  throw new Error(`Refusing to run tests against a non-local database (${host}). The tests create and delete data.`);
}
process.env.SUPABASE_DB_URL = url;
process.env.DB_SSL = 'false';
process.env.DB_POOL_MAX = '5';
process.env.NODE_ENV = 'test';
// The Supabase client is replaced by tests/helpers/fakeSupabase.js — these values are never contacted.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.CLIENT_URL = 'http://localhost:4000';
process.env.ANTHROPIC_API_KEY = '';
export const TEST_EMAIL_DOMAIN = '@kw-test.local';
export const TEST_SKILL_PREFIX = 'kwtest_';
