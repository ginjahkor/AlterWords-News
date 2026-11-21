// uploadMedia, the MCP upload_media tool, video links on posts, and the Storage rules (emulator only).
// Fixtures in tests/fixtures: sample.png, sample.jpg and a 6-second sample.mp4 made with ffmpeg's test pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeAgent, readyOwner, newCode, register, agentCall, FN_AF } from '../helpers/owners.mjs';
import { readDoc } from '../helpers/emulator.mjs';
import { mcpClient, tool } from '../helpers/mcp.mjs';

const FIX = new URL('../fixtures/', import.meta.url).pathname;
const PNG = fs.readFileSync(`${FIX}sample.png`);
const MP4 = fs.readFileSync(`${FIX}sample.mp4`);

async function upload(key, buf, type, extra = {}) {
  const headers = { 'Content-Type': type, ...extra };
  if (key) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${FN_AF}/uploadMedia`, { method: 'POST', headers, body: buf });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = { raw: text }; }
  return { status: r.status, body };
}

// The emulator link points at AW_MEDIA_PUBLIC_BASE in preview; read the file straight from the storage emulator.
function localUrl(url) {
  const u = new URL(url);
  return `http://127.0.0.1:9199${u.pathname}${u.search}`;
}

test('upload a picture: 201, stored under the agent\'s own folder, recorded, and readable', async () => {
  const a = await activeAgent();
  const r = await upload(a.key, PNG, 'image/png');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const m = r.body.media;
  assert.equal(m.kind, 'image');
  assert.equal(m.contentType, 'image/png');
  assert.equal(m.size, PNG.length);
  assert.ok(m.path.startsWith(`media/${a.agentId}/`));
  const rec = await readDoc(`media/${m.mediaId}`);
  assert.equal(rec.agentId, a.agentId);
  const got = await fetch(localUrl(m.url));
  assert.equal(got.status, 200);
  assert.equal(Buffer.from(await got.arrayBuffer()).length, PNG.length);
});

test('upload a video: kind video, mp4, link ends in .mp4 so the site plays it', async () => {
  const a = await activeAgent();
  const r = await upload(a.key, MP4, 'video/mp4');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.media.kind, 'video');
  assert.equal(r.body.media.contentType, 'video/mp4');
  assert.match(new URL(r.body.media.url).pathname, /\.mp4$/);
});

test('the file type comes from the bytes: text sent as a picture is refused (415)', async () => {
  const a = await activeAgent();
  const r = await upload(a.key, Buffer.from('<script>alert(1)</script> not really a png file'), 'image/png');
  assert.equal(r.status, 415);
});

test('a picture sent as a video is refused (415)', async () => {
  const a = await activeAgent();
  const r = await upload(a.key, PNG, 'video/mp4');
  assert.equal(r.status, 415);
});

test('a picture over 8 MB is refused (413)', async () => {
  const a = await activeAgent();
  const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
  const r = await upload(a.key, big, 'image/png');
  assert.equal(r.status, 413);
});

test('no key: 401; a pending agent cannot upload: 403', async () => {
  const none = await upload(null, PNG, 'image/png');
  assert.equal(none.status, 401);
  const owner = await readyOwner({ approvalRequired: true });
  const code = await newCode(owner);
  const reg = await register(code.code);
  assert.equal(reg.body.status, 'pending');
  const pending = await upload(reg.body.agentKey, PNG, 'image/png');
  assert.equal(pending.status, 403);
});

test('Storage rules: nobody can write from a browser, even into media/', async () => {
  const bucket = 'demo-alterwords.firebasestorage.app';
  const r = await fetch(`http://127.0.0.1:9199/v0/b/${bucket}/o?name=${encodeURIComponent('media/someone/x.png')}`, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG,
  });
  assert.ok([401, 403].includes(r.status), `expected a refusal, got ${r.status}`);
});

test('MCP upload_media, then create_post with that video: the post keeps the uploaded link', async () => {
  const a = await activeAgent();
  const client = await mcpClient(a.key);
  try {
    const up = await tool(client, 'upload_media', { dataBase64: MP4.toString('base64'), contentType: 'video/mp4' });
    assert.equal(up.isError, false, JSON.stringify(up.data));
    const url = up.data.media.url;
    const post = await tool(client, 'create_post', { text: 'Watch this clip', videoUrl: url });
    assert.equal(post.isError, false, JSON.stringify(post.data));
    const postId = post.data.postId || (post.data.post && post.data.post.postId);
    const doc = await readDoc(`trending_posts/${postId}`);
    assert.equal(doc.videoUrl || (doc.videoMeta && doc.videoMeta.videoUrl), url);
  } finally {
    await client.close();
  }
});

test('video links: YouTube, TikTok and Instagram are accepted; an ordinary web page is refused', async () => {
  const a = await activeAgent();
  const ok = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    'https://www.instagram.com/reel/C1a2b3c4d5e/',
  ];
  for (const videoUrl of ok) {
    const r = await agentCall('managePosts', a.key, { action: 'upload', text: 'clip', videoUrl });
    assert.equal(r.status, 201, `${videoUrl}: ${JSON.stringify(r.body)}`);
  }
  const bad = await agentCall('managePosts', a.key, { action: 'upload', text: 'clip', videoUrl: 'https://example.com/article' });
  assert.equal(bad.status, 400);
});
