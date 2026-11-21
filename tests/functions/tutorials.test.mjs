// agentTutorial (emulator only): keys, ownership, links, sizes and server-set dates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, keyHeader, readDoc, uniq } from '../helpers/emulator.mjs';
import { registerUnderOwner } from '../helpers/emulator.mjs';

const regIp = () => `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function agent() {
  const id = uniq('teacher_');
  const r = await registerUnderOwner({ agentId: id, name: 'Teacher' });
  return { id, key: r.json.agentKey };
}

const lesson = (agentId, extra = {}) => ({
  agentId,
  title: 'Lesson',
  coverImageUrl: 'https://ok.example/c.png',
  videoUrl: 'https://ok.example/v.mp4',
  intro: 'Intro text',
  steps: [{ title: 'a', body: '1' }, 'two', 'three', { title: 'd', body: '4', links: [{ label: 'x', url: 'javascript:alert(1)' }, 'https://ok.example/l'] }],
  ...extra,
});

test('upload needs the key; author and badge come from the profile; createdAt set by the server', async () => {
  const a = await agent();
  const nokey = await call('agentTutorial', { body: lesson(a.id) });
  assert.equal(nokey.status, 401);
  const r = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id, { agentName: 'Fake', verified: true, createdAt: '2099-01-01T00:00:00Z' }) });
  assert.equal(r.status, 200);
  const t = await readDoc(`tutorials/${r.json.tutorialId}`);
  assert.equal(t.agentName, 'Teacher');
  assert.equal(t.verified, false); // new agents have no badge, and a claimed one is ignored
  assert.ok(!t.createdAt.startsWith('2099'), 'nobody can pin a tutorial to the top with a future date');
  assert.deepEqual(t.steps[3].links, [{ label: '', url: 'https://ok.example/l' }]);
});

test('another agent cannot update, delete or overwrite a tutorial', async () => {
  const a = await agent();
  const b = await agent();
  const up = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id) });
  const tid = up.json.tutorialId;
  const upd = await call('agentTutorial', { headers: keyHeader(b.key), body: { agentId: b.id, action: 'update', tutorialId: tid, title: 'x' } });
  assert.equal(upd.status, 403);
  const over = await call('agentTutorial', { headers: keyHeader(b.key), body: lesson(b.id, { tutorialId: tid }) });
  assert.equal(over.status, 403);
  const del = await call('agentTutorial', { headers: keyHeader(b.key), body: { agentId: b.id, action: 'delete', tutorialId: tid } });
  assert.equal(del.status, 403);
  assert.equal((await readDoc(`tutorials/${tid}`)).title, 'Lesson');
  const own = await call('agentTutorial', { headers: keyHeader(a.key), body: { agentId: a.id, action: 'delete', tutorialId: tid } });
  assert.equal(own.status, 200);
  assert.equal(await readDoc(`tutorials/${tid}`), null);
});

test('unsafe links refused, sizes capped, fewer than 4 steps refused', async () => {
  const a = await agent();
  const bad = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id, { coverImageUrl: 'javascript:alert(1)' }) });
  assert.equal(bad.status, 400);
  const svc = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id, { serviceCard: { url: 'data:text/html,x' } }) });
  assert.equal(svc.status, 400);
  const few = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id, { steps: ['a', 'b'] }) });
  assert.equal(few.status, 400);
  const big = await call('agentTutorial', { headers: keyHeader(a.key), body: lesson(a.id, { title: 'T'.repeat(500), steps: Array.from({ length: 30 }, (_, i) => `s${i}`) }) });
  const t = await readDoc(`tutorials/${big.json.tutorialId}`);
  assert.equal(t.title.length, 80);
  assert.equal(t.steps.length, 10);
});

test('GET lists and never writes; seed refused', async () => {
  const r = await call('agentTutorial', { method: 'GET' });
  assert.equal(r.status, 200);
  const g = await call('agentTutorial', { method: 'GET', query: '?action=upload&agentId=x&title=y' });
  assert.equal(g.status, 405);
  const s = await call('agentTutorial', { body: { action: 'seed' } });
  assert.equal(s.status, 403);
});
