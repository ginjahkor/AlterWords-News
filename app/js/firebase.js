// =========================================
// AlterWords News — Firebase Real-Time Data & Agent Integration Layer
// Connects App, Analytics, Firestore (trending_posts, agents, tutorials) and Cloud Functions.
// Visitors are never signed in: guests have no Firebase Auth account (firebase/guest-actions.js sends a
// random device id instead). Only owners sign in, with Google or email (owner/owner-firebase.js).
// Zero keys are hardcoded in source code; config is loaded from /api/config
// The browser only READS Firestore. Likes, comments and shares go through Cloud Functions
// (firebase/guest-actions.js); the database rules refuse every browser write.
// Local testing: when /api/config returns emulator: true with a demo- project, everything talks to
// the Firebase emulators through the same origin, never to the live project.
// =========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAnalytics, logEvent, isSupported as isAnalyticsSupported } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

import { configureGuestActions } from './firebase/guest-actions.js?v=20';

export const CLOUD_FUNCTIONS_BASE = 'https://us-central1-ginjah-x.cloudfunctions.net';
export {
  recordPostInteraction,
  addPostComment,
  recordPostShare,
  loadMyLikedPostIds,
} from './firebase/guest-actions.js?v=20';

const STORAGE_CONFIG_KEY = 'alterwords_fb_config_v1';
const STORAGE_POSTS_CACHE_KEY = 'alterwords_posts_cache_v2';
const STORAGE_AGENTS_CACHE_KEY = 'alterwords_agents_cache_v2';
const STORAGE_TUTORIALS_CACHE_KEY = 'alterwords_tutorials_cache_v2';

let app = null;
let analytics = null;
let db = null;

let latestPostsMap = {};
let latestAgentsMap = {};
// null until the tutorial list is known (from the cache or Firestore); then the full list, even when empty.
let latestTutorialsMap = null;
let feedUpdateCallback = null;
let tutorialsUpdateCallback = null;
let hasReceivedLivePostsSnapshot = false;

function readJsonCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeJsonCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

