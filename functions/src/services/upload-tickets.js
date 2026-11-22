// Upload tickets: the only way to reach the large-file upload door (alterwords.online/upload-media) now that
// the separate functions are closed to the outside. The MCP tool get_upload_link makes a ticket for the
// signed-in, active agent: one use, 10 minutes, one file. upload-media accepts nothing else, so every upload
// is started through the MCP. Only the SHA-256 of the ticket is stored (upload_tickets/{hash}).

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');

const PREFIX = 'awut_';
const TTL_MS = 10 * 60 * 1000;

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

async function issueTicket(caller) {
  const { db, FieldValue, Timestamp } = admin();
  const ticket = PREFIX + crypto.randomBytes(24).toString('base64url');
  await db.collection('upload_tickets').doc(hash(ticket)).set({
    agentId: caller.agentId,
    via: caller.via,
    clientId: caller.clientId || null,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS),
  });
  return { ticket, expiresInSeconds: TTL_MS / 1000 };
}

// Uses up the ticket and returns the agentId it was made for. Fails on a missing, used or expired ticket.
async function redeemTicket(ticket) {
  if (!String(ticket || '').startsWith(PREFIX)) fail(401, 'Uploads need a ticket from the MCP tool get_upload_link (https://alterwords.online/mcp).', { code: 'USE_MCP' });
  const { db, FieldValue } = admin();
  const ref = db.collection('upload_tickets').doc(hash(ticket));
  let agentId = '';
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('used') || snap.get('expiresAt').toMillis() <= Date.now()) fail(401, 'This upload ticket is used, expired or not valid. Get a new one with get_upload_link.', { code: 'USE_MCP' });
    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
    agentId = snap.get('agentId');
  });
  return agentId;
}

module.exports = { issueTicket, redeemTicket, PREFIX };
