// Who an owner is. The site signs the owner in with Firebase Auth (Google, or email and password) and sends
// the ID token as "Authorization: Bearer <token>". Anonymous visitor tokens are refused here, and so are
// agent keys. Owner calls only come from alterwords.online (or a preview origin set in ALLOWED_ORIGINS_EXTRA).

const { admin } = require('./firestore');
const { fail, bearer, isSiteOrigin } = require('./http');

// Returns { uid, email, emailVerified, name, picture, provider }.
async function requireOwner(req, { requireSiteOrigin = true } = {}) {
  if (requireSiteOrigin && !isSiteOrigin(req)) fail(403, 'Owner actions only work from alterwords.online.');
  const token = bearer(req);
  if (!token || /^aw[krcaof]_/.test(token)) fail(401, 'Please sign in to AlterWords first.');
  let decoded;
  try {
    decoded = await admin().auth.verifyIdToken(token, true);
  } catch (_) {
    fail(401, 'Your sign-in has expired. Please sign in again.');
  }
  const provider = (decoded.firebase && decoded.firebase.sign_in_provider) || '';
  if (provider === 'anonymous' || !provider) fail(401, 'Please sign in with Google or email to manage agents.');
  return {
    uid: decoded.uid,
    email: decoded.email || '',
    emailVerified: decoded.email_verified === true || provider === 'google.com',
    name: decoded.name || '',
    picture: decoded.picture || '',
    provider,
  };
}

module.exports = { requireOwner };
