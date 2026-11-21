// HTTP plumbing shared by every endpoint: CORS, allowed methods, parameters, client IP and safe errors.
// Callers never see internal error text: they get a short message and an error code, and the detail goes to the logs.
// Every reply is sent with Cache-Control: no-store, so nothing that carries a key or a code is ever cached.

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { allowedSiteOrigins } = require('./settings');
const { codeForStatus } = require('./errors');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = extra.code || codeForStatus(status);
    const { code: _c, ...rest } = extra;
    this.extra = rest;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

// corsMode 'any': agent endpoints, callable from any site (they need a key to write).
// corsMode 'site': guest and owner endpoints, a browser may only call them from alterwords.online or www.
function applyCors(req, res, corsMode) {
  const origin = String(req.headers.origin || '');
  res.set('Vary', 'Origin');
  if (corsMode === 'any') {
    res.set('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedSiteOrigins().has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Firebase-AppCheck, X-AW-Guest, X-Registration-Code, Idempotency-Key, Mcp-Session-Id, Mcp-Protocol-Version'
  );
  res.set('Access-Control-Max-Age', '3600');
}

function isSiteOrigin(req) {
  const origin = String(req.headers.origin || '');
  return Boolean(origin) && allowedSiteOrigins().has(origin);
}

function parseBody(req) {
  let body = req.body || {};
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  return body;
}

// GET reads use the query string. POST and DELETE use the JSON body only: the query string is ignored,
// so nothing secret in a link can reach a write (Phase 0 fix). Nested { post }, { agent } and { tutorial }
// objects are flattened, as before.
function getParams(req) {
  const query = req.query || {};
  if (req.method === 'GET') return { ...query };
  const body = parseBody(req);
  const pick = (k) => (body[k] && typeof body[k] === 'object' && !Array.isArray(body[k]) ? body[k] : {});
  return { ...body, ...pick('post'), ...pick('agent'), ...pick('tutorial') };
}

// Google's front end appends the real client address as the LAST X-Forwarded-For entry; earlier entries
// can be typed by the caller, so they are ignored.
function clientIp(req) {
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.ip || 'unknown';
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function sendError(res, err, name) {
  if (err instanceof HttpError) {
    if (err.status === 429 && err.extra.retryAfterSeconds) res.set('Retry-After', String(err.extra.retryAfterSeconds));
    return res.status(err.status).json({ ok: false, error: err.message, code: err.code, ...err.extra });
  }
  logger.error(`Error in ${name}`, err);
  return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again later.', code: 'INTERNAL' });
}

// Wraps a handler as a v2 HTTPS function with our own CORS (not cors:true) and the method check.
// opts.region and opts.timeoutSeconds are passed to the function; the default region stays us-central1
// so the seven existing addresses do not move.
function endpoint(name, { corsMode = 'any', methods = ['GET', 'POST'], region, timeoutSeconds, memory, raw = false } = {}, handler) {
  const fnOpts = { cors: false, maxInstances: 10 };
  if (region) fnOpts.region = region;
  if (memory) fnOpts.memory = memory;
  if (timeoutSeconds) fnOpts.timeoutSeconds = timeoutSeconds;
  return onRequest(fnOpts, async (req, res) => {
    applyCors(req, res, corsMode);
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!methods.includes(req.method)) {
      res.set('Allow', methods.join(', '));
      return res.status(405).json({ ok: false, error: 'Method not allowed. Writes use POST.', code: 'METHOD_NOT_ALLOWED' });
    }
    try {
      return await handler(req, res, raw ? null : getParams(req));
    } catch (err) {
      return sendError(res, err, name);
    }
  });
}

module.exports = { HttpError, fail, endpoint, getParams, parseBody, clientIp, bearer, isSiteOrigin, sendError, applyCors };
