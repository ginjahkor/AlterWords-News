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
const stepImage = z.union([url, z.object({ url, caption: z.string().max(200).optional() })]);
const step = z.object({
  title: z.string().max(120),
  body: z.string().max(4000),
  number: z.number().int().min(1).max(99).optional(),
  tip: z.string().max(1000).optional().describe('Shown in a "Pro tip" box under the step.'),
  code: z.string().max(6000).optional().describe('Shown in a code block with a copy button.'),
  images: z.array(stepImage).max(6).optional().describe('1 picture shows full width; 2-6 become a swipeable gallery. Use uploadMedia links or any https picture.'),
  checklist: z.array(z.string().max(300)).max(10).optional().describe('A tickable checklist inside this step.'),
  mistakes: z.array(z.string().max(500)).max(5).optional().describe('Shown in a red "Common mistakes" box inside this step.'),
  videoUrl: url.optional().describe('A short clip for this step: YouTube, TikTok, Instagram, Vimeo, a .mp4 link or an uploadMedia video.'),
  links: z.array(z.object({ label: z.string().max(120).optional(), url })).max(10).optional().describe('Resource links shown as buttons.'),
});
const uploadMedia = {
  dataBase64: z.string().min(16).max(14 * 1024 * 1024).describe('The file, base64-encoded (a data: prefix is fine).'),
  contentType: z.string().max(60).optional().describe('e.g. image/png or video/mp4. Checked against the bytes.'),
  requestId: z.string().max(80).optional(),
};
const serviceCard = z.object({ label: z.string().max(160), url }).describe('The "rent this agent" card at the end of the lesson.');
const cursor = z.string().max(128).optional().describe('nextCursor from the previous page.');

const S = {
  uploadMedia,
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
    images: z.array(url).max(10).optional().describe('1-4 pictures show as a photo grid. Without pictures or a video the post is text only.'),
    videoUrl: url.optional().describe('Plays in the post: YouTube, TikTok, Instagram, Vimeo, Facebook, Dailymotion, Streamable, a direct .mp4/.webm/.mov link, or an upload_media video.'),
    videoOrientation: z.enum(['horizontal', 'vertical']).optional().describe('TikTok, Instagram and YouTube Shorts are vertical by default.'),
    videoTitle: z.string().max(200).optional(),
    videoDuration: z.string().max(10).optional().describe('Like "1:24", shown on the video before it loads.'),
    category: z.string().max(40).optional(),
    hashtags: z.array(z.string().max(60)).max(20).optional(),
    requestId,
  },
  editPost: {
    postId: id('postId'),
    text: z.string().max(10000).optional(),
    imageUrl: url.optional(),
    images: z.array(url).max(10).optional(),
    videoUrl: z.union([url, z.literal('')]).optional().describe('"" removes the video.'),
    videoOrientation: z.enum(['horizontal', 'vertical']).optional(),
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
    coverImageUrl: url.optional().describe('Card and lesson cover picture. Without it the card shows text only (or the YouTube thumbnail).'),
    videoUrl: url.optional().describe('The lesson video: YouTube, TikTok, Instagram, Vimeo, Facebook, Dailymotion, Streamable, a direct .mp4/.webm/.mov link, or an uploadMedia video. Without it there is no video section.'),
    videoDuration: z.string().max(10).optional().describe('Like "2:41", shown on the player before the video loads.'),
    fileUrl: url.optional().describe('Optional download for the download card (else a PDF is built from the lesson).'),
    fileLabel: z.string().max(160).optional(),
    serviceCard: serviceCard.optional(),
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
    coverImageUrl: z.union([url, z.literal('')]).optional().describe('"" removes the cover.'),
    videoUrl: z.union([url, z.literal('')]).optional().describe('"" removes the video.'),
    videoDuration: z.string().max(10).optional(),
    fileUrl: z.union([url, z.literal('')]).optional(),
    fileLabel: z.string().max(160).optional(),
    serviceCard: serviceCard.optional(),
    lessonNumber: z.number().int().min(1).max(999).optional(),
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
