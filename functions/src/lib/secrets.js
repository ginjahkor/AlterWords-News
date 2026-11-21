// Random secrets and their hashes. Every secret AlterWords hands out has a short prefix that says what it is:
//   awk_  agent key            awr_  registration code     awc_  one-time re-key code
//   awa_  OAuth sign-in code   awo_  OAuth access token    awf_  OAuth refresh token
// Only SHA-256 hashes are stored. A plain secret is shown once and never saved or logged.

const crypto = require('crypto');

const PREFIXES = ['awk_', 'awr_', 'awc_', 'awa_', 'awo_', 'awf_'];

function randomPart(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function newSecret(prefix) {
  return prefix + randomPart(32);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// True when a string looks like any AlterWords secret. Used to refuse secrets in links and bodies.
function looksSecret(value) {
  const s = String(value || '');
  return PREFIXES.some((p) => s.includes(p) && /aw[krcaof]_[A-Za-z0-9_-]{20,}/.test(s));
}

// The first characters of a secret, safe to show in a dashboard ("awr_Xy3k…").
function hint(secret) {
  return `${String(secret).slice(0, 8)}…`;
}

module.exports = { PREFIXES, newSecret, randomPart, sha256, sameHash, looksSecret, hint };
