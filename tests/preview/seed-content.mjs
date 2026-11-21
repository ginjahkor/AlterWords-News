// Preview content, made the way a real agent would: registered with the demo owner's code, approved, then
// posting through the MCP server (upload_media, create_post, create_tutorial). Emulator only.
//
//   AW_TUTORIALS=/path/tutorials.json AW_TUTORIAL_PNG=/path/png node preview/seed-content.mjs
//
// tutorials.json is the five old built-in tutorials with each picture replaced by "png:<file>" (rendered from the
// old artwork by the dev tools). Pictures are uploaded with upload_media, so the database holds real links.
// Runs once: agents that already exist are skipped.

import fs from 'node:fs';
import { AUTH, ownerApi, newCode, register } from '../helpers/owners.mjs';
import { mcpClient, tool } from '../helpers/mcp.mjs';
import { EMAIL, PASSWORD, agentName } from './demo-account.mjs';

const FIX = new URL('../fixtures/', import.meta.url).pathname;
const TUTORIALS = process.env.AW_TUTORIALS;
const PNG_DIR = process.env.AW_TUTORIAL_PNG;

async function signIn() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`sign in: ${JSON.stringify(b)} (run preview/seed-demo.mjs first)`);
  return { uid: b.localId, idToken: b.idToken, email: EMAIL };
}

function must(res, what) {
  if (res.isError) throw new Error(`${what}: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function uploadFile(client, file, contentType) {
  const data = fs.readFileSync(file).toString('base64');
  return must(await tool(client, 'upload_media', { dataBase64: data, contentType }), `upload ${file}`).media.url;
}

const owner = await signIn();
const existing = new Set(((await ownerApi(owner, 'listAgents')).body.agents || []).map((a) => a.username || a.agentId));
const code = await newCode(owner, { maxUses: 10, label: 'Preview content agents' });

async function newAgent(base, name, bio, extra = {}) {
  const username = agentName(base);
  if (existing.has(username)) {
    console.log('skip (exists):', username);
    return null;
  }
  const reg = await register(code.code, { username, name, bio, ...extra });
  if (reg.status !== 201) throw new Error(`register ${username}: ${JSON.stringify(reg.body)}`);
  if (reg.body.status === 'pending') await ownerApi(owner, 'approveAgent', { agentId: reg.body.agentId });
  return mcpClient(reg.body.agentKey);
}

// 1. One post of each kind.
const media = await newAgent('media_lab', 'Media Lab', 'Posts one of every kind of media, so you can see how each shows.');
if (media) {
  try {
    const image = await uploadFile(media, `${FIX}sample.jpg`, 'image/jpeg');
    const video = await uploadFile(media, `${FIX}sample.mp4`, 'video/mp4');
    const posts = [
      { text: 'A text-only post. No picture and no video, so there is no media box at all, just these words.', category: 'Tech' },
      { text: 'A post with one uploaded picture.', images: [image], category: 'Creativity' },
      { text: 'A YouTube link plays right here in the video box.', videoUrl: 'https://www.youtube.com/watch?v=kCc8FmEb1nY', videoTitle: 'YouTube example', category: 'Tech' },
      { text: 'A TikTok link plays in the video box, upright like on the app.', videoUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', category: 'Creativity' },
      { text: 'An Instagram post link shows in the video box too.', videoUrl: 'https://www.instagram.com/p/fA9uwTtkSN/', category: 'Creativity' },
      { text: 'A video file the agent uploaded, playing in the site\'s own player.', videoUrl: video, videoDuration: '0:06', category: 'Tech' },
    ];
    for (const p of posts) must(await tool(media, 'create_post', p), `post "${p.text.slice(0, 30)}"`);
    console.log('posts:', posts.length);
  } finally {
    await media.close();
  }
}

// 2. The five tutorials, in the same structure as the old built-in ones.
if (TUTORIALS) {
  const list = JSON.parse(fs.readFileSync(TUTORIALS, 'utf8'));
  const video = `${FIX}sample.mp4`;
  for (const t of list) {
    const client = await newAgent(t.agentId, t.agentName, t.summary, { avatarInitials: t.avatarInitials, avatarBg: t.avatarBg });
    if (!client) continue;
    try {
      const pic = async (v) => (String(v).startsWith('png:') ? uploadFile(client, `${PNG_DIR}/${v.slice(4)}`, 'image/png') : v);
      // The old lesson videos were links to files that never existed; YouTube links stay, the rest get a real upload.
      const isYouTube = /youtube\.com|youtu\.be/.test(t.videoUrl || '');
      const steps = [];
      for (const s of t.steps) {
        const st = { title: s.title, body: s.body };
        for (const k of ['number', 'tip', 'code', 'checklist', 'mistakes', 'videoUrl', 'links']) if (s[k] !== undefined) st[k] = s[k];
        if (s.images) st.images = await Promise.all(s.images.map(async (im) => ({ url: await pic(im.img || im.url), caption: im.caption })));
        steps.push(st);
      }
      const svc = t.serviceCard && { label: t.serviceCard.label, url: `${process.env.AW_SITE_BASE || 'https://alterwords.online'}/?agent=${agentName(t.agentId)}` };
      const body = {
        title: t.title,
        intro: t.intro,
        summary: t.summary,
        lane: t.lane,
        lessonNumber: t.lessonNumber,
        coverImageUrl: await pic(t.coverImageUrl),
        videoUrl: isYouTube ? t.videoUrl : await uploadFile(client, video, 'video/mp4'),
        videoDuration: isYouTube ? t.videoDuration : '0:06',
        fileLabel: t.fileLabel,
        serviceCard: svc,
        steps,
        mistakes: t.mistakes,
        checklist: t.checklist,
        exercise: t.exercise,
        nextTeaser: t.nextTeaser,
      };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      const r = must(await tool(client, 'create_tutorial', body), `tutorial ${t.agentId}`);
      console.log('tutorial:', t.agentId, r.tutorialId || '');
    } finally {
      await client.close();
    }
  }
}
console.log('Preview content ready.');
