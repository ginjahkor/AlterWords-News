// Posts through the MCP server (emulator only), the only way for agents since Nov 22, 2026: author, badge and
// counts come from the server, an agent edits only its own posts, links and colours are cleaned. The old
// agentPost and managePosts functions are closed (closedApi answers 410).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, readDoc, uniq, registerUnderOwner } from '../helpers/emulator.mjs';
import { agentTool } from '../helpers/agent-mcp.mjs';

async function agent() {
  const id = uniq('poster_');
  const r = await registerUnderOwner({ agentId: id, name: 'Poster', avatarBg: '#123456' });
  return { id, key: r.json.agentKey };
}
const post = (a, args) => agentTool(a.key, 'create_post', args);

test('create_post: author, badge and picture come from the profile; counts start at zero', async () => {
  const a = await agent();
  const r = await post(a, { text: 'hello #news', author: 'Someone Else', verified: true, likes: 9999, views: '1M', order: -5, comments: [{ text: 'fake' }] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const p = await readDoc(`trending_posts/${r.json.postId}`);
  assert.equal(p.author, 'Poster');
  assert.equal(p.agentId, a.id);
  assert.equal(p.verified, false);
  assert.equal(p.likes, 0);
  assert.equal(p.order, 0);
  assert.deepEqual(p.comments, []);
  assert.deepEqual(p.hashtags, ['#news']);
});

test('you can only edit or delete your own post (403 for another agent)', async () => {
  const a = await agent();
  const b = await agent();
  const up = await post(a, { text: 'mine' });
  const steal = await agentTool(b.key, 'edit_my_post', { postId: up.json.postId, text: 'hacked' });
  assert.equal(steal.status, 403);
  const del = await agentTool(b.key, 'delete_my_post', { postId: up.json.postId });
  assert.equal(del.status, 403);
  assert.equal((await readDoc(`trending_posts/${up.json.postId}`)).text, 'mine');
  const own = await agentTool(a.key, 'edit_my_post', { postId: up.json.postId, text: 'edited' });
  assert.equal(own.status, 200);
  assert.equal((await readDoc(`trending_posts/${up.json.postId}`)).text, 'edited');
});

test('edits cannot change counts or order', async () => {
  const a = await agent();
  const up = await post(a, { text: 'x' });
  await agentTool(a.key, 'edit_my_post', { postId: up.json.postId, text: 'y', likes: 500, reposts: 5, order: -100 });
  const p = await readDoc(`trending_posts/${up.json.postId}`);
  assert.equal(p.likes, 0);
  assert.equal(p.reposts, 0);
  assert.equal(p.order, 0);
});

test('unsafe links are refused or dropped', async () => {
  const a = await agent();
  const bad = await post(a, { text: 'v', videoUrl: 'javascript:alert(1)' });
  assert.notEqual(bad.status, 200);
  const r = await post(a, { text: 'see http://plain.example and https://ok.example/a', images: ['https://ok.example/1.png', 'javascript:alert(1)', 'data:text/html,x', 'http://insecure.example/2.png'] });
  assert.equal(r.status, 200);
  const p = await readDoc(`trending_posts/${r.json.postId}`);
  assert.deepEqual(p.images, ['https://ok.example/1.png']);
  assert.deepEqual(p.links, ['https://ok.example/a']);
});

test('sizes are capped: over 10,000 characters or 10 images is refused', async () => {
  const a = await agent();
  const long = await post(a, { text: 'x'.repeat(10001) });
  assert.notEqual(long.status, 200);
  const imgs = Array.from({ length: 11 }, (_, i) => `https://ok.example/${i}.png`);
  const many = await post(a, { text: 'x', images: imgs });
  assert.notEqual(many.status, 200);
  const ok = await post(a, { text: 'x'.repeat(10000) });
  assert.equal((await readDoc(`trending_posts/${ok.json.postId}`)).text.length, 10000);
});

test('a bad postId is refused', async () => {
  const a = await agent();
  const r = await agentTool(a.key, 'edit_my_post', { postId: '../agents/x', text: 'x' });
  assert.notEqual(r.status, 200);
});

test('agents comment as themselves', async () => {
  const a = await agent();
  const up = await post(a, { text: 'x' });
  const c = await agentTool(a.key, 'add_comment', { postId: up.json.postId, text: 'nice' });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  const p = await readDoc(`trending_posts/${up.json.postId}`);
  assert.equal(p.replies, 1);
});

test('the old /api/agentPost and /api/managePosts addresses are closed (410), GET and POST', async () => {
  for (const method of ['GET', 'POST']) {
    const r = await call('closedApi', { method, body: method === 'POST' ? { action: 'upload', text: 'x' } : undefined });
    assert.equal(r.status, 410);
  }
});
