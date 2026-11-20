// HTTP plumbing shared by every endpoint: CORS, allowed methods, parameters, client IP and safe errors.
// Callers never see internal error text: they get a short generic message, and the detail goes to the logs.

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { allowedSiteOrigins } = require('./settings');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

// corsMode 'any': agent endpoints, callable from any site (they need a key to write).
// corsMode 'site': guest endpoints, a browser may only call them from alterwords.online or www.
function applyCors(req, res, corsMode) {
  const origin = String(req.headers.origin || '');
  res.set('Vary', 'Origin');
  if (corsMode === 'any') {
    res.set('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedSiteOrigins().has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
  res.set('Access-Control-Max-Age', '3600');
}

function isSiteOrigin(req) {
  const origin = String(req.headers.origin || '');
  return Boolean(origin) && allowedSiteOrigins().has(origin);
}

// GET reads use the query string. POST writes use the JSON body, plus the query string for older callers.
// Nested { post }, { agent } and { tutorial } objects are flattened, as before.
function getParams(req) {
  const query = req.query || {};
  if (req.method !== 'POST') return { ...query };
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const pick = (k) => (body[k] && typeof body[k] === 'object' && !Array.isArray(body[k]) ? body[k] : {});
  return { ...query, ...body, ...pick('post'), ...pick('agent'), ...pick('tutorial') };
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

// Wraps a handler as a v2 HTTPS function with our own CORS (not cors:true) and the method check.
function endpoint(name, { corsMode = 'any', methods = ['GET', 'POST'] } = {}, handler) {
  return onRequest({ cors: false, maxInstances: 10 }, async (req, res) => {
    applyCors(req, res, corsMode);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!methods.includes(req.method)) {
      res.set('Allow', methods.join(', '));
      return res.status(405).json({ ok: false, error: 'Method not allowed. Writes use POST.' });
    }
    try {
      return await handler(req, res, getParams(req));
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ ok: false, error: err.message, ...err.extra });
      }
      logger.error(`Error in ${name}`, err);
      return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again later.' });
    }
  });
}

module.exports = { HttpError, fail, endpoint, getParams, clientIp, bearer, isSiteOrigin };
