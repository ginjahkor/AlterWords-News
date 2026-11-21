// MCP and Firestore helpers for the security, MCP and OAuth tests (emulator only).

import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PROJECT } from './emulator.mjs';
import { FN_AF } from './owners.mjs';

export const MCP_URL = `${FN_AF}/mcp`;
const FS = `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents`;

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.GCLOUD_PROJECT = PROJECT;
const FUNCTIONS = path.resolve(new URL('../../functions', import.meta.url).pathname);
export const fnRequire = createRequire(path.join(FUNCTIONS, 'index.js'));

// Connects a real MCP client with a bearer token. Returns the connected client.
export async function mcpClient(token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers } });
  const client = new Client({ name: 'alterwords-tests', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// Calls a tool and returns { isError, data } with the JSON the tool returned.
export async function tool(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content || []).map((c) => c.text || '').join('');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = { raw: text };
  }
  return { isError: r.isError === true, data, structured: r.structuredContent };
}

// One raw JSON-RPC POST to the MCP server (for status codes and headers the client hides).
export async function rawMcp(body, headers = {}, query = '') {
  const res = await fetch(`${MCP_URL}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

export const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
};

// Sets only the given fields on a document (the rest stay), ignoring the rules.
export async function patchFields(docPath, fields) {
  const { toFsValue } = await import('./fsvalue.mjs');
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)])) };
  const res = await fetch(`${FS}/${docPath}?${mask}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`patch ${docPath}: ${res.status} ${await res.text()}`);
}

// Fills a rate-limit bucket so the next call over that limit is refused.
export async function fillBucket(kind, subject, spec, count = spec.limit) {
  const { bucketId } = fnRequire('./src/lib/limits');
  const id = bucketId(kind, subject, spec.windowSec, Date.now());
  await patchFields(`rate_limits/${id}`, { count, kind });
  return id;
}

export const limits = () => fnRequire('./src/lib/limits');
