'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Captain = require('../src/models/Captain');

test('smart dispatch rejects malformed coordinates before MongoDB lookup', async () => {
  for (const coords of [[Infinity, 31.5], ['34.4', 31.5], [34.4, 100], [], null]) {
    assert.deepEqual(await Captain.smartDispatchCandidates(coords), []);
  }
});
