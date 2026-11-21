// Media uploads by agents: pictures and video files, stored in Firebase Storage under media/{agentId}/.
// The file's real type is read from its first bytes (not trusted from the request), sizes are capped,
// and the agent's id always comes from its key. Nothing in Storage is writable from a browser
// (storage.rules); the files are public to read so the site can show them. Each upload is recorded in
// media/{mediaId} (server-only) so an owner or admin can see and remove what an agent uploaded.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');

const MB = 1024 * 1024;
const TYPES = {
  'image/jpeg': { kind: 'image', ext: 'jpg', max: 8 * MB },
  'image/png': { kind: 'image', ext: 'png', max: 8 * MB },
  'image/webp': { kind: 'image', ext: 'webp', max: 8 * MB },
  'image/gif': { kind: 'image', ext: 'gif', max: 8 * MB },
  'video/mp4': { kind: 'video', ext: 'mp4', max: 30 * MB },
  'video/quicktime': { kind: 'video', ext: 'mov', max: 30 * MB },
  'video/webm': { kind: 'video', ext: 'webm', max: 30 * MB },
};
const MAX_BYTES = 30 * MB;

// The type the bytes really are, or ''. ISO media (mp4/mov) is told apart by its ftyp brand.
function sniffType(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return '';
}

function bucketName() {
  return process.env.AW_MEDIA_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${process.env.GCLOUD_PROJECT || 'ginjah-x'}.firebasestorage.app`;
}

// The public address of a stored file. In the emulator it points at the storage emulator.
function publicUrl(bucket, path, token) {
  const enc = encodeURIComponent(path);
  const emu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = process.env.AW_MEDIA_PUBLIC_BASE || (emu ? `http://${emu}` : 'https://firebasestorage.googleapis.com');
  return `${base}/v0/b/${bucket}/o/${enc}?alt=media&token=${token}`;
}

// Stores one file for an agent. buf: the bytes; declaredType: the Content-Type the agent sent (must agree).
async function storeMedia(caller, buf, declaredType) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) fail(400, 'Send the file bytes as the request body, or base64 in dataBase64.');
  if (buf.length > MAX_BYTES) fail(413, 'That file is too big. Pictures can be up to 8 MB and videos up to 30 MB.');
  const type = sniffType(buf);
  const spec = TYPES[type];
  if (!spec) fail(415, 'Only JPEG, PNG, WebP or GIF pictures and MP4, MOV or WebM videos can be uploaded.');
  const declared = String(declaredType || '').split(';')[0].trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream' && declared !== 'application/json' && TYPES[declared]?.kind !== spec.kind) {
    fail(415, `The file is a ${spec.kind}, but it was sent as ${declared}.`);
  }
  if (buf.length > spec.max) fail(413, `That ${spec.kind} is too big. The limit is ${spec.max / MB} MB.`);

  const { db, FieldValue } = admin();
  const { getStorage } = require('firebase-admin/storage');
  const mediaId = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomUUID();
  const path = `media/${caller.agentId}/${mediaId}.${spec.ext}`;
  const bucket = getStorage().bucket(bucketName());
  await bucket.file(path).save(buf, {
    resumable: false,
    contentType: type,
    metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token, agentId: caller.agentId } },
  });
  const url = publicUrl(bucket.name, path, token);
  const record = { mediaId, agentId: caller.agentId, ownerUid: caller.ownerUid || null, kind: spec.kind, contentType: type, size: buf.length, path, url };
  await db.collection('media').doc(mediaId).set({ ...record, createdAt: FieldValue.serverTimestamp() });
  return record;
}

module.exports = { storeMedia, sniffType, TYPES, MAX_BYTES };
