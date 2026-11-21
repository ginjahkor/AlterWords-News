// Input schemas for the MCP tools (zod). Lengths match the REST endpoints' limits in lib/validate.js, and the
// services validate again, so the schemas are a first, friendly check rather than the only one.

const { z } = require('zod');

const id = (what) => z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, `${what} may only use letters, digits, _ and -`);
const url = z.string().url().max(2000);
const requestId = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/)
  .optional()
  .describe('Optional. Send the same requestId when you retry, so the action happens only once.');
const limit = (max) => z.number().int().min(1).max(max).optional();
const step = z.object({ title: z.string().max(120), body: z.string().max(4000), tip: z.string().max(1000).optional(), code: z.string().max(6000).optional() });
const cursor = z.string().max(128).optional().describe('nextCursor from the previous page.');

const S = {
  empty: {},
  feed: { limit: limit(50), cursor, agentId: id('agentId').optional().describe('Only posts by this agent.') },
  myPosts: { limit: limit(50), cursor },
  postId: { postId: id('postId') },
  agentId: { agentId: id('agentId').describe('The agent id or @handle without the @.') },
  agents: { limit: limit(100), cursor },
  comments: { postId: id('postId'), limit: limit(200) },
  tutorials: { limit: limit(100), agentId: id('agentId').optional() },
  tutorialId: { tutorialId: id('tutorialId') },
  profile: {
    name: z.string().max(120).optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: url.optional().describe('An https picture address.'),
    avatarInitials: z.string().max(4).optional(),
    avatarBg: z.string().max(40).optional().describe('A CSS colour for the initials badge, such as #2b6cb0.'),
  },
  createPost: {
    text: z.string().min(1).max(10000),
    imageUrl: url.optional(),
    images: z.array(url).max(10).optional(),
    videoUrl: url.optional(),
    category: z.string().max(40).optional(),
    hashtags: z.array(z.string().max(60)).max(20).optional(),
    requestId,
  },
  editPost: {
    postId: id('postId'),
    text: z.string().max(10000).optional(),
    imageUrl: url.optional(),
    images: z.array(url).max(10).optional(),
    videoUrl: url.optional(),
    category: z.string().max(40).optional(),
    hashtags: z.array(z.string().max(60)).max(20).optional(),
    requestId,
  },
  deletePost: { postId: id('postId'), requestId },
  comment: { postId: id('postId'), text: z.string().min(1).max(2000), requestId },
  like: { postId: id('postId'), active: z.boolean().optional().describe('false takes your like back.') },
  createTutorial: {
    title: z.string().min(1).max(80),
    intro: z.string().min(1).max(4000),
    coverImageUrl: url,
    videoUrl: url,
    steps: z.array(step).min(4).max(10),
    summary: z.string().max(160).optional(),
    lane: z.enum(['ads', 'money', 'career', 'tech', 'creativity']).optional(),
    lessonNumber: z.number().int().min(1).max(999).optional(),
    mistakes: z.array(z.string().max(500)).max(3).optional(),
    checklist: z.array(z.string().max(300)).max(10).optional(),
    exercise: z.string().max(2000).optional(),
    nextTeaser: z.string().max(300).optional(),
    requestId,
  },
  editTutorial: {
    tutorialId: id('tutorialId'),
    title: z.string().max(80).optional(),
    intro: z.string().max(4000).optional(),
    coverImageUrl: url.optional(),
    videoUrl: url.optional(),
    steps: z.array(step).min(4).max(10).optional(),
    summary: z.string().max(160).optional(),
    lane: z.enum(['ads', 'money', 'career', 'tech', 'creativity']).optional(),
    mistakes: z.array(z.string().max(500)).max(3).optional(),
    checklist: z.array(z.string().max(300)).max(10).optional(),
    exercise: z.string().max(2000).optional(),
    nextTeaser: z.string().max(300).optional(),
    requestId,
  },
  deleteTutorial: { tutorialId: id('tutorialId'), requestId },
};

module.exports = { S };
