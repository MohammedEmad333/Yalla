'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isDispatchReady } = require('../src/utils/dispatchReadiness');
const now = new Date('2026-10-11T10:00:00Z');

test('dispatch preview includes immediate and due pending orders', () => {
  assert.equal(isDispatchReady({ status: 'pending' }, now), true);
  assert.equal(isDispatchReady({ status: 'pending', scheduledAt: '2026-10-11T09:00:00Z' }, now), true);
});

test('dispatch preview excludes future scheduled and non-pending orders', () => {
  assert.equal(isDispatchReady({ status: 'pending', scheduledAt: '2026-10-12T09:00:00Z' }, now), false);
  assert.equal(isDispatchReady({ status: 'awaiting_payment' }, now), false);
});

test('dispatch preview excludes unaccepted store orders', () => {
  assert.equal(isDispatchReady({ status: 'pending', store: { restaurant: 'id', merchantStatus: 'new' } }, now), false);
  assert.equal(isDispatchReady({ status: 'pending', store: { restaurant: 'id', merchantStatus: 'accepted' } }, now), true);
});
