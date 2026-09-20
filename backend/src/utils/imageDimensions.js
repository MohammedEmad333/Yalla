'use strict';

const RESTAURANT_COVER_SPEC = Object.freeze({
  width: 1200,
  height: 900,
  ratio: '4:3',
});

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    format: 'png',
  };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    if (sofMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
        format: 'jpeg',
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer) {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return null;
  }

  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
      format: 'webp',
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      format: 'webp',
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
      format: 'webp',
    };
  }
  return null;
}

function imageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return pngDimensions(buffer) || jpegDimensions(buffer) || webpDimensions(buffer);
}

function assertRestaurantCover(file) {
  if (!file?.buffer) {
    throw Object.assign(new Error('أرفق صورة'), { statusCode: 400 });
  }

  const dimensions = imageDimensions(file.buffer);
  if (!dimensions) {
    throw Object.assign(
      new Error('صورة المتجر يجب أن تكون JPG أو PNG أو WebP صالحة بمقاس 1200×900 بكسل'),
      { statusCode: 400 }
    );
  }

  if (
    dimensions.width !== RESTAURANT_COVER_SPEC.width ||
    dimensions.height !== RESTAURANT_COVER_SPEC.height
  ) {
    throw Object.assign(
      new Error(
        `مقاس صورة المتجر يجب أن يكون ${RESTAURANT_COVER_SPEC.width}×${RESTAURANT_COVER_SPEC.height} بكسل (${RESTAURANT_COVER_SPEC.ratio}) بالضبط`
      ),
      { statusCode: 400 }
    );
  }

  return dimensions;
}

module.exports = {
  RESTAURANT_COVER_SPEC,
  imageDimensions,
  assertRestaurantCover,
};
