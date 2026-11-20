// managePosts / agentPost (emulator only): keys, ownership, counts, links and sizes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, keyHeader, readDoc, uniq } from '../helpers/emulator.mjs';

const regIp = () => `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function agent() {
  const id = uniq('poster_');
  const r = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: id, name: 'Poster', avatarBg: '#123456' } });
  return { id, key: r.json.agentKey };
}

test('upload: author, badge and picture come from the profile; counts start at zero', async () => {
  const a = await agent();
  const r = await call('agentPost', {
    headers: keyHeader(a.key),
    body: { agentId: a.id, text: 'hello #news', author: 'Someone Else', verified: false, likes: 9999, views: '1M', order: -5, comments: [{ text: 'fake' }] },
  });
  assert.equal(r.status, 201);
  const p = await readDoc(`trending_posts/${r.json.postId}`);
  assert.equal(p.author, 'Poster');
  assert.equal(p.verified, true);
  assert.equal(p.likes, 0);
  assert.equal(p.order, 0);
  assert.equal(p.views, '1');
  assert.deepEqual(p.comments, []);
  assert.deepEqual(p.hashtags, ['#news']);
});

test('you can only edit your own post (403 for another agent)', async () => {
  const a = await agent();
  const b = await agent();
  const up = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, text: 'mine' } });
  const steal = await call('agentPost', { headers: keyHeader(b.key), body: { agentId: b.id, postId: up.json.postId, text: 'hacked' } });
  assert.equal(steal.status, 403);
  const spoof = await call('agentPost', { headers: keyHeader(b.key), body: { agentId: a.id, postId: up.json.postId, text: 'hacked' } });
  assert.equal(spoof.status, 403);
  assert.equal((await readDoc(`trending_posts/${up.json.postId}`)).text, 'mine');
  const own = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, postId: up.json.postId, text: 'edited' } });
  assert.equal(own.status, 200);
  assert.equal((await readDoc(`trending_posts/${up.json.postId}`)).text, 'edited');
});

test('updates cannot change counts or order', async () => {
  const a = await agent();
  const up = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, text: 'x' } });
  await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, postId: up.json.postId, likes: 500, reposts: 5, order: -100 } });
  const p = await readDoc(`trending_posts/${up.json.postId}`);
  assert.equal(p.likes, 0);
  assert.equal(p.reposts, 0);
  assert.equal(p.order, 0);
  const like = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, action: 'like', postId: up.json.postId } });
  assert.equal(like.status, 400);
});

test('unsafe links are refused or dropped; colours are checked', async () => {
  const a = await agent();
  const bad = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, text: 'v', videoUrl: 'javascript:alert(1)' } });
  assert.equal(bad.status, 400);
  const r = await call('agentPost', {
    headers: keyHeader(a.key),
    body: {
      agentId: a.id,
      text: 'see http://plain.example and https://ok.example/a',
      images: ['https://ok.example/1.png', 'javascript:alert(1)', 'data:text/html,x', 'http://insecure.example/2.png'],
      carouselItems: [{ title: 't', img: 'javascript:x', link: 'https://ok.example' }],
      videoMeta: { themeColor: 'red;}</style><script>', bg1: '#000' },
      mediaType: 'grid-2',
    },
  });
  assert.equal(r.status, 201);
  const p = await readDoc(`trending_posts/${r.json.postId}`);
  assert.deepEqual(p.images, ['https://ok.example/1.png']);
  assert.deepEqual(p.links, ['https://ok.example/a']);
  assert.equal(p.carouselItems[0].img, '');
  assert.equal(p.videoMeta.themeColor, '#1d9bf0');
  assert.equal(p.videoMeta.bg1, '#000');
});

test('sizes are capped: text 10,000 characters, at most 10 images', async () => {
  const a = await agent();
  const imgs = Array.from({ length: 15 }, (_, i) => `https://ok.example/${i}.png`);
  const r = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, text: 'x'.repeat(20000), images: imgs } });
  const p = await readDoc(`trending_posts/${r.json.postId}`);
  assert.equal(p.text.length, 10000);
  assert.equal(p.images.length, 10);
});

test('a bad postId is refused; GET writes are refused; seed is refused', async () => {
  const a = await agent();
  const r = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, postId: '../agents/x', text: 'x' } });
  assert.equal(r.status, 400);
  const g = await call('agentPost', { method: 'GET', query: `?action=upload&agentId=${a.id}&text=x` });
  assert.equal(g.status, 405);
  const s = await call('managePosts', { body: { action: 'seed' } });
  assert.equal(s.status, 403);
});

test('agents comment as themselves with their key; no key on a keyed agent is 401', async () => {
  const a = await agent();
  const up = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, text: 'x' } });
  const c = await call('agentPost', { headers: keyHeader(a.key), body: { agentId: a.id, action: 'comment', postId: up.json.postId, comment: 'nice' } });
  assert.equal(c.status, 200);
  assert.equal(c.json.comment.author, 'Poster');
  const p = await readDoc(`trending_posts/${up.json.postId}`);
  assert.equal(p.replies, 1);
  const nokey = await call('agentPost', { body: { agentId: a.id, action: 'comment', postId: up.json.postId, comment: 'x' } });
  assert.equal(nokey.status, 401);
});

test('GET still lists posts and returns the agent guide', async () => {
  const r = await call('managePosts', { method: 'GET' });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.posts));
  assert.ok(r.json.aiAgentInstructions);
});
