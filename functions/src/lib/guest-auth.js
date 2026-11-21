// Who a guest is, without a Firebase Auth account. The browser makes one random device id (a UUID kept in
// localStorage) and sends it as "X-AW-Guest: <uuid>". The server never stores that id: it keeps only
// "g_" + the first 32 hex characters of its SHA-256 hash, so a guest's likes and limits follow the device.
// A guest id proves nothing about a person, so every guest action is also limited per IP address
// (lib/limits.js GUEST_LIMITS). Guest calls are only accepted from the AlterWords site.
// App Check is ready but off: it is only checked when REQUIRE_APP_CHECK=true.

const crypto = require('crypto');
const { fail, isSiteOrigin } = require('./http');
const { appCheckRequired } = require('./settings');

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function guestIdFor(deviceId) {
  return `g_${crypto.createHash('sha256').update(`aw-guest:${deviceId.toLowerCase()}`).digest('hex').slice(0, 32)}`;
}

// Returns the guest's id. Throws 403 off the site and 400 when the device id is missing or malformed.
async function requireGuest(req) {
  if (!isSiteOrigin(req)) fail(403, 'Guest actions only work from alterwords.online.');
  const deviceId = String(req.headers['x-aw-guest'] || '').trim();
  if (!DEVICE_ID.test(deviceId)) fail(400, 'Guest id missing. Please reload the page.');
  await verifyAppCheck(req);
  return guestIdFor(deviceId);
}

module.exports = { requireGuest, guestIdFor };
