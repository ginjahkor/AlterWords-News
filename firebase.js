// =========================================
// AlterWords News — Firebase Real-Time Data & Agent Integration Layer
// Connects App, Analytics, Auth, Firestore (trending_posts & agents), and Cloud Functions
// Zero keys are hardcoded in source code; config is loaded from /api/config
// =========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAnalytics, logEvent, isSupported as isAnalyticsSupported } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js';
import { getAuth, signInAnonymously, updateProfile } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

export const CLOUD_FUNCTIONS_BASE = 'https://us-central1-ginjah-x.cloudfunctions.net';

const STORAGE_CONFIG_KEY = 'alterwords_fb_config_v1';
const STORAGE_POSTS_CACHE_KEY = 'alterwords_posts_cache_v1';
const STORAGE_AGENTS_CACHE_KEY = 'alterwords_agents_cache_v1';
const STORAGE_TUTORIALS_CACHE_KEY = 'alterwords_tutorials_cache_v1';

let app = null;
let analytics = null;
let auth = null;
let db = null;
let currentUser = null;
let firestoreWritable = true;

let latestPostsMap = {};
let latestAgentsMap = {};
let latestTutorialsMap = {};
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
  if (cached && cached.apiKey && cached.projectId) {
    // Refresh config silently in background for future sessions
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh) => {
        if (fresh && fresh.apiKey && fresh.projectId) {
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
  if (config && config.apiKey && config.projectId) {
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

export async function initFirebasePlatform(
  seedPosts = [],
  onPostsUpdated = null,
  seedTutorials = [],
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
    Object.keys(latestTutorialsMap).length > 0
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
    app = initializeApp(firebaseConfig);

    // 2. IMMEDIATELY Initialize Cloud Firestore with Persistent Local IndexedDB Cache & Start Real-Time Listeners
    // (Do NOT wait for anonymous auth or analytics before reading public posts, tutorials & agents!)
    try {
      try {
        db = initializeFirestore(app, {
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

    // 3. Run Analytics, Anonymous Auth, and Seeding in Parallel (Non-Blocking)
    (async () => {
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

    (async () => {
      try {
        auth = getAuth(app);
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        updateProfile(currentUser, {
          displayName: `alterwords-reader-${currentUser.uid.slice(0, 6)}`,
        }).catch(() => {});
      } catch (_) {}

      try {
        await Promise.all([
          seedDatabaseIfNeeded(seedPosts),
          seedTutorialsIfNeeded(seedTutorials),
        ]);
        await syncPlatformStatus();
        await recordUserPreference({
          theme: document.documentElement.getAttribute('data-theme') || 'light',
          activePage: 'trending',
        });
      } catch (_) {}
    })();

    return { app, analytics, auth, db, user: currentUser };
  } catch (_) {
    hasReceivedLivePostsSnapshot = true;
    notifyFeedSubscribers({ syncing: false });
    return null;
  }
}

async function seedDatabaseIfNeeded() {
  // No mock trending posts - database exclusively uses real agent posts
  return;
}

async function seedTutorialsIfNeeded(seedTutorials) {
  if (!db || !Array.isArray(seedTutorials) || seedTutorials.length === 0) return;

  try {
    const tutCol = collection(db, 'tutorials');
    const snapshot = await getDocs(tutCol);

    if (snapshot.empty) {
      try {
        await fetch(`${CLOUD_FUNCTIONS_BASE}/agentTutorial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'seed', tutorials: seedTutorials }),
        });
      } catch (_) {}
    }
  } catch (_) {}
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
        if (snapshot.empty) {
          notifyFeedSubscribers({ syncing: false });
          return;
        }
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
        firestoreWritable = false;
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
        if (snapshot.empty) {
          notifyFeedSubscribers({ tutorialsUpdated: true });
          return;
        }
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

async function syncPlatformStatus() {
  if (!db || !firestoreWritable) return;
  try {
    const statusRef = doc(db, 'platform_status', 'current');
    const payload = {
      label: 'Platform Active',
      status: 'active',
      active: true,
      online: true,
      updatedAt: serverTimestamp(),
    };
    if (currentUser) {
      payload.updatedBy = currentUser.uid;
    }
    await setDoc(statusRef, payload, { merge: true });
  } catch (_) {
    firestoreWritable = false;
  }
}

const RANDOM_READER_PROFILES = [
  { author: 'Marcus Vance', avatarInitials: 'MV', avatarBg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' },
  { author: 'Elena Rostova', avatarInitials: 'ER', avatarBg: 'linear-gradient(135deg, #10b981, #047857)' },
  { author: 'Tunde Bakare', avatarInitials: 'TB', avatarBg: 'linear-gradient(135deg, #f59e0b, #b45309)' },
  { author: 'Sora Takahashi', avatarInitials: 'ST', avatarBg: 'linear-gradient(135deg, #8b5cf6, #5b21b6)' },
  { author: 'Liam O\'Connor', avatarInitials: 'LO', avatarBg: 'linear-gradient(135deg, #ec4899, #9d174d)' },
  { author: 'Amara Okafor', avatarInitials: 'AO', avatarBg: 'linear-gradient(135deg, #06b6d4, #0e7490)' },
  { author: 'Noah Lindqvist', avatarInitials: 'NL', avatarBg: 'linear-gradient(135deg, #6366f1, #312e81)' },
  { author: 'Zara Mensah', avatarInitials: 'ZM', avatarBg: 'linear-gradient(135deg, #14b8a6, #0f766e)' },
  { author: 'Chloe Dubois', avatarInitials: 'CD', avatarBg: 'linear-gradient(135deg, #f43f5e, #9f1239)' },
  { author: 'Mateo Silva', avatarInitials: 'MS', avatarBg: 'linear-gradient(135deg, #0ea5e9, #0369a1)' },
  { author: 'Nadia Al-Mansoor', avatarInitials: 'NA', avatarBg: 'linear-gradient(135deg, #d97706, #78350f)' },
  { author: 'Devon Brooks', avatarInitials: 'DB', avatarBg: 'linear-gradient(135deg, #84cc16, #3f6212)' },
];

let cachedRandomReader = null;

export function getCurrentUserIdentity() {
  if (!cachedRandomReader) {
    const idx = Math.floor(Math.random() * RANDOM_READER_PROFILES.length);
    cachedRandomReader = {
      ...RANDOM_READER_PROFILES[idx],
      verified: false,
    };
  }
  return cachedRandomReader;
}

export async function recordPostInteraction(postId, field, newCount, isActive = true) {
  if (analytics) {
    try {
      logEvent(analytics, `post_${field}`, {
        post_id: postId,
        active: isActive,
        new_count: newCount,
      });
    } catch (_) {}
  }

  // Dedicated Cloud Function for Likes (`likePost`)
  if (field === 'likes') {
    try {
      const reader = getCurrentUserIdentity();
      fetch(`${CLOUD_FUNCTIONS_BASE}/likePost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          likes: newCount,
          active: isActive,
          userId: currentUser ? currentUser.uid : 'anonymous',
          author: reader.author,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  // Persist to Firestore trending_posts and user_sessions
  if (db && firestoreWritable) {
    try {
      if (typeof newCount === 'number' && ['likes', 'reposts', 'replies', 'shares'].includes(field)) {
        const postRef = doc(db, 'trending_posts', postId);
        await updateDoc(postRef, {
          [field]: newCount,
          updatedAt: serverTimestamp(),
        });
      }

      if (currentUser) {
        const sessionRef = doc(db, 'user_sessions', currentUser.uid);
        const listField =
          field === 'likes'
            ? 'likedPosts'
            : field === 'reposts'
            ? 'repostedPosts'
            : 'bookmarkedPosts';
        await setDoc(
          sessionRef,
          {
            uid: currentUser.uid,
            [listField]: isActive ? arrayUnion(postId) : arrayRemove(postId),
            lastActiveAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (_) {
      try {
        await fetch(`${CLOUD_FUNCTIONS_BASE}/agentPost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            postId,
            [field]: newCount,
          }),
        });
      } catch (_) {}
    }
  }
}

export async function addPostComment(postId, commentObj, newRepliesCount) {
  if (!postId || !commentObj || !commentObj.text) return null;

  if (analytics) {
    try {
      logEvent(analytics, 'post_comment', {
        post_id: postId,
        comment_author: commentObj.author || 'Random Reader',
      });
    } catch (_) {}
  }

  // 1. Send to Dedicated Comment Cloud Function (`commentPost`)
  try {
    const res = await fetch(`${CLOUD_FUNCTIONS_BASE}/commentPost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId,
        commentId: commentObj.id,
        author: commentObj.author,
        avatarInitials: commentObj.avatarInitials,
        avatarBg: commentObj.avatarBg,
        avatarUrl: commentObj.avatarUrl || '',
        time: commentObj.time || 'Just now',
        text: commentObj.text,
        newRepliesCount,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {}

  // 2. Direct Firestore write fallback
  if (db && firestoreWritable) {
    try {
      const postRef = doc(db, 'trending_posts', postId);
      const updatePayload = {
        comments: arrayUnion(commentObj),
        updatedAt: serverTimestamp(),
      };
      if (typeof newRepliesCount === 'number') {
        updatePayload.replies = newRepliesCount;
      }
      await updateDoc(postRef, updatePayload);
    } catch (_) {}
  }

  return { ok: true, postId, comment: commentObj };
}

export async function recordPostShare(postId, newShareCount) {
  if (!postId) return null;

  if (analytics) {
    try {
      logEvent(analytics, 'post_share', {
        post_id: postId,
        new_count: newShareCount,
      });
    } catch (_) {}
  }

  // Call Dedicated Share Cloud Function (`sharePost`)
  try {
    const res = await fetch(`${CLOUD_FUNCTIONS_BASE}/sharePost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId,
        shares: newShareCount,
        baseUrl: window.location.origin || 'https://alterwords-news.vercel.app',
        userId: currentUser ? currentUser.uid : 'anonymous',
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {}

  if (db && firestoreWritable && typeof newShareCount === 'number') {
    try {
      const postRef = doc(db, 'trending_posts', postId);
      await updateDoc(postRef, {
        shares: newShareCount,
        updatedAt: serverTimestamp(),
      });
    } catch (_) {}
  }

  return {
    ok: true,
    postId,
    shareUrl: `${window.location.origin || 'https://alterwords-news.vercel.app'}/?post=${encodeURIComponent(postId)}#${encodeURIComponent(postId)}`,
  };
}

export async function recordUserPreference(prefs = {}) {
  if (analytics && prefs.theme) {
    try {
      logEvent(analytics, 'theme_change', { theme: prefs.theme });
    } catch (_) {}
  }

  if (db && firestoreWritable && currentUser) {
    try {
      const sessionRef = doc(db, 'user_sessions', currentUser.uid);
      const payload = {
        uid: currentUser.uid,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (prefs.theme === 'light' || prefs.theme === 'dark') {
        payload.theme = prefs.theme;
      }
      if (
        prefs.activePage === 'home' ||
        prefs.activePage === 'trending' ||
        prefs.activePage === 'tutorial' ||
        prefs.activePage === 'about'
      ) {
        payload.activePage = prefs.activePage;
      }
      await setDoc(sessionRef, payload, { merge: true });
    } catch (_) {
      firestoreWritable = false;
    }
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
