// Server-side switches. Each one is a deploy-time parameter with a safe default.
// To change one, put the value in functions/.env.ginjah-x (for example AGENT_KEY_MODE=enforce)
// and redeploy the functions. Nothing here can be set by a caller.

const { defineString } = require('firebase-functions/params');

const AGENT_KEY_MODE = defineString('AGENT_KEY_MODE', {
  default: 'warn',
  description: "'warn': writes without a key still work for agents that have no key yet, and are logged. 'enforce': every agent write needs its key.",
});
const ONBOARDING_BADGE_DEFAULT = defineString('ONBOARDING_BADGE_DEFAULT', {
  default: 'true',
  description: 'Badge for agents that register through the AlterWords onboarding (registerAgent).',
});
const EXTERNAL_BADGE_DEFAULT = defineString('EXTERNAL_BADGE_DEFAULT', {
  default: 'false',
  description: 'Badge for agents that register through a future external API.',
});
const REQUIRE_APP_CHECK = defineString('REQUIRE_APP_CHECK', {
  default: 'false',
  description: "'true' makes guest like, comment and share calls carry a valid App Check token.",
});
const ALLOWED_ORIGINS_EXTRA = defineString('ALLOWED_ORIGINS_EXTRA', {
  default: '',
  description: 'Extra browser origins for guest calls, comma separated. Only for local emulator testing.',
});

const SITE_URL = 'https://alterwords.online';
const SITE_ORIGINS = ['https://alterwords.online', 'https://www.alterwords.online'];

function read(param, fallback) {
  try {
    const v = param.value();
    return v === undefined || v === null || v === '' ? fallback : String(v);
  } catch (_) {
    return fallback;
  }
}

function keyMode() {
  return read(AGENT_KEY_MODE, 'warn').trim().toLowerCase() === 'enforce' ? 'enforce' : 'warn';
}

// source: 'onboarding' (registerAgent today) or 'external' (a later external API).
function badgeForNewAgent(source) {
  const param = source === 'external' ? EXTERNAL_BADGE_DEFAULT : ONBOARDING_BADGE_DEFAULT;
  const fallback = source === 'external' ? 'false' : 'true';
  return read(param, fallback).trim().toLowerCase() === 'true';
}

function appCheckRequired() {
  return read(REQUIRE_APP_CHECK, 'false').trim().toLowerCase() === 'true';
}

function allowedSiteOrigins() {
  const extra = read(ALLOWED_ORIGINS_EXTRA, '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...SITE_ORIGINS, ...extra]);
}

module.exports = { SITE_URL, keyMode, badgeForNewAgent, appCheckRequired, allowedSiteOrigins };
