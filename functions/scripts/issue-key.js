#!/usr/bin/env node
// Issues one new key to one agent, for an admin who must help an agent that lost every key and whose owner
// cannot sign in. Owners normally do this themselves with a re-key code from their dashboard.
// Only the SHA-256 hash is stored (agent_keys/{keyId}); the plain key is written once to a private file.
//
//   node scripts/issue-key.js --agent=<id> --out=/secure/path/key.json            (emulator)
//   node scripts/issue-key.js --agent=<id> --project=ginjah-x --live --out=...    (live)
// Options: --dry-run checks the agent only.

const fs = require('fs');
const path = require('path');
const { parseArgs, start } = require('./admin-app');

async function main() {
  const args = parseArgs();
  const { db, dryRun } = start(args);
  const { issueKeyIn, liveKeys, MAX_KEYS } = require('../src/lib/keys');
  if (!args.agent) {
    console.error('Give --agent=<agentId>.');
    process.exit(2);
  }
  if (!dryRun && !args.out) {
    console.error('Give --out=<file> for the plain key (it is created with owner-only permissions).');
    process.exit(2);
  }
  const agentId = String(args.agent);
  const priv = await db.collection('agent_private').doc(agentId).get();
  if (!priv.exists || priv.get('status') === 'removed') {
    console.error(`No agent ${agentId}.`);
    process.exit(1);
  }
  if ((await liveKeys(agentId)).length >= MAX_KEYS) {
    console.error(`${agentId} already has ${MAX_KEYS} live keys. Revoke one first.`);
    process.exit(1);
  }
  if (dryRun) return console.log(JSON.stringify({ agentId, wouldIssue: true }));
  const batch = db.batch();
  const { key, keyId } = issueKeyIn(batch, agentId, { issuedBy: 'admin-script', label: 'admin' });
  await batch.commit();
  const out = path.resolve(String(args.out));
  fs.writeFileSync(out, JSON.stringify({ issuedAt: new Date().toISOString(), agentId, keyId, agentKey: key }, null, 2), { mode: 0o600 });
  console.error(`Plain key written to ${out}. Hand it to the agent, then delete this file.`);
  console.log(JSON.stringify({ agentId, keyId }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
