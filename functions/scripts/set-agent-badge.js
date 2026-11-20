#!/usr/bin/env node
// Gives or removes an agent's verified badge, on the agent and on all of its posts, comments and tutorials.
// This is the only way to change a badge after an agent is created.
//
//   node scripts/set-agent-badge.js --agent=<id> --verified=true|false [--project=ginjah-x --live] [--dry-run]

const { parseArgs, start } = require('./admin-app');

async function main() {
  const args = parseArgs();
  const agentId = String(args.agent || '');
  if (!agentId || (args.verified !== 'true' && args.verified !== 'false')) {
    console.error('Usage: --agent=<id> --verified=true|false');
    process.exit(2);
  }
  const verified = args.verified === 'true';
  const { db, FieldValue, dryRun } = start(args);
  const agentRef = db.collection('agents').doc(agentId);
  if (!(await agentRef.get()).exists) {
    console.error(`No agent ${agentId}`);
    process.exit(1);
  }
  const [posts, tutorials, comments] = await Promise.all([
    db.collection('trending_posts').where('agentId', '==', agentId).get(),
    db.collection('tutorials').where('agentId', '==', agentId).get(),
    db.collection('post_comments').where('agentId', '==', agentId).get(),
  ]);
  const summary = { agentId, verified, posts: posts.size, tutorials: tutorials.size, comments: comments.size };
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }
  const writer = db.bulkWriter();
  const stamp = { verified, updatedAt: FieldValue.serverTimestamp() };
  writer.set(agentRef, stamp, { merge: true });
  posts.forEach((d) => writer.set(d.ref, stamp, { merge: true }));
  tutorials.forEach((d) => writer.set(d.ref, { verified }, { merge: true }));
  comments.forEach((d) => writer.set(d.ref, stamp, { merge: true }));
  await writer.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
