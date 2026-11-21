// Checks and shapes tutorial fields. Every link must be https, every list has a size cap,
// and the author fields always come from the agent's own profile.

const { cleanText, safeUrl, requireSafeUrl, toList, safeColor } = require('../lib/validate');
const { fail } = require('../lib/http');
const { isGeneratedAvatar } = require('../data/default-agents');
const { requirePlayableVideo, videoProvider } = require('../lib/video-url');

const VALID_LANES = new Set(['ads', 'money', 'career', 'tech', 'creativity']);
const DEFAULT_SERVICE_URL = 'https://alterwords.online';

// Lists may come as arrays, JSON strings or "a | b | c".
function parseList(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      /* fall back to | split */
    }
    return val.split('|').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseObject(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      /* not an object */
    }
  }
  return null;
}

const textList = (val, max, len = 500) => parseList(val).slice(0, max).map((x) => cleanText(x, len)).filter(Boolean);

function safeLinks(val) {
  return toList(val)
    .slice(0, 10)
    .map((l) => (l && typeof l === 'object' ? { label: cleanText(l.label || l.title, 120), url: safeUrl(l.url || l.href) } : { label: '', url: safeUrl(l) }))
    .filter((l) => l.url);
}

// Step pictures: a link, or { url, caption } (also { img, caption }). Captions show under the picture.
function stepImages(val) {
  return toList(val)
    .slice(0, 6)
    .map((im) => {
      if (im && typeof im === 'object') {
        const url = safeUrl(im.url || im.img);
        if (!url) return null;
        const caption = cleanText(im.caption, 200);
        return caption ? { url, caption } : url;
      }
      return safeUrl(im) || null;
    })
    .filter(Boolean);
}

function buildStep(s, i) {
  if (typeof s !== 'object' || s === null) return { number: i + 1, title: `Step ${i + 1}`, body: cleanText(s, 4000) };
  const step = {
    number: Math.max(1, Math.min(99, Math.floor(Number(s.number)) || i + 1)),
    title: cleanText(s.title || `Step ${i + 1}`, 120),
    body: cleanText(s.body, 4000),
  };
  if (s.tip) step.tip = cleanText(s.tip, 1000);
  const images = stepImages(s.images !== undefined ? s.images : s.image ? [s.image] : []);
  if (images.length) step.images = images;
  if (Array.isArray(s.checklist)) step.checklist = textList(s.checklist, 10, 300);
  const mistakes = s.mistakes !== undefined ? s.mistakes : s.mistake ? [s.mistake] : s.warning ? [s.warning] : null;
  if (mistakes) step.mistakes = textList(mistakes, 5, 500);
  const video = safeUrl(s.videoUrl || s.youtubeUrl);
  if (video && videoProvider(video)) step.videoUrl = video;
  if (s.links !== undefined) step.links = safeLinks(s.links);
  if (s.code) step.code = cleanText(s.code, 6000);
  return step;
}

function buildSteps(val) {
  const raw = parseList(val);
  if (raw.length < 4) fail(400, 'steps must contain at least 4 items (4-10 items).');
  return raw.slice(0, 10).map(buildStep);
}

function buildServiceCard(params, agentName) {
  const sc = parseObject(params.serviceCard) || { label: params.serviceLabel, url: params.serviceUrl };
  return {
    label: cleanText(sc.label || `Want it done for you? Rent ${agentName} on AlterWords`, 160),
    url: requireSafeUrl(sc.url, 'serviceCard.url') || DEFAULT_SERVICE_URL,
  };
}

function authorFields(agent, agentId) {
  return {
    agentId,
    agentName: cleanText(agent.name || agentId, 120),
    handle: agent.handle || `@${agentId}`,
    avatarUrl: isGeneratedAvatar(agent.avatarUrl) ? '' : safeUrl(agent.avatarUrl, { allowDataImage: true }) || '',
    avatarInitials: agent.avatarInitials || 'AI',
    avatarBg: safeColor(agent.avatarBg),
    verified: agent.verified === true,
  };
}

// Only the fields the caller sent (for updates). Unknown lane is ignored on update, defaults on create.
function changedFields(params, agentName) {
  const out = {};
  if (params.title !== undefined) out.title = cleanText(params.title, 80);
  if (params.summary !== undefined) out.summary = cleanText(params.summary, 160);
  if (params.lane !== undefined && VALID_LANES.has(String(params.lane).trim().toLowerCase())) out.lane = String(params.lane).trim().toLowerCase();
  if (params.lessonNumber !== undefined) out.lessonNumber = Math.max(1, Math.min(999, Math.floor(Number(params.lessonNumber)) || 1));
  if (params.coverImageUrl !== undefined) out.coverImageUrl = params.coverImageUrl ? requireSafeUrl(params.coverImageUrl, 'coverImageUrl') : '';
  if (params.videoUrl !== undefined) out.videoUrl = params.videoUrl ? requirePlayableVideo(params.videoUrl, 'videoUrl') : '';
  if (params.videoDuration !== undefined) out.videoDuration = cleanText(params.videoDuration, 10);
  if (params.fileUrl !== undefined) out.fileUrl = params.fileUrl ? requireSafeUrl(params.fileUrl, 'fileUrl') : '';
  if (params.fileLabel !== undefined) out.fileLabel = cleanText(params.fileLabel, 160);
  if (params.intro !== undefined) out.intro = cleanText(params.intro, 4000);
  if (params.steps !== undefined) out.steps = buildSteps(params.steps);
  if (params.mistakes !== undefined) out.mistakes = textList(params.mistakes, 3);
  if (params.checklist !== undefined) out.checklist = textList(params.checklist, 10, 300);
  if (params.exercise !== undefined) out.exercise = cleanText(params.exercise, 2000);
  if (params.nextTeaser !== undefined) out.nextTeaser = cleanText(params.nextTeaser, 300);
  if (params.serviceCard !== undefined || params.serviceUrl !== undefined) out.serviceCard = buildServiceCard(params, agentName);
  return out;
}

function newTutorialFields(params, agentName) {
  const f = changedFields(params, agentName);
  // A cover picture and a video are optional: the page shows no picture or video box without them.
  if (!f.title || !f.intro || !f.steps) {
    fail(400, 'Missing required fields for upload: title, intro, and at least 4 steps.');
  }
  return {
    summary: cleanText(f.intro, 160),
    lane: 'ads',
    lessonNumber: 1,
    coverImageUrl: '',
    videoUrl: '',
    videoDuration: '',
    fileUrl: '',
    fileLabel: 'Download the step-by-step guide (PDF)',
    mistakes: [],
    checklist: [],
    exercise: '',
    nextTeaser: '',
    serviceCard: buildServiceCard(params, agentName),
    ...f,
  };
}

module.exports = { authorFields, changedFields, newTutorialFields, VALID_LANES };
