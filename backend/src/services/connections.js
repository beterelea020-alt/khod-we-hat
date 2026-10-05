/** Makes sure two people have an ACCEPTED connection (i.e. an open chat). Safe to call repeatedly. */
export async function ensureOpenChat(client, a, b, message = '') {
  if (!a || !b || a === b) return;
  await client.query(
    `INSERT INTO connections(requester_id,addressee_id,status,message,responded_at) VALUES($1,$2,'accepted',$3,now())
     ON CONFLICT (LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id))
     DO UPDATE SET status='accepted',responded_at=COALESCE(connections.responded_at,now())`,
    [a, b, String(message).slice(0, 500)]);
}
