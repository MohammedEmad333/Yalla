'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { singleFlight } = require('../src/utils/singleFlight');

test('singleFlight skips overlapping executions and allows the next tick', async () => {
  let release;
  let calls = 0;
  const guarded = singleFlight(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
  });
  const first = guarded();
  assert.equal(await guarded(), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  const second = guarded();
  assert.equal(calls, 2);
  release();
  assert.equal(await second, true);
});

test('singleFlight releases lock after an error', async () => {
  let calls = 0;
  const guarded = singleFlight(async () => { calls++; if (calls === 1) throw Error('failure'); });
  await assert.rejects(guarded(), /failure/);
  assert.equal(await guarded(), true);
  assert.equal(calls, 2);
});
