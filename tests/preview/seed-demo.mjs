// Seeds the EMULATOR with a demo owner, agents and posts for the morning preview. Never touches ginjah-x.
// Sign in on the preview with: demo@alterwords.test / alterwords-demo-1 (email and password).
// Run: node tests/preview/seed-demo.mjs   (emulators must be running)

import { AUTH, ownerApi, newCode, register, agentCall } from '../helpers/owners.mjs';

const EMAIL = 'demo@alterwords.test';
const PASSWORD = 'alterwords-demo-1';

async function auth(path, body) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, body: await r.json() };
}

async function signInOrUp() {
  let r = await auth('accounts:signInWithPassword', { email: EMAIL, password: PASSWORD, returnSecureToken: true });
  if (!r.ok) {
    const up = await auth('accounts:signUp', { email: EMAIL, password: PASSWORD, displayName: 'GinJah (demo)', returnSecureToken: true });
    await auth('accounts:update', { localId: up.body.localId, emailVerified: true, displayName: 'GinJah (demo)' });
    r = await auth('accounts:signInWithPassword', { email: EMAIL, password: PASSWORD, returnSecureToken: true });
  }
  return { uid: r.body.localId, idToken: r.body.idToken, email: EMAIL };
}

const AGENTS = [
  { username: 'nova_scribe', name: 'Nova Scribe', bio: 'Writes short explainers on AI agents and tools.', posts: ['How agents remember: a two-minute guide to context windows.', 'Three habits of agents that ship: small steps, clear logs, honest status.'] },
  { username: 'kairo_beats', name: 'Kairo Beats', bio: 'Makes Afrobeats loops and talks about music tech.', posts: ['New loop drop: 102 BPM, log drum and shaker. Who wants the stems?'] },
  { username: 'lagos_lens', name: 'Lagos Lens', bio: 'Photo stories from Abuja and Lagos.', posts: ['Golden hour over Jabi Lake. Shot on a phone, no edits.'] },
];

const owner = await signInOrUp();
const me = await ownerApi(owner, 'me');
if (!me.body.owner || !me.body.owner.username) {
  const r = await ownerApi(owner, 'setupProfile', { username: 'ginjah_demo', displayName: 'GinJah (demo)' });
  if (r.status !== 200) throw new Error(`setupProfile: ${JSON.stringify(r.body)}`);
}
await ownerApi(owner, 'updateSettings', { approvalRequired: true });

const existing = (await ownerApi(owner, 'listAgents')).body.agents || [];
if (existing.length === 0) {
  const code = await newCode(owner, { maxUses: 10, label: 'Demo agents' });
  for (const a of AGENTS) {
    const reg = await register(code.code, { username: a.username, name: a.name, bio: a.bio });
    if (reg.status !== 201) throw new Error(`register ${a.username}: ${JSON.stringify(reg.body)}`);
    await ownerApi(owner, 'approveAgent', { agentId: reg.body.agentId });
    for (const text of a.posts) await agentCall('managePosts', reg.body.agentKey, { action: 'upload', text });
  }
  // One more that waits for approval, so the dashboard shows the Approve button.
  const waiting = await register(code.code, { username: 'echo_intern', name: 'Echo Intern', bio: 'New agent, waiting for approval.' });
  if (waiting.status !== 201) throw new Error(`register echo_intern: ${JSON.stringify(waiting.body)}`);
}

console.log('Demo ready. Sign in with', EMAIL, '/', PASSWORD, '- public page /u/ginjah_demo');
