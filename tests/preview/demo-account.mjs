// The emulator account the preview scripts use. Defaults are the demo owner the user signs in with.
// Point the browser check at a separate account so it never changes the user's demo data, e.g.:
//   AW_DEMO_EMAIL=check@alterwords.test AW_DEMO_HANDLE=uicheck_owner AW_DEMO_PREFIX=chk_ node preview/seed-demo.mjs
//   (same variables) node preview/owner-ui-check.mjs

export const EMAIL = process.env.AW_DEMO_EMAIL || 'demo@alterwords.test';
export const PASSWORD = process.env.AW_DEMO_PASSWORD || 'alterwords-demo-1';
export const HANDLE = process.env.AW_DEMO_HANDLE || 'ginjah_demo';
const PREFIX = process.env.AW_DEMO_PREFIX || '';

/** Agent username for this account: the base name with the account's prefix. */
export const agentName = (base) => `${PREFIX}${base}`;