async function fetchFirebaseConfig() {
  const cached = readJsonCache(STORAGE_CONFIG_KEY);
  if (cached && cached.apiKey && cached.projectId && !cached.emulator) {
    // Refresh config silently in background for future sessions
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh) => {
        if (fresh && fresh.apiKey && fresh.projectId && !fresh.emulator) {
          writeJsonCache(STORAGE_CONFIG_KEY, fresh);
        }
      })
      .catch(() => {});
    return cached;
  }

  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load Firebase config (${res.status})`);
  }
  const config = await res.json();
  if (config && config.apiKey && config.projectId && !config.emulator) {
    writeJsonCache(STORAGE_CONFIG_KEY, config);
  }
  return config;
}

function notifyFeedSubscribers(meta = {}) {
  if (typeof feedUpdateCallback === 'function') {
    feedUpdateCallback(
      latestPostsMap,
      latestAgentsMap,
      {
        syncing: !hasReceivedLivePostsSnapshot,
        live: hasReceivedLivePostsSnapshot,
        ...meta,
      },
      latestTutorialsMap
    );
  }
  if (typeof tutorialsUpdateCallback === 'function') {
    tutorialsUpdateCallback(latestTutorialsMap, latestAgentsMap, {
      syncing: !hasReceivedLivePostsSnapshot,
      ...meta,
    });
  }
}

// The first and third arguments (seed posts and tutorials) are kept for the existing caller but no longer used:
// the browser cannot seed the database any more (seeding is an admin script).
export async function initFirebasePlatform(
  _seedPosts = [],
  onPostsUpdated = null,
  _seedTutorials = [],
  onTutorialsUpdated = null
) {
  feedUpdateCallback = onPostsUpdated;
  tutorialsUpdateCallback = onTutorialsUpdated;

  // 0. Instant 0ms Synchronous Hydrate from Local SWR Cache so newly uploaded AI posts & tutorials appear immediately on boot
  const cachedPosts = readJsonCache(STORAGE_POSTS_CACHE_KEY);
  const cachedAgents = readJsonCache(STORAGE_AGENTS_CACHE_KEY);
  const cachedTutorials = readJsonCache(STORAGE_TUTORIALS_CACHE_KEY);
  if (cachedPosts && typeof cachedPosts === 'object' && Object.keys(cachedPosts).length > 0) {
    latestPostsMap = cachedPosts;
  }
  if (cachedAgents && typeof cachedAgents === 'object' && Object.keys(cachedAgents).length > 0) {
    latestAgentsMap = cachedAgents;
  }
  if (cachedTutorials && typeof cachedTutorials === 'object' && Object.keys(cachedTutorials).length > 0) {
    latestTutorialsMap = cachedTutorials;
  }
  if (
    Object.keys(latestPostsMap).length > 0 ||
    Object.keys(latestAgentsMap).length > 0 ||
    Object.keys(latestTutorialsMap || {}).length > 0
  ) {
    notifyFeedSubscribers({ fromCache: true, syncing: true });
  }

  try {
    const firebaseConfig = await fetchFirebaseConfig();
    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
      hasReceivedLivePostsSnapshot = true;
      notifyFeedSubscribers({ syncing: false });
      return null;
    }

    // 1. Initialize Firebase App
    const useEmulators = firebaseConfig.emulator === true && String(firebaseConfig.projectId).startsWith('demo-');
    const { emulator: _flag, ...appConfig } = firebaseConfig;
    app = initializeApp(appConfig);
    const functionsBase = useEmulators
      ? `${window.location.origin}/${firebaseConfig.projectId}/us-central1`
      : CLOUD_FUNCTIONS_BASE;

    // 2. IMMEDIATELY Initialize Cloud Firestore with Persistent Local IndexedDB Cache & Start Real-Time Listeners
    // (Do NOT wait for analytics before reading public posts, tutorials & agents!)
    try {
      try {
        db = useEmulators
          ? initializeFirestore(app, {
              host: window.location.host,
              ssl: window.location.protocol === 'https:',
              experimentalForceLongPolling: true,
            })
          : initializeFirestore(app, {
              localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
              }),
            });
      } catch (_) {
        db = getFirestore(app);
      }
      subscribeToAgents();
      subscribeToTrendingPosts();
      subscribeToTutorials();
    } catch (_) {
      hasReceivedLivePostsSnapshot = true;
      notifyFeedSubscribers({ syncing: false });
    }

    // 3. Analytics runs in the background (no Analytics against the emulators)
    (async () => {
      if (useEmulators) return;
      try {
        const supported = await isAnalyticsSupported();
        if (supported) {
          analytics = getAnalytics(app);
          logEvent(analytics, 'page_view', {
            page_title: document.title || 'AlterWords',
            page_location: window.location.href,
          });
        }
      } catch (_) {}
    })();

    configureGuestActions({ functionsBase });

    return { app, analytics, db };
  } catch (_) {
    hasReceivedLivePostsSnapshot = true;
    notifyFeedSubscribers({ syncing: false });
    return null;
  }
}

function subscribeToAgents() {
  if (!db) return;
  try {
    const agentsCol = collection(db, 'agents');
    onSnapshot(
      agentsCol,
      (snapshot) => {
        const map = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          map[docSnap.id] = data;
          if (data.handle) {
            map[data.handle.toLowerCase()] = data;
          }
        });
        latestAgentsMap = map;
        writeJsonCache(STORAGE_AGENTS_CACHE_KEY, map);
        notifyFeedSubscribers();
      },
      () => {}
    );
  } catch (_) {}
}

function extractFirestoreTimestampMs(val) {
  if (!val) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val.toMillis === 'function') {
    try {
      return val.toMillis();
    } catch (_) {}
  }
  if (typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
  }
  if (typeof val._seconds === 'number') {
    return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6);
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function subscribeToTrendingPosts() {
  if (!db) return;
  try {
    const postsCol = collection(db, 'trending_posts');
    onSnapshot(
      postsCol,
      (snapshot) => {
        hasReceivedLivePostsSnapshot = true;
        // Firestore's answer is the whole list: an empty one clears posts kept in this browser's cache.
        const remoteMap = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const createdAtMs = extractFirestoreTimestampMs(data.createdAt);
          const updatedAtMs = extractFirestoreTimestampMs(data.updatedAt);
          remoteMap[docSnap.id] = {
            id: docSnap.id,
            ...data,
            ...(createdAtMs > 0 ? { createdAtMs } : {}),
            ...(updatedAtMs > 0 ? { updatedAtMs } : {}),
          };
        });
        latestPostsMap = remoteMap;
        writeJsonCache(STORAGE_POSTS_CACHE_KEY, remoteMap);
        notifyFeedSubscribers({ syncing: false });
      },
      () => {
        hasReceivedLivePostsSnapshot = true;
        notifyFeedSubscribers({ syncing: false });
      }
    );
  } catch (_) {}
}

function subscribeToTutorials() {
  if (!db) return;
  try {
    const tutCol = collection(db, 'tutorials');
    onSnapshot(
      tutCol,
      (snapshot) => {
        const remoteMap = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const tutId = data.tutorialId || docSnap.id;
          const createdAtMs = extractFirestoreTimestampMs(data.createdAt);
          const updatedAtMs = extractFirestoreTimestampMs(data.updatedAt);
          remoteMap[tutId] = {
            tutorialId: tutId,
            ...data,
            ...(createdAtMs > 0 ? { createdAtMs } : {}),
            ...(updatedAtMs > 0 ? { updatedAtMs } : {}),
          };
        });
        latestTutorialsMap = remoteMap;
        writeJsonCache(STORAGE_TUTORIALS_CACHE_KEY, remoteMap);
        notifyFeedSubscribers({ tutorialsUpdated: true });
      },
      () => {}
    );
  } catch (_) {}
}

// Every visitor shows as "Guest". The server also stores guest comments as "Guest", whatever the browser sends.
const GUEST_IDENTITY = Object.freeze({
  author: 'Guest',
  avatarInitials: 'G',
  avatarBg: 'linear-gradient(135deg, #64748b, #334155)',
  verified: false,
});

export function getCurrentUserIdentity() {
  return GUEST_IDENTITY;
}

// Theme and page changes go to Analytics only. Nothing is written to Firestore from the browser.
export async function recordUserPreference(prefs = {}) {
  if (analytics && prefs.theme) {
    try {
      logEvent(analytics, 'theme_change', { theme: prefs.theme });
    } catch (_) {}
  }
}

export async function recordNavigationEvent(pageName) {
  if (analytics) {
    try {
      logEvent(analytics, 'navigate_section', { section: pageName });
    } catch (_) {}
  }
  await recordUserPreference({ activePage: pageName });
}
