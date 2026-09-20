'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RESTAURANT_COVER_SPEC,
  imageDimensions,
  assertRestaurantCover,
} = require('../src/utils/imageDimensions');

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeader(width, height) {
  const buffer = Buffer.alloc(13);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xc0;
  buffer.writeUInt16BE(9, 4);
  buffer[6] = 8;
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

test('restaurant cover spec is 1200x900 (4:3)', () => {
  assert.deepEqual(RESTAURANT_COVER_SPEC, { width: 1200, height: 900, ratio: '4:3' });
});

test('reads PNG dimensions', () => {
  assert.deepEqual(imageDimensions(pngHeader(1200, 900)), {
    width: 1200,
    height: 900,
    format: 'png',
  });
});

test('reads JPEG dimensions', () => {
  assert.deepEqual(imageDimensions(jpegHeader(1200, 900)), {
    width: 1200,
    height: 900,
    format: 'jpeg',
  });
});

test('accepts exact restaurant cover dimensions', () => {
  assert.equal(assertRestaurantCover({ buffer: pngHeader(1200, 900) }).width, 1200);
});

test('rejects other restaurant cover dimensions', () => {
  assert.throws(
    () => assertRestaurantCover({ buffer: pngHeader(1000, 1000) }),
    /1200×900/
  );
});
