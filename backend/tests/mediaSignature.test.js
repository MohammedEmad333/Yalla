'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectImageContentType,
  validatedImageContentType,
} = require('../src/utils/mediaStorage');

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 ', 'ascii'),
]);

function heicBuffer(brand = 'heic') {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(brand, 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(brand, 'ascii'),
    Buffer.from('mif1', 'ascii'),
  ]);
}

test('detectImageContentType detects supported image signatures', () => {
  assert.equal(detectImageContentType(png), 'image/png');
  assert.equal(detectImageContentType(jpeg), 'image/jpeg');
  assert.equal(detectImageContentType(webp), 'image/webp');
  assert.equal(detectImageContentType(heicBuffer('heic')), 'image/heic');
});

test('validatedImageContentType rejects non-image bytes even with image MIME', () => {
  assert.throws(
    () => validatedImageContentType({ mimetype: 'image/jpeg', buffer: Buffer.from('<script>alert(1)</script>') }),
    /ليس صورة صالحة/
  );
});

test('validatedImageContentType rejects MIME and signature mismatch', () => {
  assert.throws(
    () => validatedImageContentType({ mimetype: 'image/png', buffer: jpeg }),
    /لا يطابق محتوى الملف/
  );
});

test('validatedImageContentType accepts octet-stream when actual image signature is valid', () => {
  assert.equal(
    validatedImageContentType({ mimetype: 'application/octet-stream', buffer: png }),
    'image/png'
  );
});
