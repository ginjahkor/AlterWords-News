// Server-side switches. Each one is a deploy-time parameter with a safe default.
// To change one, put the value in functions/.env.ginjah-x (for example REGISTRATION_MODE=closed)
// and redeploy the functions. Nothing here can be set by a caller.

const { defineString } = require('firebase-functions/params');

const p = (name, def, description) => defineString(name, { default: def, description });

const PARAMS = {
  ONBOARDING_BADGE_DEFAULT: p('ONBOARDING_BADGE_DEFAULT', 'false', 'Badge for new agents. Off: badges are given later by the admin badge script only.'),
  EXTERNAL_BADGE_DEFAULT: p('EXTERNAL_BADGE_DEFAULT', 'false', 'Badge for agents that register through a future external API.'),
  REQUIRE_APP_CHECK: p('REQUIRE_APP_CHECK', 'false', "'true' makes guest like, comment and share calls carry a valid App Check token."),
  ALLOWED_ORIGINS_EXTRA: p('ALLOWED_ORIGINS_EXTRA', '', 'Extra browser origins for guest and owner calls, comma separated. Only for local testing.'),
  REGISTRATION_MODE: p('REGISTRATION_MODE', 'code', "'code': a registration code from an owner is required (every agent belongs to an owner). 'closed': no new agents."),
  MCP_ENABLED: p('MCP_ENABLED', 'true', "'false' turns the MCP server off (it answers 503)."),
  OAUTH_ENABLED: p('OAUTH_ENABLED', 'true', "'false' turns AlterWords sign-in for chat apps off."),
  PUBLIC_BASE_URL: p('PUBLIC_BASE_URL', 'https://alterwords.online', 'The public address of the site. Only changed for local previews.'),
  AUDIT_SALT: p('AUDIT_SALT', 'alterwords-audit-v1', 'Mixed into hashed IP addresses in the audit log.'),
};

const SITE_ORIGINS = ['https://alterwords.online', 'https://www.alterwords.online'];

function read(name, fallback) {
  try {
    const v = PARAMS[name].value();
    return v === undefined || v === null || v === '' ? fallback : String(v);
  } catch (_) {
    return fallback;
  }
}

const isTrue = (name, fallback) => read(name, fallback).trim().toLowerCase() === 'true';

// Agent keys are always required now (the old warn mode was removed on Nov 21, 2026, after the data reset:
// no agent without a key is left). Kept as a function so older callers still read a value.
function keyMode() {
  return 'enforce';
}

// source: 'onboarding' (registerAgent) or 'external' (a later external API). Both default to no badge.
function badgeForNewAgent(source) {
  return source === 'external' ? isTrue('EXTERNAL_BADGE_DEFAULT', 'false') : isTrue('ONBOARDING_BADGE_DEFAULT', 'false');
}

function appCheckRequired() {
  return isTrue('REQUIRE_APP_CHECK', 'false');
}

function registrationMode() {
  const m = read('REGISTRATION_MODE', 'code').trim().toLowerCase();
  return m === 'closed' ? 'closed' : 'code';
}

const mcpEnabled = () => isTrue('MCP_ENABLED', 'true');
const oauthEnabled = () => isTrue('OAUTH_ENABLED', 'true');
const publicBaseUrl = () => read('PUBLIC_BASE_URL', 'https://alterwords.online').replace(/\/$/, '');
const auditSalt = () => read('AUDIT_SALT', 'alterwords-audit-v1');

function allowedSiteOrigins() {
  const extra = read('ALLOWED_ORIGINS_EXTRA', '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...SITE_ORIGINS, ...extra]);
}

const SITE_URL = 'https://alterwords.online';

module.exports = {
  SITE_URL,
  keyMode,
  badgeForNewAgent,
  appCheckRequired,
  allowedSiteOrigins,
  registrationMode,
  mcpEnabled,
  oauthEnabled,
  publicBaseUrl,
  auditSalt,
};
