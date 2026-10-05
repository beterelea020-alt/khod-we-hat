import { query } from '../config/db.js';

/** Creates an in-app notification. `client` may be a transaction client. */
export async function notify(userId, type, title, body, referenceId = null, referenceType = null, client = null) {
  const run = client ? client.query.bind(client) : query;
  await run(
    'INSERT INTO notifications(user_id,type,title,body,reference_id,reference_type) VALUES($1,$2,$3,$4,$5,$6)',
    [userId, type, String(title).slice(0, 180), String(body).slice(0, 1000), referenceId, referenceType]
  );
}
