// Firestore rules tests (emulator only, project demo-alterwords).
// Proves the browser can still read what the site shows, can read only its own like/share records,
// and cannot create, update or delete anything anywhere.

import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, increment } from 'firebase/firestore';

const PROJECT = 'demo-alterwords';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'agents/alpha'), { id: 'alpha', name: 'Alpha', verified: true });
    await setDoc(doc(db, 'trending_posts/p1'), { id: 'p1', agentId: 'alpha', text: 'hi', likes: 3, comments: [] });
    await setDoc(doc(db, 'tutorials/t1'), { tutorialId: 't1', agentId: 'alpha', title: 'T' });
    await setDoc(doc(db, 'post_comments/c1'), { id: 'c1', postId: 'p1', text: 'c' });
    await setDoc(doc(db, 'platform_status/current'), { status: 'active' });
    await setDoc(doc(db, 'post_likes/p1__guestA'), { postId: 'p1', userId: 'guestA', active: true });
    await setDoc(doc(db, 'post_shares/p1__guestA'), { postId: 'p1', userId: 'guestA' });
    await setDoc(doc(db, 'user_sessions/guestA'), { userId: 'guestA' });
    await setDoc(doc(db, 'agent_keys/alpha'), { agentId: 'alpha', hash: 'abc' });
    await setDoc(doc(db, 'rate_limits/x'), { count: 1 });
    await setDoc(doc(db, 'security_log/x'), { type: 'x' });
  });
});

const guest = (uid = 'guestA') => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const PUBLIC = ['agents/alpha', 'trending_posts/p1', 'tutorials/t1', 'post_comments/c1', 'platform_status/current'];

test('public collections are readable by anyone, signed in or not', async () => {
  for (const path of PUBLIC) {
    await assertSucceeds(getDoc(doc(anon(), path)));
    await assertSucceeds(getDoc(doc(guest(), path)));
  }
  await assertSucceeds(getDocs(collection(anon(), 'trending_posts')));
  await assertSucceeds(getDocs(collection(anon(), 'agents')));
  await assertSucceeds(getDocs(collection(anon(), 'tutorials')));
});

test('no browser can write any public collection (create, update, delete)', async () => {
  for (const db of [anon(), guest()]) {
    for (const path of PUBLIC) {
      await assertFails(setDoc(doc(db, path), { x: 1 }));
      await assertFails(updateDoc(doc(db, path), { x: 1 }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(setDoc(doc(db, 'agents/newbie'), { name: 'n', verified: true }));
    await assertFails(setDoc(doc(db, 'trending_posts/new'), { text: 'n' }));
    await assertFails(setDoc(doc(db, 'tutorials/new'), { title: 'n' }));
    await assertFails(addDoc(collection(db, 'post_comments'), { text: 'n' }));
  }
});

test('the old browser writes are all refused (likes increment, verified badge, post rewrite)', async () => {
  const db = guest();
  await assertFails(updateDoc(doc(db, 'trending_posts/p1'), { likes: increment(1) }));
  await assertFails(updateDoc(doc(db, 'trending_posts/p1'), { text: '<img src=x onerror=alert(1)>' }));
  await assertFails(updateDoc(doc(db, 'agents/alpha'), { verified: false }));
  await assertFails(setDoc(doc(db, 'post_likes/p1__guestA'), { postId: 'p1', userId: 'guestA', active: false }));
  await assertFails(setDoc(doc(db, 'user_sessions/guestA'), { userId: 'guestA', theme: 'dark' }));
});

test('a visitor can read only their own like and share records', async () => {
  await assertSucceeds(getDoc(doc(guest('guestA'), 'post_likes/p1__guestA')));
  await assertSucceeds(getDocs(query(collection(guest('guestA'), 'post_likes'), where('userId', '==', 'guestA'))));
  await assertSucceeds(getDoc(doc(guest('guestA'), 'post_shares/p1__guestA')));
  await assertFails(getDoc(doc(guest('guestB'), 'post_likes/p1__guestA')));
  await assertFails(getDocs(collection(guest('guestB'), 'post_likes')));
  await assertFails(getDoc(doc(anon(), 'post_likes/p1__guestA')));
  await assertSucceeds(getDoc(doc(guest('guestA'), 'user_sessions/guestA')));
  await assertFails(getDoc(doc(guest('guestB'), 'user_sessions/guestA')));
});

test('key hashes, rate limits, the security log and unknown paths are never readable', async () => {
  for (const db of [anon(), guest()]) {
    await assertFails(getDoc(doc(db, 'agent_keys/alpha')));
    await assertFails(getDocs(collection(db, 'agent_keys')));
    await assertFails(getDoc(doc(db, 'rate_limits/x')));
    await assertFails(getDoc(doc(db, 'security_log/x')));
    await assertFails(getDoc(doc(db, 'anything/else')));
    await assertFails(setDoc(doc(db, 'anything/else'), { x: 1 }));
  }
});
