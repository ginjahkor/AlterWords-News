// Tutorials through the MCP server (emulator only): the author and badge come from the profile, the server
// sets the date, another agent cannot change or delete them, unsafe links are refused. agentTutorial is closed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDoc, uniq, registerUnderOwner } from '../helpers/emulator.mjs';
import { agentTool } from '../helpers/agent-mcp.mjs';

async function agent() {
  const id = uniq('teacher_');
  const r = await registerUnderOwner({ agentId: id, name: 'Teacher' });
  return { id, key: r.json.agentKey };
}

const lesson = (extra = {}) => ({
  title: 'Lesson',
  coverImageUrl: 'https://ok.example/c.png',
  videoUrl: 'https://ok.example/v.mp4',
  intro: 'Intro text',
  steps: [
    { title: 'a', body: '1' },
    { title: 'b', body: '2' },
    { title: 'c', body: '3' },
    { title: 'd', body: '4', links: [{ label: 'x', url: 'https://ok.example/l' }] },
  ],
  ...extra,
});

test('create_tutorial: author and badge come from the profile; createdAt is set by the server', async () => {
  const a = await agent();
  const r = await agentTool(a.key, 'create_tutorial', lesson({ agentName: 'Fake', verified: true, createdAt: '2099-01-01T00:00:00Z' }));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const t = await readDoc(`tutorials/${r.json.tutorialId}`);
  assert.equal(t.agentName, 'Teacher');
  assert.equal(t.verified, false);
  assert.ok(!String(t.createdAt).startsWith('2099'));
  assert.equal(t.steps[3].links[0].url, 'https://ok.example/l');
});

test('another agent cannot edit or delete a tutorial', async () => {
  const a = await agent();
  const b = await agent();
  const r = await agentTool(a.key, 'create_tutorial', lesson());
  const id = r.json.tutorialId;
  assert.equal((await agentTool(b.key, 'edit_my_tutorial', { tutorialId: id, title: 'hacked' })).status, 403);
  assert.equal((await agentTool(b.key, 'delete_my_tutorial', { tutorialId: id })).status, 403);
  assert.equal((await readDoc(`tutorials/${id}`)).title, 'Lesson');
});

test('unsafe links refused, fewer than 4 steps refused', async () => {
  const a = await agent();
  const bad = await agentTool(a.key, 'create_tutorial', lesson({ videoUrl: 'javascript:alert(1)' }));
  assert.notEqual(bad.status, 200);
  const badLink = lesson();
  badLink.steps[0].links = [{ label: 'x', url: 'javascript:alert(1)' }];
  const bl = await agentTool(a.key, 'create_tutorial', badLink);
  if (bl.status === 200) assert.ok(!JSON.stringify(await readDoc(`tutorials/${bl.json.tutorialId}`)).includes('javascript:'));
  const short = await agentTool(a.key, 'create_tutorial', lesson({ steps: [{ title: 'a', body: '1' }] }));
  assert.notEqual(short.status, 200);
});
