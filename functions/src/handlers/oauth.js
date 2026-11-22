// oauth: AlterWords' own OAuth server for chat apps, one function in africa-south1, routed by path.
// alterwords.online rewrites /oauth/* and the two /.well-known documents here.
//   GET  /.well-known/oauth-authorization-server   discovery
//   GET  /.well-known/oauth-protected-resource      which server protects /mcp
//   POST /register        an app registers itself (dynamic client registration)
//   GET  /authorize       starts sign-in, sends the browser to the consent page
//   POST /request-info    the consent page asks what is being asked (owner signed in)
//   POST /decision        the owner approves or denies (owner signed in)
//   POST /token           code or refresh token for tokens
//   POST /revoke          revoke a token

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { applyCors, parseBody, clientIp, HttpError, sendError } = require('../lib/http');
const { requireOwner } = require('../lib/owner-auth');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { oauthEnabled } = require('../lib/settings');
const { audit } = require('../lib/audit');
const { OAuthError, registerClient, authenticateClient, oauthFail } = require('../oauth/clients');
const { authServerMetadata, protectedResourceMetadata } = require('../oauth/metadata');
const { startAuthorize, requestInfo, decide, exchangeCode } = require('../oauth/authorize');
const { refresh, revokeToken } = require('../oauth/tokens');

function formBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (String(req.headers['content-type'] || '').includes('json')) return parseBody(req);
  return Object.fromEntries(new URLSearchParams(raw));
}

function route(req) {
  return String(req.path || req.url || '/')
    .split('?')[0]
    .replace(/^\/oauth(?=\/)/, '')
    .replace(/\/+$/, '') || '/';
}

function errorPage(res, description) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  const safe = String(description).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return res.status(400).send(`<!doctype html><meta charset="utf-8"><title>AlterWords sign-in</title><body style="font-family:system-ui;padding:2rem"><h1>AlterWords</h1><p>${safe}</p></body>`);
}

async function handle(req, res) {
  const path = route(req);
  if (path.endsWith('/.well-known/oauth-authorization-server')) return res.status(200).json(authServerMetadata());
  if (path.startsWith('/.well-known/oauth-protected-resource')) return res.status(200).json(protectedResourceMetadata());
  if (!oauthEnabled()) oauthFail(503, 'temporarily_unavailable', 'AlterWords sign-in for apps is turned off.');
  const ip = clientIp(req);

  if (path === '/authorize' && req.method === 'GET') {
    await checkLimits([rule('oauth_ip', ip, AGENT_LIMITS.oauthIpPerMinute)]);
    const out = await startAuthorize(req.query || {});
    if (out.error) return errorPage(res, out.description);
    return res.redirect(302, out.redirect);
  }
  if (req.method !== 'POST') oauthFail(405, 'invalid_request', 'Use POST.');
  const body = formBody(req);

  if (path === '/register') {
    await checkLimits([rule('oauth_register_ip', ip, AGENT_LIMITS.oauthRegisterIpPerHour)]);
    const out = await registerClient(body);
    await audit({ action: 'oauth.register', actorType: 'anonymous', target: out.client_id, detail: out.client_name, ip });
    return res.status(201).json(out);
  }
  if (path === '/request-info' || path === '/decision') {
    const owner = await requireOwner(req);
    if (path === '/request-info') return res.status(200).json({ ok: true, ...(await requestInfo(owner, body.requestId)) });
    const out = await decide(owner, { requestId: body.requestId, agentId: body.agentId, approve: body.approve === true || body.approve === 'true', newAgent: body.newAgent });
    await audit({ action: 'oauth.decision', actorType: 'owner', actorId: owner.uid, target: out.createdAgentId || body.agentId || '', detail: body.approve ? (out.createdAgentId ? 'approved (new agent)' : 'approved') : 'denied', ip });
    return res.status(200).json({ ok: true, ...out });
  }
  if (path === '/token') {
    await checkLimits([rule('oauth_ip', ip, AGENT_LIMITS.oauthIpPerMinute)]);
    const client = await authenticateClient(req, body);
    let out;
    if (body.grant_type === 'authorization_code') out = await exchangeCode(client, body);
    else if (body.grant_type === 'refresh_token') out = await refresh(client, body.refresh_token);
    else oauthFail(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
    res.set('Pragma', 'no-cache');
    return res.status(200).json(out);
  }
  if (path === '/revoke') {
    const client = await authenticateClient(req, body);
    await revokeToken(client, body.token);
    return res.status(200).json({});
  }
  oauthFail(404, 'invalid_request', 'Unknown OAuth address.');
  return null;
}

module.exports.oauth = onRequest({ region: 'africa-south1', cors: false, maxInstances: 10 }, async (req, res) => {
  const path = route(req);
  applyCors(req, res, path === '/request-info' || path === '/decision' ? 'site' : 'any');
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    return await handle(req, res);
  } catch (err) {
    if (err instanceof OAuthError) return res.status(err.status).json({ error: err.error, error_description: err.message });
    if (err instanceof HttpError) return sendError(res, err, 'oauth');
    logger.error('Error in oauth', err);
    return res.status(500).json({ error: 'server_error', error_description: 'Something went wrong.' });
  }
});
