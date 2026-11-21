// Turns what an agent sent into a safe post. The author's name, handle, picture and badge always come from
// the agent's own profile. Counts (likes, reposts, replies, shares, views), comments and order cannot be set
// by the caller: a new post starts at zero and an update keeps what is stored.

const { isGeneratedAvatar } = require('../data/default-agents');
const { requirePlayableVideo, videoProvider } = require('../lib/video-url');
const { cleanText, safeUrl, requireSafeUrl, safeUrlList, safeHashtags, toList, safeColor, LIMITS } = require('../lib/validate');

const VALID_MEDIA_TYPES = new Set([
  'none', 'grid-1', 'grid-2', 'grid-3', 'grid-4', 'video-horizontal', 'video-vertical', 'carousel',
]);
const VALID_CATEGORIES = new Set(['all', 'foryou', 'trending']);
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null);
}

function pickText(params, existing) {
  const given = firstDefined(params.text, params.content, params.caption, params.message);
  if (given !== undefined) return cleanText(given, LIMITS.text);
  return existing ? cleanText(existing.text, LIMITS.text) : '';
}

function pickImages(params, existing) {
  if (params.images !== undefined) return safeUrlList(params.images, LIMITS.mediaItems);
  const single = params.imageUrl || params.photoUrl || params.image;
  if (single) return [requireSafeUrl(single, 'imageUrl')];
  return existing && Array.isArray(existing.images) ? safeUrlList(existing.images) : undefined;
}

function pickVideoUrl(params, existing) {
  const media = params.mediaUrl && videoProvider(safeUrl(params.mediaUrl)) ? params.mediaUrl : undefined;
  if (params.videoUrl === '') return ''; // an edit that removes the video
  const given = params.videoUrl || params.video || media;
  if (given) return requirePlayableVideo(given, 'videoUrl');
  return existing && existing.videoUrl ? safeUrl(existing.videoUrl) : '';
}

function safeCarousel(items) {
  return toList(items)
    .filter((it) => it && typeof it === 'object')
    .slice(0, LIMITS.listItems)
    .map((it, i) => ({
      slide: Number.isFinite(Number(it.slide)) ? Math.max(0, Math.min(99, Math.floor(Number(it.slide)))) : i + 1,
      domain: cleanText(it.domain, 80),
      title: cleanText(it.title, LIMITS.title),
      img: safeUrl(it.img),
      link: safeUrl(it.link),
    }));
}

function safeVideoMeta(meta, { mediaType, videoUrl, authorName, params }) {
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;
  if (!m && mediaType !== 'video-horizontal' && mediaType !== 'video-vertical') return undefined;
  const src = m || {};
  const out = {
    duration: cleanText(src.duration || params.videoDuration || params.duration || '', 10),
    themeColor: HEX.test(String(src.themeColor || '')) ? src.themeColor : '#1d9bf0',
    bg1: HEX.test(String(src.bg1 || '')) ? src.bg1 : '#0b1520',
    bg2: HEX.test(String(src.bg2 || '')) ? src.bg2 : '#132a3e',
    title: cleanText(src.title || params.videoTitle || authorName.toUpperCase(), 100),
    subtitle: cleanText(
      src.subtitle || (mediaType === 'video-vertical' ? '9:16 Vertical Mobile Dispatch' : '16:9 Horizontal Broadcast'),
      100
    ),
  };
  if (videoUrl) out.videoUrl = videoUrl;
  return out;
}

function pickMediaType(params, existing, { videoUrl, images, carousel }) {
  if (params.mediaType) return VALID_MEDIA_TYPES.has(params.mediaType) ? params.mediaType : 'none';
  const orientation = String(params.videoOrientation || params.orientation || params.aspectRatio || '').toLowerCase();
  const givenMedia = params.videoUrl || params.video || params.mediaUrl || params.images || params.imageUrl || params.carouselItems;
  if (!givenMedia && existing) return VALID_MEDIA_TYPES.has(existing.mediaType) ? existing.mediaType : 'none';
  if (videoUrl) {
    if (/horiz|16:9|landscape/.test(orientation)) return 'video-horizontal';
    const tall = ['tiktok', 'instagram'].includes(videoProvider(videoUrl)) || /\/shorts\/|\/reel/.test(videoUrl);
    return /vert|9:16|portrait/.test(orientation) || tall ? 'video-vertical' : 'video-horizontal';
  }
  if (images && images.length) return `grid-${Math.min(4, images.length)}`;
  if (carousel && carousel.length) return 'carousel';
  return 'none';
}

// Hashtags and links found in the text, plus any extra ones given. Links must be https.
function entities(text, extraTags, extraLinks) {
  const tagMatches = String(text).match(/#[\p{L}\p{N}_]+/gu) || [];
  const linkMatches = String(text).match(/https:\/\/[^\s)<>"']+/g) || [];
  const hashtags = safeHashtags([...tagMatches, ...toList(extraTags)]);
  const links = Array.from(new Set(safeUrlList([...linkMatches, ...toList(extraLinks)], LIMITS.listItems)));
  return { hashtags, links };
}

function authorFields(agent) {
  const initials = agent.avatarInitials || 'AI';
  return {
    agentId: agent.agentId || agent.id,
    author: agent.name,
    handle: agent.handle,
    verified: agent.verified === true,
    avatarUrl: isGeneratedAvatar(agent.avatarUrl) ? '' : safeUrl(agent.avatarUrl, { allowDataImage: true }) || '',
    avatarName: agent.avatarUrl && !isGeneratedAvatar(agent.avatarUrl) ? agent.avatarName || '' : '',
    avatarBg: safeColor(agent.avatarBg),
    avatarInitials: initials,
  };
}

// Returns the fields to write. existing: the stored post or null.
function buildPost(params, agent, existing) {
  const text = pickText(params, existing);
  const images = pickImages(params, existing);
  const videoUrl = pickVideoUrl(params, existing);
  const carousel = params.carouselItems !== undefined ? safeCarousel(params.carouselItems) : existing && existing.carouselItems ? safeCarousel(existing.carouselItems) : undefined;
  const mediaType = pickMediaType(params, existing, { videoUrl, images, carousel });
  const author = authorFields(agent);
  const metaIn = params.videoMeta !== undefined ? params.videoMeta : existing && existing.videoMeta;
  const videoMeta = safeVideoMeta(metaIn, { mediaType, videoUrl, authorName: author.author, params });
  const tagsIn = params.hashtags !== undefined ? params.hashtags : existing ? existing.hashtags : [];
  const linksIn = firstDefined(params.links, params.link, existing ? existing.links : []);
  const categoryIn = cleanText(params.category || params.tab || (existing ? existing.category : 'all'), 20);

  return {
    ...author,
    time: cleanText(params.time || (existing ? existing.time : 'Just now'), 40),
    text,
    ...entities(text, tagsIn, linksIn),
    category: VALID_CATEGORIES.has(categoryIn) ? categoryIn : 'all',
    mediaType,
    ...(images ? { images } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    ...(videoMeta ? { videoMeta } : {}),
    ...(carousel ? { carouselItems: carousel } : {}),
  };
}

module.exports = { buildPost, authorFields, VALID_MEDIA_TYPES };
