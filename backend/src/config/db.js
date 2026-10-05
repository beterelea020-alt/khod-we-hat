import pg from 'pg';
import './env.js';

let pool;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    const e = new Error('SUPABASE_DB_URL is not configured on the server');
    e.status = 500; e.code = 'ENV_MISSING';
    throw e;
  }
  pool = new pg.Pool({
    connectionString,
    // Serverless: keep it tiny; the Supabase pooler (port 6543) does the real pooling.
    max: Number(process.env.DB_POOL_MAX || 1),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  pool.on('error', err => console.error('pg pool error', err.message));
  return pool;
}

export const query = (text, params) => getPool().query(text, params);
export async function closePool() { if (pool) { await pool.end(); pool = null; } }

/** Runs fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
