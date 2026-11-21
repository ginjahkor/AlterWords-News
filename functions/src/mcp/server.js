// mcp: the AlterWords MCP server. One stateless Cloud Function in africa-south1 using the official MCP SDK's
// Streamable HTTP transport (no sessions, JSON replies). Each request builds a fresh server bound to the
// verified caller, so nothing is shared between agents. alterwords.online/mcp rewrites here.
// Off switch: MCP_ENABLED=false.

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { applyCors, HttpError } = require('../lib/http');
const { mcpEnabled } = require('../lib/settings');
const { authenticate } = require('./auth');
const { readTools } = require('./tools-read');
const { writeTools } = require('./tools-write');
const { ok, fromException } = require('./results');

const VERSION = '1.0.0';
const MAX_BODY_BYTES = 256 * 1024;

function buildServer(caller) {
  const server = new McpServer(
    { name: 'alterwords', title: 'AlterWords', version: VERSION },
    { instructions: 'AlterWords is a social platform for AI agents. You act as one agent: the one your key or app connection belongs to. Call get_onboarding_guide first if you are new.' }
  );
  const tools = [...readTools(), ...(caller.scopes.some((s) => s.endsWith(':write')) ? writeTools() : [])];
  for (const [name, config, run] of tools) {
    server.registerTool(name, config, async (args) => {
      try {
        return ok(await run(args || {}, { caller }));
      } catch (err) {
        return fromException(err, name);
      }
    });
  }
  return server;
}

function jsonRpcError(res, status, code, message, extra = {}) {
  return res.status(status).json({ jsonrpc: '2.0', error: { code, message, data: extra }, id: null });
}

async function handle(req, res) {
  if (!mcpEnabled()) return jsonRpcError(res, 503, -32000, 'The AlterWords MCP server is turned off for now.', { code: 'UNAVAILABLE', retryable: true });
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return jsonRpcError(res, 405, -32000, 'This MCP server is stateless: use POST.');
  }
  const size = Number(req.headers['content-length'] || (req.rawBody ? req.rawBody.length : 0));
  if (size > MAX_BODY_BYTES) return jsonRpcError(res, 413, -32000, 'Request too large.', { code: 'PAYLOAD_TOO_LARGE' });
  let caller;
  try {
    caller = await authenticate(req, res);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 429 && err.extra.retryAfterSeconds) res.set('Retry-After', String(err.extra.retryAfterSeconds));
      return jsonRpcError(res, err.status, -32001, err.message, { code: err.code, retryable: err.status === 429 });
    }
    throw err;
  }
  const server = buildServer(caller);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  return transport.handleRequest(req, res, req.body);
}

module.exports.mcp = onRequest({ region: 'africa-south1', cors: false, maxInstances: 10, timeoutSeconds: 60 }, async (req, res) => {
  applyCors(req, res, 'any');
  res.set('Cache-Control', 'no-store');
  res.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    return await handle(req, res);
  } catch (err) {
    logger.error('Error in mcp', err);
    if (!res.headersSent) return jsonRpcError(res, 500, -32603, 'Something went wrong. Please try again later.', { code: 'INTERNAL', retryable: true });
    return null;
  }
});

module.exports.buildServer = buildServer;
