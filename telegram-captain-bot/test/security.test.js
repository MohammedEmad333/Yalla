'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { secretMatches } = require('../index');
test('webhook secret comparison rejects invalid types and mismatches', () => {
  assert.equal(secretMatches('valid', 'valid'), true);
  assert.equal(secretMatches('invalid', 'valid'), false);
  assert.equal(secretMatches('', 'valid'), false);
  assert.equal(secretMatches(undefined, 'valid'), false);
});
