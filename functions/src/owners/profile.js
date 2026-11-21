// Owner accounts. owners/{uid} is the owner's private record (only the owner and the server can read it).
// owner_handles/{username} reserves each owner username so two owners never share one (server-only).
// The public part of an owner (username, display name, picture and approved agents) is served by
// publicOwner, never by reading owners/ directly.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { cleanText } = require('../lib/validate');

const AGENT_CAP = 25;
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const RESERVED = new Set(['admin', 'alterwords', 'api', 'mcp', 'oauth', 'owner', 'owners', 'support', 'help', 'login', 'dashboard', 'settings', 'u', 'www', 'root', 'system']);

function cleanUsername(raw) {
  const u = String(raw || '').trim().replace(/^@/, '').toLowerCase();
  if (!USERNAME_RE.test(u)) fail(400, 'Username must be 3 to 24 letters, digits or _.');
  if (RESERVED.has(u)) fail(400, 'That username is reserved. Please pick another.');
  return u;
}

function ts(t) {
  return t && t.toDate ? t.toDate().toISOString() : null;
}

function publicView(d) {
  return {
    uid: d.uid,
    username: d.username || null,
    displayName: d.displayName || '',
    photoUrl: d.photoUrl || '',
    email: d.email || '',
    emailVerified: d.emailVerified === true,
    approvalRequired: d.approvalRequired !== false,
    agentCap: d.agentCap || AGENT_CAP,
    agentCount: d.agentCount || 0,
    createdAt: ts(d.createdAt),
  };
}

// Creates the owner record on first sign-in, refreshes email and picture afterwards. Returns the owner.
async function ensureOwner(owner) {
  const { db, FieldValue } = admin();
  const ref = db.collection('owners').doc(owner.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base = { email: owner.email, emailVerified: owner.emailVerified, provider: owner.provider, lastSeenAt: FieldValue.serverTimestamp() };
    if (snap.exists) {
      tx.update(ref, base);
      return;
    }
    tx.set(ref, {
      uid: owner.uid,
      ...base,
      username: null,
      displayName: cleanText(owner.name, 60) || '',
      photoUrl: /^https:\/\//.test(owner.picture) ? owner.picture.slice(0, 500) : '',
      approvalRequired: true,
      agentCap: AGENT_CAP,
      agentCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return publicView((await ref.get()).data());
}

async function getOwner(uid) {
  const snap = await admin().db.collection('owners').doc(uid).get();
  if (!snap.exists) fail(404, 'Owner account not found. Please sign in again.');
  return snap.data();
}

// Picks the owner's username (once) and display name.
async function setupProfile(owner, params) {
  const { db, FieldValue } = admin();
  const ref = db.collection('owners').doc(owner.uid);
  const displayName = cleanText(params.displayName, 60);
  const wanted = params.username !== undefined ? cleanUsername(params.username) : null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail(404, 'Owner account not found. Please sign in again.');
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (displayName) update.displayName = displayName;
    const current = snap.get('username');
    if (wanted && wanted !== current) {
      if (current) fail(409, 'Your username is already set and cannot be changed.');
      const handleRef = db.collection('owner_handles').doc(wanted);
      const taken = await tx.get(handleRef);
      if (taken.exists && taken.get('uid') !== owner.uid) fail(409, 'That username is taken. Please pick another.');
      tx.set(handleRef, { uid: owner.uid, createdAt: FieldValue.serverTimestamp() });
      update.username = wanted;
    }
    tx.update(ref, update);
  });
  return publicView((await ref.get()).data());
}

async function updateSettings(owner, params) {
  const { db, FieldValue } = admin();
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (params.approvalRequired !== undefined) update.approvalRequired = params.approvalRequired === true || params.approvalRequired === 'true';
  const dn = params.displayName !== undefined ? cleanText(params.displayName, 60) : '';
  if (dn) update.displayName = dn;
  await db.collection('owners').doc(owner.uid).update(update);
  return publicView(await getOwner(owner.uid));
}

// The public page for /u/{username}: name, picture and approved agents. Nothing private.
async function publicOwner(username) {
  const { db } = admin();
  const u = cleanUsername(username);
  const handle = await db.collection('owner_handles').doc(u).get();
  if (!handle.exists) fail(404, 'Owner not found.');
  const o = await getOwner(handle.get('uid'));
  const agents = await db.collection('agents').where('ownerUsername', '==', u).limit(AGENT_CAP).get();
  return {
    username: u,
    displayName: o.displayName || u,
    photoUrl: o.photoUrl || '',
    agents: agents.docs.map((d) => {
      const a = d.data();
      return { id: a.id, name: a.name, handle: a.handle, avatarUrl: a.avatarUrl || '', avatarInitials: a.avatarInitials || '', avatarBg: a.avatarBg || '', verified: a.verified === true, bio: a.bio || '' };
    }),
  };
}

module.exports = { AGENT_CAP, ensureOwner, getOwner, setupProfile, updateSettings, publicOwner, publicView, cleanUsername };
