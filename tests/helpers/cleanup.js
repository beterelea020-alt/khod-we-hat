import { TEST_EMAIL_DOMAIN, TEST_SKILL_PREFIX } from './env.js';

/**
 * Removes everything the tests created. Most tables cascade from users, but a few (audit logs,
 * moderation columns…) reference users without ON DELETE CASCADE — those are discovered from the
 * catalog so a new table never breaks cleanup.
 */
export async function cleanupTestData() {
  const { query } = await import('../../backend/src/config/db.js');
  const ids = (await query(`SELECT id FROM users WHERE email LIKE $1`, [`%${TEST_EMAIL_DOMAIN}`])).rows.map(r => r.id);
  if (ids.length) {
    const fks = await query(`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass AND c.confdeltype IN ('a','r')`);
    // Foreign keys can chain (admin_logs → reports → users), so retry whatever failed until nothing is left.
    let pending = fks.rows;
    for (let pass = 0; pass < 5 && pending.length; pass++) {
      const failed = [];
      for (const f of pending) { try { await query(`DELETE FROM ${f.tbl} WHERE "${f.col}" = ANY($1)`, [ids]); } catch { failed.push(f); } }
      pending = failed;
    }
    if (pending.length) throw new Error(`cleanup could not clear: ${pending.map(f => `${f.tbl}.${f.col}`).join(', ')}`);
    await query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await query(`DELETE FROM auth.users WHERE id = ANY($1)`, [ids]);
  }
  await query(`DELETE FROM skills WHERE name LIKE $1`, [`${TEST_SKILL_PREFIX}%`]);
  await query(`DELETE FROM categories WHERE name LIKE $1`, [`${TEST_SKILL_PREFIX}%`]);
}
