'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extensionForContentType,
  normalizeMediaKind,
  mediaRelativePathFromUrl,
  saveMediaFile,
  deleteMediaFileByUrl,
} = require('../src/utils/mediaStorage');

test('media storage normalizes kind and known image extensions', () => {
  assert.equal(normalizeMediaKind('Menu Item'), 'menu-item');
  assert.equal(normalizeMediaKind('../../banner'), 'banner');
  assert.equal(extensionForContentType('image/jpeg'), '.jpg');
  assert.equal(extensionForContentType('image/webp'), '.webp');
  assert.equal(extensionForContentType('application/octet-stream'), '.bin');
});

test('media URL parser rejects traversal outside MEDIA_ROOT', () => {
  assert.equal(mediaRelativePathFromUrl('/media/restaurants/a.jpg'), 'restaurants/a.jpg');
  assert.equal(mediaRelativePathFromUrl('/media/%2e%2e/secret.jpg'), null);
  assert.equal(mediaRelativePathFromUrl('/files/507f1f77bcf86cd799439011'), null);
  assert.equal(mediaRelativePathFromUrl('https://example.com/media/a.jpg'), null);
});

test('saveMediaFile writes and deleteMediaFileByUrl removes a persistent file', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yalla-media-'));
  const previous = process.env.MEDIA_ROOT;
  process.env.MEDIA_ROOT = root;

  try {
    const stored = await saveMediaFile(
      {
        buffer: Buffer.from('image-bytes'),
        mimetype: 'image/png',
        size: 11,
      },
      { kind: 'restaurant' }
    );

    assert.match(stored.url, /^\/media\/restaurant\/.+\.png$/);
    assert.equal(await fs.promises.readFile(stored.absolutePath, 'utf8'), 'image-bytes');

    assert.equal(await deleteMediaFileByUrl(stored.url), true);
    await assert.rejects(fs.promises.stat(stored.absolutePath), { code: 'ENOENT' });
  } finally {
    if (previous === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previous;
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
