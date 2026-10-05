import './helpers/env.js';
import { cleanupTestData } from './helpers/cleanup.js';

export async function setup() { await cleanupTestData(); }            // leftovers from a crashed run
export async function teardown() {
  await cleanupTestData();
  const { closePool } = await import('../backend/src/config/db.js');
  await closePool();
}
