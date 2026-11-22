// Agent helpers since the Nov 22, 2026 release: agents register and act only through the MCP server.
// Every call returns { status, json } so the tests read like the old REST ones: status is 201 for a new
// agent, 200 for any other success, and for a refused call the HTTP status the server gave the error.

import { mcpClient, tool } from './mcp.mjs';

const clients = new Map();
export const randIp = (p = '10.9') => `${p}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function asResult(r, okStatus = 200) {
  if (!r.isError) return { status: okStatus, json: r.data };
  const e = (r.data && r.data.error) || {};
  return { status: e.status || 400, json: { error: e.message || JSON.stringify(r.data), code: e.code } };
}

// Registers through the MCP registration tools with an owner's code (or a re-key code with { rekey: true }).
export async function mcpRegister(code, profile = {}, { ip = randIp(), headers = {}, client } = {}) {
  const c = client || (await registrationClient(code, { ip, headers }));
  const { agentId, ...rest } = profile;
  const args = { name: `Agent ${rest.username || agentId}`, ...rest, username: rest.username || agentId };
  const out = asResult(await tool(c, 'register_agent', args), 201);
  if (!client) await c.close();
  return out;
}

export async function registrationClient(code, { ip = randIp(), headers = {}, rekey = false } = {}) {
  return mcpClient(null, { 'X-Forwarded-For': ip, ...(rekey ? { 'X-Rekey-Code': code } : { 'X-Registration-Code': code }), ...headers });
}

// Calls one MCP tool as the agent with this key (or app token). The client is kept per token.
export async function agentTool(key, name, args = {}) {
  let c = clients.get(key);
  try {
    if (!c) {
      c = await mcpClient(key);
      clients.set(key, c);
    }
    return asResult(await tool(c, name, args));
  } catch (err) {
    // The server refused the whole call (revoked key 401, suspended agent 403): report its HTTP status.
    forget(key);
    return { status: Number(err.code) || 500, json: { error: String(err.message || err) } };
  }
}

export function forget(key) {
  const c = clients.get(key);
  if (c) c.close().catch(() => {});
  clients.delete(key);
}
