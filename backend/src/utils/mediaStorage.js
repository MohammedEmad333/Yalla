'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const MEDIA_URL_PREFIX = '/media';
const DEFAULT_MEDIA_ROOT = path.resolve(__dirname, '..', '..', 'media');

const EXT_BY_CONTENT_TYPE = Object.freeze({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
});

function getMediaRoot() {
  return path.resolve(process.env.MEDIA_ROOT || DEFAULT_MEDIA_ROOT);
}

function extensionForContentType(contentType) {
  return EXT_BY_CONTENT_TYPE[String(contentType || '').toLowerCase()] || '.bin';
}

function normalizeMediaKind(kind) {
  const value = String(kind || 'image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || 'image';
}

function absoluteMediaPath(relativePath) {
  const root = getMediaRoot();
  const relative = String(relativePath || '').replace(/\\/g, '/');
  if (!relative || relative.startsWith('/') || relative.includes('\0')) return null;

  const absolute = path.resolve(root, ...relative.split('/'));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(prefix)) return null;
  return absolute;
}

function mediaRelativePathFromUrl(url) {
  if (typeof url !== 'string') return null;
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname.startsWith(`${MEDIA_URL_PREFIX}/`)) return null;

  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(MEDIA_URL_PREFIX.length + 1));
  } catch {
    return null;
  }

  return absoluteMediaPath(relative) ? relative.replace(/\\/g, '/') : null;
}

function legacyRelativePath(id, contentType) {
  const safeId = String(id || '').toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(safeId)) {
    throw new Error('Invalid legacy FileAsset id');
  }
  return `legacy/${safeId}${extensionForContentType(contentType)}`;
}

async function writeMediaBuffer(relativePath, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Cannot store an empty media buffer');
  }

  const destination = absoluteMediaPath(relativePath);
  if (!destination) throw new Error('Invalid media storage path');

  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const tempPath = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fsp.writeFile(tempPath, buffer, { mode: 0o644 });
    await fsp.rename(tempPath, destination);
  } catch (err) {
    await fsp.unlink(tempPath).catch(() => {});
    throw err;
  }

  return destination;
}

async function saveMediaFile(file, { kind = 'image' } = {}) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new Error('Image buffer is required');
  }

  const directory = normalizeMediaKind(kind);
  const extension = extensionForContentType(file.mimetype);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const relativePath = path.posix.join(directory, filename);

  await writeMediaBuffer(relativePath, file.buffer);

  return {
    relativePath,
    absolutePath: absoluteMediaPath(relativePath),
    url: `${MEDIA_URL_PREFIX}/${relativePath}`,
    size: file.size || file.buffer.length,
  };
}

async function deleteMediaFileByUrl(url) {
  const relativePath = mediaRelativePathFromUrl(url);
  if (!relativePath) return false;

  const absolutePath = absoluteMediaPath(relativePath);
  if (!absolutePath) return false;

  try {
    await fsp.unlink(absolutePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return true;
}

module.exports = {
  MEDIA_URL_PREFIX,
  getMediaRoot,
  extensionForContentType,
  normalizeMediaKind,
  absoluteMediaPath,
  mediaRelativePathFromUrl,
  legacyRelativePath,
  writeMediaBuffer,
  saveMediaFile,
  deleteMediaFileByUrl,
};
