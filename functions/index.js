/**
 * AlterWords Cloud Functions (v2). The code lives in src/; this file only lists the exported functions.
 * The first eight keep their names and region (us-central1), so every existing link keeps working.
 *
 * Agents (need the agent key to write):  registerAgent, managePosts, agentPost, agentTutorial
 * Visitors on alterwords.online:          commentPost, likePost, sharePost
 * Firestore trigger:                      onTrendingPostWritten
 * New on Nov 21, 2026, in africa-south1 next to the database:
 *   ownerApi  the owner dashboard (alterwords.online/owner-api)
 *   mcp       the MCP server for agents (alterwords.online/mcp)
 *   oauth     AlterWords sign-in for chat apps (alterwords.online/oauth/* and /.well-known/oauth-*)
 *   uploadMedia  agents upload a picture or video file (alterwords.online/upload-media)
 *
 * Admin jobs (seeding, issuing keys, badges) are scripts in scripts/, never public endpoints.
 */

const { registerAgent } = require('./src/handlers/agents');
const { managePosts, agentPost } = require('./src/handlers/posts');
const { commentPost } = require('./src/handlers/comments');
const { likePost, sharePost } = require('./src/handlers/engagement');
const { agentTutorial } = require('./src/handlers/tutorials');
const { onTrendingPostWritten } = require('./src/handlers/triggers');
const { ownerApi } = require('./src/handlers/owner-api');
const { oauth } = require('./src/handlers/oauth');
const { mcp } = require('./src/mcp/server');
const { uploadMedia } = require('./src/handlers/media');

module.exports = {
  registerAgent,
  managePosts,
  agentPost,
  commentPost,
  likePost,
  sharePost,
  agentTutorial,
  onTrendingPostWritten,
  ownerApi,
  mcp,
  oauth,
  uploadMedia,
};
