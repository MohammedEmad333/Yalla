'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateProcessor } = require('../src/updateProcessor');

test('coalesces concurrent deliveries and skips completed duplicates', async () => {
  let calls = 0;
  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });
  const process = createUpdateProcessor(async () => { calls += 1; await gate; });
  const first = process({ update_id: 42 });
  const duplicate = process({ update_id: 42 });
  assert.equal(calls, 1);
  unblock();
  await Promise.all([first, duplicate]);
  await process({ update_id: 42 });
  assert.equal(calls, 1);
});

test('failed updates are retried rather than cached as completed', async () => {
  let attempts = 0;
  const process = createUpdateProcessor(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary failure');
  });
  await assert.rejects(process({ update_id: 100 }), /temporary failure/);
  await process({ update_id: 100 });
  assert.equal(attempts, 2);
});

test('completed IDs expire and the cache is bounded', async () => {
  let now = 1000;
  const processed = [];
  const process = createUpdateProcessor((u) => { processed.push(u.update_id); }, {
    ttlMs: 100, maxEntries: 2, now: () => now,
  });
  await process({ update_id: 1 });
  await process({ update_id: 2 });
  await process({ update_id: 3 });
  await process({ update_id: 1 }); // evicted by capacity
  now += 200;
  await process({ update_id: 1 }); // expired
  assert.deepEqual(processed, [1, 2, 3, 1, 1]);
});

test('caps unique concurrent updates but coalesces duplicates at capacity', async () => {
  let release;
  let started = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const process = createUpdateProcessor(async () => { started++; await gate; }, { maxInFlight: 1 });
  const original = process({ update_id: 40 });
  const duplicate = process({ update_id: 40 });
  assert.equal(duplicate, original);
  await assert.rejects(process({ update_id: 41 }), /webhook busy/);
  assert.equal(started, 1);
  release();
  await Promise.all([original, duplicate]);
  await process({ update_id: 41 });
  assert.equal(started, 2);
});

test('failed in-flight updates free capacity and are retryable', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let attempts = 0;
  const process = createUpdateProcessor(async () => {
    attempts++;
    if (attempts === 1) { await gate; throw new Error('backend unavailable'); }
  }, { maxInFlight: 1 });
  const first = process({ update_id: 70 });
  await assert.rejects(process({ update_id: 71 }), /webhook busy/);
  release();
  await assert.rejects(first, /backend unavailable/);
  // Cleanup runs in the finally reaction. The next different update is accepted.
  await process({ update_id: 71 });
  await process({ update_id: 70 });
  assert.equal(attempts, 3);
});

test('invalid concurrency limits fail at startup', () => {
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => createUpdateProcessor(async () => {}, { maxInFlight: value }),
      /maxInFlight must be a positive integer/);
  }
});
