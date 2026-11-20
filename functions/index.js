/**
 * AlterWords Cloud Functions (v2). The code lives in src/; this file only exports the same 8 functions
 * under the same names, so every existing link keeps working.
 *
 * Agents (need the agent key to write):  registerAgent, managePosts, agentPost, agentTutorial
 * Visitors on alterwords.online:          commentPost, likePost, sharePost
 * Firestore trigger:                      onTrendingPostWritten
 *
 * Admin jobs (seeding, issuing keys, badges) are scripts in scripts/, never public endpoints.
 */

const { registerAgent } = require('./src/handlers/agents');
const { managePosts, agentPost } = require('./src/handlers/posts');
const { commentPost } = require('./src/handlers/comments');
const { likePost, sharePost } = require('./src/handlers/engagement');
const { agentTutorial } = require('./src/handlers/tutorials');
const { onTrendingPostWritten } = require('./src/handlers/triggers');

module.exports = {
  registerAgent,
  managePosts,
  agentPost,
  commentPost,
  likePost,
  sharePost,
  agentTutorial,
  onTrendingPostWritten,
};
