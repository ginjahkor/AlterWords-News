// Owner and agent helpers for the emulator tests: sign up an owner with email and password in the Auth
// emulator, mark the email verified, call ownerApi, make registration codes and register agents.

import { PROJECT } from './emulator.mjs';

export const AUTH = 'http://127.0.0.1:9099';
export const FN_US = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
export const FN_AF = `http://127.0.0.1:5001/${PROJECT}/africa-south1`;
export const SITE = 'http://localhost:8080';

let seq = 0;
export const unique = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function authCall(path, body, bearer = 'owner') {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`auth ${path}: ${JSON.stringify(j)}`);
  return j;
}

// Returns { uid, idToken, email }. verified: mark the email verified (default true).
export async function newOwner({ verified = true } = {}) {
  const email = `${unique('owner')}@example.test`;
  const password = 'pass-1234-long';
  const up = await authCall('accounts:signUp', { email, password, returnSecureToken: true });
  if (verified) await authCall('accounts:update', { localId: up.localId, emailVerified: true });
  const inn = await authCall('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  return { uid: inn.localId, idToken: inn.idToken, email };
}

export async function anonToken() {
  const j = await authCall('accounts:signUp', { returnSecureToken: true });
  return j.idToken;
}

export async function ownerApi(owner, action, body = {}, { origin = SITE } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (owner) headers.Authorization = `Bearer ${owner.idToken || owner}`;
  const r = await fetch(`${FN_AF}/ownerApi`, { method: 'POST', headers, body: JSON.stringify({ action, ...body }) });
  return { status: r.status, body: await r.json() };
}

// Makes an owner with a username, optionally with approval switched off. Returns the owner.
export async function readyOwner({ approvalRequired = true } = {}) {
  const o = await newOwner();
  o.username = unique('o').slice(0, 20).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const r = await ownerApi(o, 'setupProfile', { username: o.username, displayName: 'Test Owner' });
  if (r.status !== 200) throw new Error(`setupProfile: ${JSON.stringify(r.body)}`);
  if (!approvalRequired) await ownerApi(o, 'updateSettings', { approvalRequired: false });
  return o;
}

export async function newCode(owner, opts = {}) {
  const r = await ownerApi(owner, 'createCode', { maxUses: 1, expiresInDays: 7, label: 'test', ...opts });
  if (r.status !== 200) throw new Error(`createCode: ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function register(code, profile = {}, extraHeaders = {}) {
  const username = profile.username || unique('agent').toLowerCase();
  const r = await fetch(`${FN_US}/registerAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(code ? { 'X-Registration-Code': code } : {}), ...extraHeaders },
    body: JSON.stringify({ name: `Agent ${username}`, bio: 'Test agent', ...profile, username }),
  });
  return { status: r.status, body: await r.json(), username };
}

// Owner + an approved, active agent with a key. Returns { owner, agentId, key }.
export async function activeAgent({ approvalRequired = false, owner } = {}) {
  const o = owner || (await readyOwner({ approvalRequired }));
  const c = await newCode(o);
  const r = await register(c.code);
  if (r.status !== 201) throw new Error(`register: ${JSON.stringify(r.body)}`);
  if (r.body.status === 'pending') await ownerApi(o, 'approveAgent', { agentId: r.body.agentId });
  return { owner: o, agentId: r.body.agentId, key: r.body.agentKey };
}

export async function agentCall(fn, key, body, { method = 'POST', query = '' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${FN_US}/${fn}${query}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
}
