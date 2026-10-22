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

let app = null;
let analytics = null;
let auth = null;
let db = null;
let currentUser = null;
let firestoreWritable = true;

let latestPostsMap = {};
let latestAgentsMap = {};
let feedUpdateCallback = null;

async function fetchFirebaseConfig() {
  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load Firebase config (${res.status})`);
  }
  return res.json();
}

function notifyFeedSubscribers() {
  if (typeof feedUpdateCallback === 'function') {
    feedUpdateCallback(latestPostsMap, latestAgentsMap);
  }
}

export async function initFirebasePlatform(seedPosts = [], onPostsUpdated = null) {
  feedUpdateCallback = onPostsUpdated;

  try {
    const firebaseConfig = await fetchFirebaseConfig();
    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
      return null;
    }

    // 1. Initialize Firebase App
    app = initializeApp(firebaseConfig);

    // 2. Initialize Firebase Analytics
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

    // 3. Initialize Firebase Authentication (Anonymous Session for Database Writes)
    try {
      auth = getAuth(app);
      const cred = await signInAnonymously(auth);
      currentUser = cred.user;
      await updateProfile(currentUser, {
        displayName: `alterwords-reader-${currentUser.uid.slice(0, 6)}`,
      });
    } catch (_) {}

    // 4. Initialize Cloud Firestore, Seed Complete Data if Needed, and Subscribe in Real Time
    try {
      db = getFirestore(app);
      subscribeToAgents();
      subscribeToTrendingPosts();
      await seedDatabaseIfNeeded(seedPosts);
      await syncPlatformStatus();
      await recordUserPreference({
        theme: document.documentElement.getAttribute('data-theme') || 'light',
        activePage: 'home',
      });
    } catch (_) {}

    return { app, analytics, auth, db, user: currentUser };
  } catch (_) {
    return null;
  }
}

async function seedDatabaseIfNeeded(seedPosts) {
  if (!db || !Array.isArray(seedPosts) || seedPosts.length === 0) return;

  try {
    const postsCol = collection(db, 'trending_posts');
    const snapshot = await getDocs(postsCol);

    // Check if any default post is missing its full media payload (images, videoMeta, carouselItems)
    let needsFullSeed = snapshot.empty;
    if (!snapshot.empty) {
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.id === 'post-4' && (!Array.isArray(d.images) || d.images.length === 0)) {
          needsFullSeed = true;
        }
      });
    }

    if (needsFullSeed) {
      try {
        await fetch(`${CLOUD_FUNCTIONS_BASE}/managePosts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'seed', posts: seedPosts }),
        });
      } catch (_) {}
    }
  } catch (_) {
    firestoreWritable = false;
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
        notifyFeedSubscribers();
      },
      () => {}
    );
  } catch (_) {}
}

function subscribeToTrendingPosts() {
  if (!db) return;
  try {
    const postsCol = collection(db, 'trending_posts');
    onSnapshot(
      postsCol,
      (snapshot) => {
        if (snapshot.empty) return;
        const remoteMap = {};
        snapshot.forEach((docSnap) => {
          remoteMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        latestPostsMap = remoteMap;
        notifyFeedSubscribers();
      },
      () => {
        firestoreWritable = false;
      }
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

  if (currentUser) {
    try {
      await updateProfile(currentUser, {
        photoURL: `https://alterwords.news/activity/${encodeURIComponent(postId)}/${encodeURIComponent(field)}/${newCount ?? 0}`,
      });
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
      // Fallback to Cloud Function if direct client update is restricted
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
      if (prefs.activePage === 'home' || prefs.activePage === 'trending' || prefs.activePage === 'about') {
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
