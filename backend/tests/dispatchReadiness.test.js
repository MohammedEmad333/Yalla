'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isDispatchReady, dispatchReadyQuery } = require('../src/utils/dispatchReadiness');
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


test('dispatchReadyQuery applies readiness constraints before sorting and limiting', () => {
  const query = dispatchReadyQuery(now);
  assert.equal(query.status, 'pending');
  assert.equal(query.$and.length, 2);
  const schedule = query.$and[0].$or;
  assert.ok(schedule.some((entry) => entry.scheduledAt === null));
  assert.ok(schedule.some((entry) => entry.scheduledActivated === true));
  assert.ok(schedule.some((entry) => entry.scheduledAt?.$lte?.getTime() === now.getTime()));
  const stores = query.$and[1].$or;
  assert.ok(stores.some((entry) => entry['store.restaurant'] === null));
  assert.ok(stores.some((entry) => entry['store.merchantStatus']?.$in?.includes('accepted')));
  assert.ok(!stores.some((entry) => entry['store.merchantStatus']?.$in?.includes('new')));
});
