// Owner sign-in and owner API calls, shared by the home page, the dashboard, the public owner page and
// the app-connection (OAuth consent) page.
// Reuses the Firebase app the home page already started; standalone pages start their own from /api/config.
// Owner calls go to same-origin paths (/owner-api, /oauth/...) that Vercel and the preview forward to the
// africa-south1 functions, so no function address is written in the page.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

let authPromise = null;

async function loadConfig() {
  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load the site settings.');
  return res.json();
}

function withoutFlag(config) {
  const { emulator: _flag, ...appConfig } = config;
  return appConfig;
}

// Returns the Firebase Auth instance, starting Firebase when this page has not.
export function getOwnerAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      // The home page starts Firebase without Auth (visitors are never signed in), so Auth is first made here,
      // and pointed at the emulator here in tests, also when the app itself came from the home page.
      const config = await loadConfig();
      const app = getApps()[0] || initializeApp(withoutFlag(config));
      const auth = getAuth(app);
      const useEmulators = config.emulator === true && String(app.options.projectId || '').startsWith('demo-');
      if (useEmulators && !auth.emulatorConfig) connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
      return auth;
    })();
  }
  return authPromise;
}

// A signed-in owner is a Google or email/password user. (Guests are never signed in; any old anonymous
// session left in a browser is not treated as an owner.)
export function isOwnerUser(user) {
  return !!user && !user.isAnonymous;
}

// Calls back with the owner user (or null) now and on every change.
export async function onOwnerChange(callback) {
  const auth = await getOwnerAuth();
  await auth.authStateReady();
  return onAuthStateChanged(auth, (user) => callback(isOwnerUser(user) ? user : null));
}

export async function currentOwner() {
  const auth = await getOwnerAuth();
  await auth.authStateReady();
  return isOwnerUser(auth.currentUser) ? auth.currentUser : null;
}

// Signs the owner out. They go back to being a guest, which needs no sign-in at all.
export async function signOutOwner() {
  const auth = await getOwnerAuth();
  await signOut(auth);
}

async function postJson(path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const user = await currentOwner();
    if (!user) return { ok: false, status: 401, error: 'Please sign in to AlterWords first.' };
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  try {
    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, status: res.status, error: data.error || `Request failed (${res.status}).` };
    return { ok: true, status: res.status, ...data };
  } catch (_) {
    return { ok: false, status: 0, error: 'Network problem. Please check your connection and try again.' };
  }
}

// One owner action, e.g. ownerApi('listAgents'). Returns { ok, ...data } or { ok: false, error }.
export function ownerApi(action, body = {}) {
  return postJson('/owner-api', { action, ...body });
}

// The public page of an owner: name, photo and their active agents. No sign-in needed.
export async function fetchPublicOwner(username) {
  try {
    const res = await fetch(`/owner-api?action=publicOwner&username=${encodeURIComponent(username)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || 'Owner not found.' };
    return { ok: true, owner: data.owner };
  } catch (_) {
    return { ok: false, status: 0, error: 'Network problem. Please try again.' };
  }
}

// OAuth consent calls (/oauth/request-info and /oauth/decision), signed in as the owner.
export function oauthCall(path, body) {
  return postJson(`/oauth${path}`, body);
}
