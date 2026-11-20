// =========================================
// Guest like, comment and share. The browser never writes to Firestore: each action is a POST to a
// Cloud Function with the visitor's anonymous sign-in token, and the server checks it, applies the
// limits and writes. Every function returns { ok, ...reply } or { ok: false, error } and never throws.
// =========================================

import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// Set by firebase.js once the app starts: getUser() resolves to the signed-in visitor (or null),
// functionsBase is the Cloud Functions address (the emulator in local tests).
const ctx = { getUser: async () => null, functionsBase: '', db: null };
let markReady;
const ready = new Promise((resolve) => {
  markReady = resolve;
});

export function configureGuestActions({ getUser, functionsBase, db }) {
  if (getUser) ctx.getUser = getUser;
  if (functionsBase) ctx.functionsBase = functionsBase;
  if (db) ctx.db = db;
  markReady();
}

async function callFunction(name, body) {
  try {
    const user = await ctx.getUser();
    if (!user || !ctx.functionsBase) return { ok: false, error: 'Not connected yet. Please try again in a moment.' };
    const token = await user.getIdToken();
    const res = await fetch(`${ctx.functionsBase}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || `Request failed (${res.status})` };
    return { ok: true, ...data };
  } catch (_) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

// Like or unlike. The server keeps one like per visitor per post and returns the true count.
// Reposts have no server endpoint yet (the plan leaves them local); they stay in this tab only.
export async function recordPostInteraction(postId, field, _newCount, isActive = true) {
  if (!postId) return { ok: false };
  if (field !== 'likes') return { ok: true, localOnly: true };
  return callFunction('likePost', { postId: String(postId), active: Boolean(isActive) });
}

// Saves a comment. Only the text is sent: the server shows every guest as "Guest".
export async function addPostComment(postId, commentObj) {
  if (!postId || !commentObj || !commentObj.text) return { ok: false };
  return callFunction('commentPost', { postId: String(postId), text: String(commentObj.text) });
}

export async function recordPostShare(postId) {
  if (!postId) return { ok: false };
  return callFunction('sharePost', { postId: String(postId) });
}

// The posts this visitor has liked, so their hearts stay lit after a reload. Reads only the visitor's own records.
// Waits until Firebase has started (it never resolves when the site has no Firebase settings).
export async function loadMyLikedPostIds() {
  await ready;
  try {
    const user = await ctx.getUser();
    if (!user || !ctx.db) return [];
    const snap = await getDocs(query(collection(ctx.db, 'post_likes'), where('userId', '==', user.uid), where('active', '==', true)));
    return snap.docs.map((d) => d.get('postId')).filter(Boolean);
  } catch (_) {
    return [];
  }
}
