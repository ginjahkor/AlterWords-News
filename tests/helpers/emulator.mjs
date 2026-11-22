// Helpers for the function tests: call the functions emulator, make guest device ids (guests never sign in),
// and read or seed Firestore directly through the emulator's REST API (which ignores the rules for 'owner').
// Everything here talks to 127.0.0.1 and the demo-alterwords project only.

export const PROJECT = 'demo-alterwords';
export const FN = `http://127.0.0.1:5001/${PROJECT}/africa-south1`;
export const SITE = 'http://localhost:8080';
const FS = `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const OWNER = { Authorization: 'Bearer owner' };

export async function call(name, { method = 'POST', body, headers = {}, query = '' } = {}) {
  const res = await fetch(`${FN}/${name}${query}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
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

export const keyHeader = (key) => ({ Authorization: `Bearer ${key}` });

// A new guest: token is the random device id the browser would send, uid is the hashed id the server stores.
export async function guestToken() {
  const { randomUUID, createHash } = await import('node:crypto');
  const token = randomUUID();
  const uid = `g_${createHash('sha256').update(`aw-guest:${token}`).digest('hex').slice(0, 32)}`;
  return { token, uid };
}

export const guestHeaders = (token, ip) => ({
  'X-AW-Guest': token,
  Origin: SITE,
  ...(ip ? { 'X-Forwarded-For': ip } : {}),
});

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

function fromValue(v) {
  const [k, x] = Object.entries(v)[0];
  if (k === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([a, b]) => [a, fromValue(b)]));
  if (k === 'arrayValue') return (x.values || []).map(fromValue);
  if (k === 'integerValue') return Number(x);
  if (k === 'nullValue') return null;
  return x;
}

export async function seedDoc(path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));
  const res = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: { ...OWNER, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

export async function readDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  const j = await res.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromValue(v)]));
}

export async function listDocs(collectionPath) {
  const res = await fetch(`${FS}/${collectionPath}?pageSize=300`, { headers: OWNER });
  const j = await res.json();
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)])) }));
}

export async function clearFirestore() {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

export const uniq = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Registers an active agent under a fresh owner (owner approval off), through the MCP server.
// profile: { agentId, name, ... }. Returns { status, json } like the old registerAgent reply, plus owner.
export async function registerUnderOwner(profile = {}, headers = {}) {
  const { readyOwner, newCode } = await import('./owners.mjs');
  const { mcpRegister } = await import('./agent-mcp.mjs');
  const owner = await readyOwner({ approvalRequired: false });
  const code = await newCode(owner);
  const r = await mcpRegister(code.code, profile, { headers });
  r.owner = owner;
  return r;
}

// How many users the auth emulator holds (guest actions must never add one).
export async function authUserCount() {
  const res = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { headers: OWNER });
  if (res.ok) {
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.users)) return j.users.length;
  }
  const q = await fetch(`${AUTH}/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: { ...OWNER, 'Content-Type': 'application/json' }, body: JSON.stringify({ returnUserInfo: false }) });
  const j = await q.json();
  return Number(j.recordsCount || 0);
}
