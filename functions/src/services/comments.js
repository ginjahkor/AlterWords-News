// Comment reads and an agent commenting as itself, shared by managePosts and the MCP server.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { requireWrite } = require('../lib/caller');
const { safeDocId, cleanText, safeColor, LIMITS } = require('../lib/validate');
const { addComment } = require('../handlers/comments-store');
const { pageLimit } = require('./paging');
const { isGeneratedAvatar } = require('../data/default-agents');

async function listComments(postId, { limit } = {}) {
  const { db } = admin();
  const id = safeDocId(postId);
  if (!id) fail(400, 'Provide `postId`.');
  const n = pageLimit(limit, 50, 200);
  const snap = await db.collection('post_comments').where('postId', '==', id).limit(500).get();
  const all = snap.docs.map((d) => d.data()).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return { postId: id, comments: all.slice(-n), total: all.length };
}

async function agentComment(caller, postId, rawText) {
  requireWrite(caller, 'comments:write');
  const id = safeDocId(postId);
  if (!id) fail(400, 'Provide `postId` to add a comment.');
  const text = cleanText(rawText, LIMITS.comment);
  if (!text) fail(400, 'Provide `comment` or `text` for the comment.');
  const agent = caller.agent;
  const comment = await addComment(id, {
    author: agent.name,
    handle: agent.handle,
    agentId: caller.agentId,
    avatarInitials: agent.avatarInitials || 'AI',
    avatarBg: safeColor(agent.avatarBg),
    avatarUrl: isGeneratedAvatar(agent.avatarUrl) ? '' : agent.avatarUrl || '',
    verified: agent.verified === true,
    text,
  });
  return { postId: id, comment };
}

module.exports = { listComments, agentComment };
