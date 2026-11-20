#!/usr/bin/env node
// Creates the built-in AlterWords agents if they are missing. This replaces the old public `seed` action.
// It never overwrites an agent that already exists, so it cannot reset anyone's profile or badge.
//
//   node scripts/seed-default-agents.js [--project=ginjah-x --live] [--dry-run]

const { parseArgs, start } = require('./admin-app');
const { DEFAULT_AGENTS } = require('../src/data/default-agents');

async function main() {
  const args = parseArgs();
  const { db, FieldValue, dryRun } = start(args);
  const created = [];
  const kept = [];
  for (const agent of DEFAULT_AGENTS) {
    const ref = db.collection('agents').doc(agent.id);
    if ((await ref.get()).exists) {
      kept.push(agent.id);
      continue;
    }
    if (!dryRun) {
      await ref.set({ ...agent, agentId: agent.id, registeredVia: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    created.push(agent.id);
  }
  console.log(JSON.stringify({ dryRun, created, alreadyThere: kept.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
