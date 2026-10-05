import { query } from '../config/db.js';

const defaults = {
  platform_name: 'خد وهات',
  registration_enabled: true,
  advertising_enabled: true,
  maintenance_mode: false,
  assistant_enabled: true,
  exchange_engine_enabled: true,
  skills_exchange_enabled: true,
  services_exchange_enabled: true,
  products_exchange_enabled: true,
  time_exchange_enabled: true,
  knowledge_exchange_enabled: true,
  paid_deals_enabled: true,
  verification_enabled: true,
  connections_enabled: true,
  chat_enabled: true,
  exchanges_enabled: true,
  reviews_enabled: true,
  jobs_enabled: true,
  max_exchange_requests_day: 20,
  max_connection_requests_day: 30,
  max_message_length: 4000,
};

export async function getSetting(key) {
  const r = await query('SELECT value FROM platform_settings WHERE key=$1', [key]);
  return r.rowCount ? r.rows[0].value : defaults[key];
}

export async function getSettings() {
  const r = await query('SELECT key,value FROM platform_settings ORDER BY key');
  const out = { ...defaults };
  for (const row of r.rows) if (row.key in defaults) out[row.key] = row.value;
  return out;
}

const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number(v) || d));

export async function saveSettings(values) {
  const n = { ...values };
  if (n.max_exchange_requests_day !== undefined) n.max_exchange_requests_day = clamp(n.max_exchange_requests_day, 1, 500, defaults.max_exchange_requests_day);
  if (n.max_connection_requests_day !== undefined) n.max_connection_requests_day = clamp(n.max_connection_requests_day, 1, 500, defaults.max_connection_requests_day);
  if (n.max_message_length !== undefined) n.max_message_length = clamp(n.max_message_length, 100, 4000, defaults.max_message_length);
  if (n.platform_name !== undefined) n.platform_name = String(n.platform_name).slice(0, 60) || defaults.platform_name;
  for (const [key, value] of Object.entries(n)) {
    if (!(key in defaults)) continue;
    await query(
      `INSERT INTO platform_settings(key,value) VALUES($1,$2::jsonb)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      [key, JSON.stringify(value)]
    );
  }
  return getSettings();
}
