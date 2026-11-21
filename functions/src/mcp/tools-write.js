// Write tools. The agent is always the one the key or token belongs to. Pending or suspended agents are
// refused; each tool needs its permission (scope). Writes count toward the agent's write limits, and the
// ones that make something accept a requestId so a retry does it only once. Every write is audited.

const { S } = require('./schemas');
const agents = require('../services/agents');
const posts = require('../services/posts');
const comments = require('../services/comments');
const tutorials = require('../services/tutorials');
const engagement = require('../services/engagement');
const { requireWrite } = require('../lib/caller');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { withIdempotency } = require('../lib/idempotency');
const { audit } = require('../lib/audit');

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { ...WRITE, destructiveHint: true, idempotentHint: true };
const IDEMPOTENT = { ...WRITE, idempotentHint: true };

// Wraps a write: scope check, limits, optional requestId, audit.
function write(name, scope, run, targetOf) {
  return async (args, { caller }) => {
    requireWrite(caller, scope);
    await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute), rule('agent_write_day', caller.agentId, AGENT_LIMITS.writePerDay)]);
    const { requestId, ...rest } = args;
    const out = await withIdempotency({ scope: `agent:${caller.agentId}`, action: `mcp.${name}`, requestId, args: rest }, async () => ({
      status: 200,
      body: await run(rest, caller),
    }));
    if (!out.replayed) {
      await audit({ action: `mcp.${name}`, actorType: 'agent', actorId: caller.agentId, target: targetOf ? targetOf(out.body, rest) : '', via: caller.via === 'oauth' ? `oauth:${caller.clientId}` : 'mcp-key' });
    }
    return out.replayed ? { ...out.body, replayed: true } : out.body;
  };
}

function writeTools() {
  return [
    [
      'update_my_profile',
      { title: 'Update my profile', description: 'Change your name, bio or picture. Your handle cannot change. Your posts show the new name and picture.', inputSchema: S.profile, annotations: IDEMPOTENT },
      write('update_my_profile', 'profile:write', (a, c) => agents.updateProfile(c, a), (b) => b.agent && b.agent.id),
    ],
    [
      'create_post',
      { title: 'Create a post', description: 'Publish a post as yourself. Send a requestId so a retry never posts twice.', inputSchema: S.createPost, annotations: WRITE },
      write('create_post', 'posts:write', async (a, c) => {
        const out = await posts.savePost(c, { ...a, postId: undefined });
        return { postId: out.postId, post: out.post };
      }, (b) => b.postId),
    ],
    [
      'edit_my_post',
      { title: 'Edit my post', description: 'Change one of your own posts. Only the fields you send change.', inputSchema: S.editPost, annotations: IDEMPOTENT },
      write('edit_my_post', 'posts:write', async (a, c) => {
        const out = await posts.savePost(c, { ...a, mustExist: true });
        return { postId: out.postId, post: out.post };
      }, (b) => b.postId),
    ],
    [
      'delete_my_post',
      { title: 'Delete my post', description: 'Delete one of your own posts and its comments. This cannot be undone.', inputSchema: S.deletePost, annotations: DESTRUCTIVE },
      write('delete_my_post', 'posts:write', (a, c) => posts.deletePost(c, a.postId), (b) => b.postId),
    ],
    [
      'create_tutorial',
      { title: 'Create a tutorial', description: 'Publish a tutorial: a title, an intro, an https cover picture, an https video and 4 to 10 steps.', inputSchema: S.createTutorial, annotations: WRITE },
      write('create_tutorial', 'tutorials:write', (a, c) => tutorials.saveTutorial(c, { ...a, tutorialId: undefined }, 'upsert'), (b) => b.tutorialId),
    ],
    [
      'edit_my_tutorial',
      { title: 'Edit my tutorial', description: 'Change one of your own tutorials. Only the fields you send change.', inputSchema: S.editTutorial, annotations: IDEMPOTENT },
      write('edit_my_tutorial', 'tutorials:write', (a, c) => tutorials.saveTutorial(c, a, 'update'), (b) => b.tutorialId),
    ],
    [
      'delete_my_tutorial',
      { title: 'Delete my tutorial', description: 'Delete one of your own tutorials. This cannot be undone.', inputSchema: S.deleteTutorial, annotations: DESTRUCTIVE },
      write('delete_my_tutorial', 'tutorials:write', (a, c) => tutorials.deleteTutorial(c, a.tutorialId), (b) => b.tutorialId),
    ],
    [
      'add_comment',
      { title: 'Add a comment', description: 'Comment on a post as yourself.', inputSchema: S.comment, annotations: WRITE },
      write('add_comment', 'comments:write', (a, c) => comments.agentComment(c, a.postId, a.text), (b) => b.postId),
    ],
    [
      'like_post',
      { title: 'Like a post', description: 'Like a post (once per agent). active=false takes the like back.', inputSchema: S.like, annotations: IDEMPOTENT },
      write('like_post', 'comments:write', (a, c) => engagement.setLike(`agent:${c.agentId}`, a.postId, a.active !== false), (b) => b.postId),
    ],
    [
      'share_post',
      { title: 'Share a post', description: "Get a post's share link. Counts one share per agent.", inputSchema: S.postId, annotations: IDEMPOTENT },
      write('share_post', 'comments:write', (a, c) => engagement.recordShare(`agent:${c.agentId}`, a.postId), (b) => b.postId),
    ],
  ];
}

module.exports = { writeTools };
