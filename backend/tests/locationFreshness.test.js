'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { locationAgeMinutes } = require('../src/utils/locationFreshness');
const now = Date.parse('2026-10-12T12:00:00Z');
test('freshness accepts recent location and modest clock skew', () => {
  assert.equal(locationAgeMinutes('2026-10-12T11:55:00Z', now), 5);
  assert.equal(locationAgeMinutes('2026-10-12T12:00:20Z', now), 0);
});
test('freshness rejects missing, invalid and future GPS timestamp', () => {
  for (const value of [null, undefined, '', 'invalid', '2026-10-12T12:01:00Z']) {
    assert.equal(locationAgeMinutes(value, now), Infinity);
  }
});
