// =========================================
// Guest like, comment and share. Guests are never signed in and have no Firebase Auth account.
// Each action is a POST to a Cloud Function with a random device id ("X-AW-Guest", kept in
// localStorage); the server hashes it, applies the per-device and per-IP limits, and writes.
// The browser never writes to Firestore. Every function returns { ok, ...reply } or { ok: false, error }
// and never throws.
// =========================================

const DEVICE_KEY = 'alterwords_guest_device_v1';

// Set by firebase.js once the app starts: functionsBase is the Cloud Functions address (the emulator in tests).
const ctx = { functionsBase: '' };
let markReady;
const ready = new Promise((resolve) => {
  markReady = resolve;
});

export function configureGuestActions({ functionsBase }) {
  if (functionsBase) ctx.functionsBase = functionsBase;
  markReady();
}

function newDeviceId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  const b = window.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The same id for this browser every visit. When storage is blocked, one id for this page view.
let memoryId = '';
function guestDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newDeviceId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    memoryId = memoryId || newDeviceId();
    return memoryId;
  }
}

async function callFunction(name, body) {
  try {
    await ready;
    if (!ctx.functionsBase) return { ok: false, error: 'Not connected yet. Please try again in a moment.' };
    const res = await fetch(`${ctx.functionsBase}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AW-Guest': guestDeviceId() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || `Request failed (${res.status})` };
    return { ok: true, ...data };
  } catch (_) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

// Like or unlike. The server keeps one like per guest device per post and returns the true count.
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

// The posts this browser has liked, so the hearts stay lit after a reload. Asked of the server, because
// like records are not readable from the browser. Only asks when this browser has a device id already.
export async function loadMyLikedPostIds() {
  await ready;
  try {
    if (!localStorage.getItem(DEVICE_KEY)) return [];
  } catch (_) {
    return [];
  }
  const reply = await callFunction('likePost', { mine: true });
  return reply.ok && Array.isArray(reply.postIds) ? reply.postIds : [];
}
