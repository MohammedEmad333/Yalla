'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');

test('trust proxy accepts local reverse proxies only', () => {
  const trustProxy = app.get('trust proxy fn');

  assert.equal(typeof trustProxy, 'function');
  assert.equal(trustProxy('127.0.0.1', 0), true);
  assert.equal(trustProxy('::1', 0), true);
  assert.equal(trustProxy('203.0.113.10', 0), false);
  assert.equal(trustProxy('198.51.100.20', 0), false);
});
