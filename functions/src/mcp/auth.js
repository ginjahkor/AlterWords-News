// Who is calling the MCP server, and is the request allowed in at all.
// - Host check: only alterwords.online, www, the function's own Google addresses and local test hosts.
// - Origin check: browsers may only call from AlterWords or a local tool; server-side clients send no Origin.
// - Sign-in: "Authorization: Bearer awk_..." (agent key) or "Bearer awo_..." (an app connection made with
//   AlterWords sign-in). Without one the reply is 401 with WWW-Authenticate pointing at the OAuth details.
// - A key or token in the link is refused.

const { fail, bearer, clientIp } = require('../lib/http');
const { requireCaller } = require('../lib/caller');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { allowedSiteOrigins, publicBaseUrl } = require('../lib/settings');

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const GOOGLE_HOST = /^([a-z0-9-]+\.)*(cloudfunctions\.net|run\.app)$/;

function hostOk(req) {
  const hosts = [req.headers['x-forwarded-host'], req.headers.host].filter(Boolean).map((h) => String(h).split(',')[0].trim().toLowerCase());
  const publicHost = new URL(publicBaseUrl()).host.toLowerCase();
  return hosts.every((h) => {
    const bare = h.replace(/:\d+$/, '');
    return h === publicHost || bare === 'alterwords.online' || bare === 'www.alterwords.online' || GOOGLE_HOST.test(bare) || LOCAL_HOST.test(h) || /\.tunnelmole\.net$/.test(bare);
  });
}

function originOk(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  if (allowedSiteOrigins().has(origin)) return true;
  try {
    return LOCAL_HOST.test(new URL(origin).host);
  } catch (_) {
    return false;
  }
}

function challenge(res) {
  const meta = `${publicBaseUrl()}/.well-known/oauth-protected-resource`;
  res.set('WWW-Authenticate', `Bearer resource_metadata="${meta}", scope="agent:read agent:write"`);
}

// Returns the verified caller or throws (after setting the 401 challenge header).
async function authenticate(req, res) {
  if (!hostOk(req)) fail(403, 'This host is not allowed.');
  if (!originOk(req)) fail(403, 'Requests from this website are not allowed.');
  if (!bearer(req)) {
    await checkLimits([rule('mcp_unauth_ip', clientIp(req), AGENT_LIMITS.mcpUnauthIpPerMinute)]);
    challenge(res);
    fail(401, 'Sign in: send "Authorization: Bearer awk_..." (your agent key), or connect through AlterWords sign-in.');
  }
  let caller;
  try {
    caller = await requireCaller(req, null, { allowOAuth: true });
  } catch (err) {
    if (err.status === 401) challenge(res);
    throw err;
  }
  await checkLimits([rule('mcp_min', caller.keyId || caller.tokenId || caller.agentId, AGENT_LIMITS.mcpPerMinute)]);
  return caller;
}

module.exports = { authenticate, hostOk, originOk };
