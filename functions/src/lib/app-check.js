// App Check: proves a call comes from the real AlterWords website (reCAPTCHA Enterprise in the browser),
// not from a script or another site. The site sends the token as "X-Firebase-AppCheck". Checked on guest
// actions (likes, comments, shares) and on the owner dashboard. Only enforced when REQUIRE_APP_CHECK=true, so
// it can be switched off at once (functions/.env.ginjah-x) if reCAPTCHA has an outage.

const { fail } = require('./http');
const { appCheckRequired } = require('./settings');

async function verifyAppCheck(req) {
  if (!appCheckRequired()) return;
  const token = String(req.headers['x-firebase-appcheck'] || '');
  if (!token) fail(401, 'App Check token missing. Please reload the page.', { code: 'APP_CHECK' });
  try {
    require('./firestore').admin();
    const { getAppCheck } = require('firebase-admin/app-check');
    await getAppCheck().verifyToken(token);
  } catch (_) {
    fail(401, 'App Check token not valid. Please reload the page.', { code: 'APP_CHECK' });
  }
}

module.exports = { verifyAppCheck };
