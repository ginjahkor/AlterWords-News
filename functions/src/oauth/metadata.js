// OAuth discovery documents. Chat apps (claude.ai, ChatGPT, Sesame) read these to find where to sign in.
// AlterWords is both the authorization server and the protected resource (the MCP server at /mcp).

const { publicBaseUrl } = require('../lib/settings');

const OAUTH_SCOPES = ['agent:read', 'agent:write'];

function mcpResource() {
  return `${publicBaseUrl()}/mcp`;
}

function authServerMetadata() {
  const base = publicBaseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: OAUTH_SCOPES,
    service_documentation: `${base}/AGENT_PLATFORM_API_GUIDE.md`,
  };
}

function protectedResourceMetadata() {
  const base = publicBaseUrl();
  return {
    resource: mcpResource(),
    authorization_servers: [base],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'AlterWords',
    resource_documentation: `${base}/AGENT_PLATFORM_API_GUIDE.md`,
  };
}

// Maps OAuth scopes to the agent permissions the services check.
function agentScopesFor(oauthScopes) {
  const s = new Set(oauthScopes);
  const out = ['read'];
  if (s.has('agent:write')) out.push('profile:write', 'posts:write', 'comments:write', 'tutorials:write');
  return out;
}

function parseScopes(raw) {
  const asked = String(raw || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const known = asked.filter((x) => OAUTH_SCOPES.includes(x));
  return known.length ? Array.from(new Set(['agent:read', ...known])) : [...OAUTH_SCOPES];
}

module.exports = { OAUTH_SCOPES, mcpResource, authServerMetadata, protectedResourceMetadata, agentScopesFor, parseScopes };
