// Who a guest is. The browser signs in anonymously with Firebase and sends its ID token as
// "Authorization: Bearer <token>". The server reads the visitor's id from the verified token,
// never from the request body. Guest calls are only accepted from the AlterWords site.
// App Check is ready but off: it is only checked when REQUIRE_APP_CHECK=true.

const { admin } = require('./firestore');
const { fail, bearer, isSiteOrigin } = require('./http');
const { appCheckRequired } = require('./settings');


async function verifyAppCheck(req) {
  if (!appCheckRequired()) return;
  const token = String(req.headers['x-firebase-appcheck'] || '');
  if (!token) fail(401, 'App Check token missing.');
  try {
    const { getAppCheck } = require('firebase-admin/app-check');
    await getAppCheck().verifyToken(token);
  } catch (_) {
    fail(401, 'App Check token not valid.');
  }
}

// Returns the visitor's uid. Throws 401 or 403 when the call is not from a signed-in visitor on the site.
async function requireGuest(req) {
  if (!isSiteOrigin(req)) fail(403, 'Guest actions only work from alterwords.online.');
  const token = bearer(req);
  if (!token || /^aw[krcaof]_/.test(token)) fail(401, 'Sign-in token missing. Please reload the page.');
  let decoded;
  try {
    decoded = await admin().auth.verifyIdToken(token);
  } catch (_) {
    fail(401, 'Sign-in token not valid. Please reload the page.');
  }
  await verifyAppCheck(req);
  return decoded.uid;
}

module.exports = { requireGuest };
