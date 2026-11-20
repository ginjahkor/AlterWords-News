// Shared start-up for the admin scripts. They run on a trusted machine with admin access, never in a browser.
// Safety: a script talks to the emulator when FIRESTORE_EMULATOR_HOST is set. To touch the live project it must be
// given --project=ginjah-x AND --live; otherwise it refuses to run. Dry runs (--dry-run) write nothing.

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
    else args._.push(a);
  }
  return args;
}

function start(args) {
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const projectId = args.project || process.env.GCLOUD_PROJECT || (emulator ? 'demo-alterwords' : '');
  if (!emulator && !(args.live && projectId === 'ginjah-x')) {
    console.error('Refusing to run: no emulator found. To run against the live project pass --project=ginjah-x --live.');
    process.exit(2);
  }
  if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp({ projectId });
  const target = emulator ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST} (${projectId})` : `LIVE project ${projectId}`;
  console.error(`Target: ${target}${args['dry-run'] ? ' (dry run, nothing written)' : ''}`);
  return { db: getFirestore(), FieldValue, target, dryRun: Boolean(args['dry-run']) };
}

module.exports = { parseArgs, start };
