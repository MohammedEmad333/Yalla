'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FIXED_WINDOW_SCRIPT,
  RedisFixedWindowStore,
  encodeCommand,
  parseResp,
} = require('../src/services/redisRateLimitStore');

test('Redis RESP encoder creates a valid command frame', () => {
  const encoded = encodeCommand(['PING', 'hello']).toString('utf8');
  assert.equal(encoded, '*2\r\n$4\r\nPING\r\n$5\r\nhello\r\n');
});

test('Redis RESP parser handles integer arrays', () => {
  const parsed = parseResp(Buffer.from('*2\r\n:4\r\n:913\r\n'));
  assert.deepEqual(parsed.value, [4, 913]);
  assert.equal(parsed.next, 17);
});

test('RedisFixedWindowStore maps atomic Redis response to limiter result', async () => {
  let received;
  const client = {
    async command(args) {
      received = args;
      return [3, 850];
    },
  };
  const store = new RedisFixedWindowStore('redis://127.0.0.1:6379/0', { client });
  const result = await store.check('203.0.113.9', {
    windowMs: 1000,
    max: 2,
    namespace: 'login',
  });

  assert.equal(received[0], 'EVAL');
  assert.equal(received[1], FIXED_WINDOW_SCRIPT);
  assert.equal(received[2], '1');
  assert.match(received[3], /^yalla:ratelimit:login:[a-f0-9]{64}$/);
  assert.equal(received[4], '1000');
  assert.deepEqual(result, { allowed: false, remaining: 0, retryAfterMs: 850 });
});

test('RedisFixedWindowStore keeps keys opaque and bounded', async () => {
  let redisKey;
  const client = {
    async command(args) {
      redisKey = args[3];
      return [1, 1000];
    },
  };
  const store = new RedisFixedWindowStore('redis://127.0.0.1:6379/0', { client });
  await store.check('sensitive-client-key', { windowMs: 1000, max: 10, namespace: '../api auth' });

  assert.equal(redisKey.includes('sensitive-client-key'), false);
  assert.match(redisKey, /^yalla:ratelimit:___api_auth:[a-f0-9]{64}$/);
});
