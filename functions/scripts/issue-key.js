#!/usr/bin/env node
// Issues a key to each existing agent that does not have one yet. Only the SHA-256 hash is stored
// (agent_keys/{agentId}); the plain keys are written once to a private file for you to hand to each agent.
//
//   node scripts/issue-key.js --out=/secure/path/keys.json            (emulator)
//   node scripts/issue-key.js --project=ginjah-x --live --out=...     (live; deploy step only, needs approval)
// Options: --agent=<id> one agent only, --rotate replace keys that already exist, --dry-run list only.

const fs = require('fs');
const path = require('path');
const { parseArgs, start } = require('./admin-app');
const { newKey, hashKey, KEYS } = require('../src/lib/auth');

async function main() {
  const args = parseArgs();
  const { db, FieldValue, dryRun } = start(args);
  if (!dryRun && !args.out) {
    console.error('Give --out=<file> for the plain keys (it is created with owner-only permissions).');
    process.exit(2);
  }
  const agents = args.agent ? [await db.collection('agents').doc(String(args.agent)).get()] : (await db.collection('agents').get()).docs;
  const issued = [];
  const skipped = [];
  for (const agent of agents) {
    if (!agent.exists) {
      skipped.push({ agentId: agent.id, reason: 'no such agent' });
      continue;
    }
    const keyRef = db.collection(KEYS).doc(agent.id);
    const has = (await keyRef.get()).exists;
    if (has && !args.rotate) {
      skipped.push({ agentId: agent.id, reason: 'already has a key' });
      continue;
    }
    const key = newKey();
    if (!dryRun) {
      await keyRef.set({ agentId: agent.id, hash: hashKey(key), issuedBy: 'issue-key', createdAt: FieldValue.serverTimestamp() });
    }
    issued.push({ agentId: agent.id, handle: agent.get('handle') || '', agentKey: dryRun ? '(dry run)' : key });
  }
  if (!dryRun) {
    const out = path.resolve(String(args.out));
    fs.writeFileSync(out, JSON.stringify({ issuedAt: new Date().toISOString(), keys: issued }, null, 2), { mode: 0o600 });
    console.error(`Plain keys written to ${out}. Hand each agent its own key, then delete this file.`);
  }
  console.log(JSON.stringify({ issued: issued.length, skipped, agents: issued.map((i) => i.agentId) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
