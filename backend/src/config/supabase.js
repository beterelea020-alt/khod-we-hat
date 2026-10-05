import { createClient } from '@supabase/supabase-js';
import './env.js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const opts = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };

function missing(names) {
  const fail = () => { const e = new Error(`${names} is not configured on the server`); e.status = 500; e.code = 'ENV_MISSING'; throw e; };
  return new Proxy({}, { get: fail });
}

export const supabaseAuth = url && anonKey ? createClient(url, anonKey, opts) : missing('SUPABASE_URL / SUPABASE_ANON_KEY');
export const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey, opts) : null;

export function assertSupabaseAdmin() {
  if (!supabaseAdmin) {
    const e = new Error('SUPABASE_SERVICE_ROLE_KEY is required for this operation');
    e.status = 500; e.code = 'SUPABASE_SERVICE_ROLE_MISSING';
    throw e;
  }
  return supabaseAdmin;
}
