// likePost, commentPost and sharePost (emulator only): sign-in, origin, one like per visitor, Guest name, limits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, guestToken, guestHeaders, readDoc, seedDoc, uniq, authUserCount } from '../helpers/emulator.mjs';

async function post() {
  const id = uniq('zz-guestpost-');
  await seedDoc(`trending_posts/${id}`, { id, agentId: 'alpha', author: 'Alpha', text: 'hello', likes: 5, shares: 0, replies: 0, comments: [] });
  return id;
}
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

test('guest calls need a device id (no sign-in) and must come from the site', async () => {
  const id = await post();
  const g = await guestToken();
  const noOrigin = await call('likePost', { body: { postId: id }, headers: { 'X-AW-Guest': g.token } });
  assert.equal(noOrigin.status, 403);
  const evil = await call('likePost', { body: { postId: id }, headers: { 'X-AW-Guest': g.token, Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const noToken = await call('likePost', { body: { postId: id }, headers: { Origin: 'http://localhost:8080' } });
  assert.equal(noToken.status, 400);
  const fake = await call('likePost', { body: { postId: id }, headers: guestHeaders('not-a-device-id') });
  assert.equal(fake.status, 400);
  assert.equal((await readDoc(`trending_posts/${id}`)).likes, 5);
});

test('one like per visitor per post: liking twice counts once, unlike removes only your own', async () => {
  const id = await post();
  const a = await guestToken();
  const b = await guestToken();
  const addr = ip();
  let r = await call('likePost', { body: { postId: id }, headers: guestHeaders(a.token, addr) });
  assert.equal(r.json.likes, 6);
  r = await call('likePost', { body: { postId: id }, headers: guestHeaders(a.token, addr) });
  assert.equal(r.json.likes, 6, 'second like from the same visitor changes nothing');
  r = await call('likePost', { body: { postId: id, active: false }, headers: guestHeaders(b.token, addr) });
  assert.equal(r.json.likes, 6, 'a visitor who never liked cannot take a like away');
  r = await call('likePost', { body: { postId: id }, headers: guestHeaders(b.token, addr) });
  assert.equal(r.json.likes, 7);
  r = await call('likePost', { body: { postId: id, active: false }, headers: guestHeaders(a.token, addr) });
  assert.equal(r.json.likes, 6);
  const rec = await readDoc(`post_likes/${id}__${a.uid}`);
  assert.equal(rec.active, false);
  assert.equal(rec.userId, a.uid);
});

test('guest comments always show as "Guest" with no badge; the caller cannot pick a name or id', async () => {
  const id = await post();
  const g = await guestToken();
  const r = await call('commentPost', {
    body: { postId: id, text: 'hi', author: 'Admin', verified: true, avatarUrl: 'javascript:x', commentId: 'c-fixed', replies: 999 },
    headers: guestHeaders(g.token, ip()),
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.comment.author, 'Guest');
  assert.equal(r.json.comment.verified, false);
  assert.equal(r.json.comment.avatarUrl, '');
  assert.notEqual(r.json.comment.id, 'c-fixed');
  const p = await readDoc(`trending_posts/${id}`);
  assert.equal(p.replies, 1);
  assert.equal(p.comments.length, 1);
  const stored = await readDoc(`post_comments/${r.json.comment.id}`);
  assert.equal(stored.author, 'Guest');
  assert.equal(stored.userId, undefined, 'the visitor id is not stored on a public document');
});

test('comment limit: 5 a minute per visitor, the 6th is refused with 429', async () => {
  const id = await post();
  const g = await guestToken();
  const addr = ip();
  for (let i = 0; i < 5; i += 1) {
    const r = await call('commentPost', { body: { postId: id, text: `c${i}` }, headers: guestHeaders(g.token, addr) });
    assert.equal(r.status, 201, `comment ${i + 1}`);
  }
  const sixth = await call('commentPost', { body: { postId: id, text: 'c6' }, headers: guestHeaders(g.token, addr) });
  assert.equal(sixth.status, 429);
  assert.ok(sixth.json.retryAfterSeconds > 0);
  assert.equal((await readDoc(`trending_posts/${id}`)).replies, 5);
});

test('comment limit per IP: 20 a minute from one address, even across visitors', async () => {
  const id = await post();
  const addr = ip();
  for (let v = 0; v < 4; v += 1) {
    const g = await guestToken();
    for (let i = 0; i < 5; i += 1) {
      const r = await call('commentPost', { body: { postId: id, text: `v${v}c${i}` }, headers: guestHeaders(g.token, addr) });
      assert.equal(r.status, 201);
    }
  }
  const g = await guestToken();
  const over = await call('commentPost', { body: { postId: id, text: 'over' }, headers: guestHeaders(g.token, addr) });
  assert.equal(over.status, 429);
});

test('comments are capped at 2,000 characters and empty ones refused', async () => {
  const id = await post();
  const g = await guestToken();
  const r = await call('commentPost', { body: { postId: id, text: 'y'.repeat(5000) }, headers: guestHeaders(g.token, ip()) });
  assert.equal(r.json.comment.text.length, 2000);
  const empty = await call('commentPost', { body: { postId: id, text: '   ' }, headers: guestHeaders(g.token, ip()) });
  assert.equal(empty.status, 400);
});

test('share: counted once per visitor, link always on alterwords.online', async () => {
  const id = await post();
  const g = await guestToken();
  const addr = ip();
  let r = await call('sharePost', { body: { postId: id, shareUrl: 'https://evil.example' }, headers: guestHeaders(g.token, addr) });
  assert.equal(r.json.shares, 1);
  assert.ok(r.json.shareUrl.startsWith('https://alterwords.online/?post='));
  r = await call('sharePost', { body: { postId: id }, headers: guestHeaders(g.token, addr) });
  assert.equal(r.json.shares, 1);
  assert.equal(r.json.counted, false);
});

test('GET on guest endpoints only reads', async () => {
  const id = await post();
  const r = await call('likePost', { method: 'GET', query: `?postId=${id}&action=like` });
  assert.equal(r.status, 405);
  const c = await call('commentPost', { method: 'GET', query: `?postId=${id}&comment=hi` });
  assert.equal(c.status, 405);
  const s = await call('sharePost', { method: 'GET', query: `?postId=${id}` });
  assert.equal(s.status, 405);
  assert.equal((await readDoc(`trending_posts/${id}`)).likes, 5);
  const list = await call('likePost', { method: 'GET' });
  assert.equal(list.status, 200);
});

test('a missing post returns 404 and nothing is created', async () => {
  const g = await guestToken();
  const id = uniq('zz-missing-');
  const r = await call('likePost', { body: { postId: id }, headers: guestHeaders(g.token, ip()) });
  assert.equal(r.status, 404);
  assert.equal(await readDoc(`post_likes/${id}__${g.uid}`), null);
});

test('guests need no Firebase Auth account, and a guest can list only their own likes', async () => {
  const id = await post();
  const a = await guestToken();
  const b = await guestToken();
  const usersBefore = await authUserCount();
  assert.equal((await call('likePost', { body: { postId: id, active: true }, headers: guestHeaders(a.token, ip()) })).status, 200);
  const mineA = await call('likePost', { body: { mine: true }, headers: guestHeaders(a.token, ip()) });
  assert.equal(mineA.status, 200);
  assert.ok(mineA.json.postIds.includes(id));
  const mineB = await call('likePost', { body: { mine: true }, headers: guestHeaders(b.token, ip()) });
  assert.ok(!mineB.json.postIds.includes(id));
  assert.equal(await authUserCount(), usersBefore, 'a guest like must not create a Firebase Auth user');
});
