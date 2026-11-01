'use strict';
const { timingSafeEqual } = require('node:crypto');
function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
module.exports = { secretMatches };
