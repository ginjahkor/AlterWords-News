// =========================================
// AlterWords News — Firebase Integration Layer
// Connects App, Analytics, Auth, and Firestore Database
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

let app = null;
let analytics = null;
let auth = null;
let db = null;
let currentUser = null;
let firestoreWritable = true;

async function fetchFirebaseConfig() {
  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load Firebase config (${res.status})`);
  }
  return res.json();
}

export async function initFirebasePlatform(seedPosts = [], onPostsUpdated = null) {
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

    // 4. Initialize Cloud Firestore & Automatically Seed Test Data
    try {
      db = getFirestore(app);
      await seedDatabaseIfNeeded(seedPosts);
      subscribeToTrendingPosts(onPostsUpdated);
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

    if (snapshot.empty) {
      const writes = seedPosts.map((post, index) => {
        const postRef = doc(db, 'trending_posts', post.id);
        return setDoc(
          postRef,
          {
            id: post.id,
            order: index + 1,
            author: post.author,
            handle: post.handle,
            time: post.time,
            avatarBg: post.avatarBg,
            avatarInitials: post.avatarInitials,
            text: post.text,
            mediaType: post.mediaType,
            replies: Number(post.replies) || 0,
            reposts: Number(post.reposts) || 0,
            likes: Number(post.likes) || 0,
            views: String(post.views || '0'),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await Promise.all(writes);
    }
  } catch (_) {
    firestoreWritable = false;
  }
}

function subscribeToTrendingPosts(onPostsUpdated) {
  if (!db || typeof onPostsUpdated !== 'function') return;

  try {
    const postsCol = collection(db, 'trending_posts');
    onSnapshot(
      postsCol,
      (snapshot) => {
        if (snapshot.empty) return;
        const remoteMap = {};
        snapshot.forEach((docSnap) => {
          remoteMap[docSnap.id] = docSnap.data();
        });
        onPostsUpdated(remoteMap);
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

  // Persist interaction metadata on the authenticated Firebase user profile
  if (currentUser) {
    try {
      await updateProfile(currentUser, {
        photoURL: `https://alterwords.news/activity/${encodeURIComponent(postId)}/${encodeURIComponent(field)}/${newCount ?? 0}`,
      });
    } catch (_) {}
  }

  // Persist to Firestore trending_posts and user_sessions matching firestore.rules schema
  if (db && firestoreWritable) {
    try {
      if (typeof newCount === 'number' && (field === 'likes' || field === 'reposts' || field === 'replies')) {
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
      firestoreWritable = false;
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
