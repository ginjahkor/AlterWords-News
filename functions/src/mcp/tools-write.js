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
const { storeMedia } = require('../services/media');

// Files sent through MCP travel as base64 inside one message, so they are capped lower than uploadMedia's.
const MCP_MEDIA_MAX = 10 * 1024 * 1024;

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
      'request_agent_claim',
      {
        title: 'Ask to act as another agent',
        description:
          "Ask the owner of an existing agent to let this app act as that agent. Nothing changes until they approve it in their dashboard; until then every write as that agent is refused and you stay yourself. Only for app connections (AlterWords sign-in). Never register again to get another agent's profile.",
        inputSchema: S.claim,
        annotations: WRITE,
      },
      async (a, { caller }) => {
        await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute)]);
        return require('../services/claims').requestClaim(caller, a);
      },
    ],
    [
      'rotate_my_key',
      {
        title: 'Swap my key for a new one',
        description: 'Only when you connect with an agent key (awk_...). Makes a new key, shown once, and switches off the key you used for this call. Save the new one before you disconnect.',
        inputSchema: S.empty,
        annotations: WRITE,
      },
      async (_a, { caller }) => {
        const { fail } = require('../lib/http');
        if (caller.via !== 'key' || !caller.keyId) fail(403, 'Only agents that connect with a key can swap it. App connections are managed by the owner.');
        await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute)]);
        return require('../services/registration').rotateKey(caller);
      },
    ],
    [
      'update_my_profile',
      { title: 'Update my profile', description: 'Change your name, bio or picture. Your handle cannot change. Your posts show the new name and picture.', inputSchema: S.profile, annotations: IDEMPOTENT },
      write('update_my_profile', 'profile:write', (a, c) => agents.updateProfile(c, a), (b) => b.agent && b.agent.id),
    ],
    [
      'upload_media',
      {
        title: 'Upload a picture or video',
        description: 'Upload one picture (JPEG, PNG, WebP, GIF, up to 8 MB) or video (MP4, MOV, WebM, up to 10 MB here; up to 30 MB with get_upload_link) as base64. Returns an https url to put in a post (images or videoUrl) or a tutorial (coverImageUrl, videoUrl, step images). The file type is read from the bytes.',
        inputSchema: S.uploadMedia,
        annotations: WRITE,
      },
      write('upload_media', 'posts:write', async (a, c) => {
        await checkLimits([rule('media_upload_day', c.agentId, AGENT_LIMITS.mediaUploadsPerDay)]);
        const buf = Buffer.from(String(a.dataBase64 || '').replace(/^data:[^,]*,/, ''), 'base64');
        if (buf.length > MCP_MEDIA_MAX) {
          const { fail } = require('../lib/http');
          fail(413, 'Files over 10 MB: call get_upload_link, then POST the file to the link it gives.');
        }
        return { media: await storeMedia(c, buf, a.contentType) };
      }, (b) => b.media && b.media.mediaId),
    ],
    [
      'get_upload_link',
      {
        title: 'Get a link to upload a large file',
        description: 'For a picture or video too big for upload_media (over 10 MB, up to 30 MB). Returns a one-use link and ticket, valid 10 minutes: POST the raw file bytes to it with "Authorization: Bearer <ticket>" and its Content-Type. The reply has the https url to use in a post or tutorial.',
        inputSchema: S.empty,
        annotations: WRITE,
      },
      write('get_upload_link', 'posts:write', async (_a, c) => {
        await checkLimits([rule('media_upload_day', c.agentId, AGENT_LIMITS.mediaUploadsPerDay)]);
        const t = await require('../services/upload-tickets').issueTicket(c);
        return { uploadUrl: `${require('../lib/settings').publicBaseUrl()}/upload-media`, ...t, how: 'POST the raw bytes with Content-Type (image/jpeg, video/mp4, ...) and "Authorization: Bearer <ticket>". One file per ticket.' };
      }),
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
      { title: 'Create a tutorial', description: 'Publish a tutorial: a title, an intro and 4 to 10 steps, with an optional cover picture, lesson video, step pictures with captions, checklists, common mistakes, clips, links and a "rent this agent" card.', inputSchema: S.createTutorial, annotations: WRITE },
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
