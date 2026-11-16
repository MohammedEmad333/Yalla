'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sendTelegramMessage, retryDelay, MAX_ATTEMPTS } =
  require('../src/services/telegramCaptainTelegramClient.service');

test('short 429 requests one bounded retry and succeeds with protected content', async () => {
  const sleeps = [], posted = [];
  let attempts = 0, retries = 0;
  const fetchImpl = async (url, request) => {
    attempts++;
    posted.push({ url, body: JSON.parse(request.body) });
    if (attempts === 1) return { ok: false, status: 429,
      json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 0.2 } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 19 } }) };
  };
  const result = await sendTelegramMessage('test-token', { chat_id: 123, text: 'Safe order notice' }, {
    fetchImpl, sleep: async ms => sleeps.push(ms), onRetry: async () => { retries++; },
  });
  assert.equal(MAX_ATTEMPTS, 2);
  assert.deepEqual(result, { message_id: 19 });
  assert.deepEqual(sleeps, [200]);
  assert.equal(retries, 1);
  assert.equal(posted.length, 2);
  assert.equal(posted[1].body.protect_content, true);
  assert.equal(posted[1].body.disable_web_page_preview, true);
  assert.match(posted[0].url, /\/sendMessage$/);
});

test('large retry_after fails fast with no sleep or duplicate POST', async () => {
  let attempts = 0;
  await assert.rejects(sendTelegramMessage('secret', { chat_id: 42 }, {
    fetchImpl: async () => { attempts++; return { ok: false, status: 429,
      json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 15 } }) }; },
    sleep: () => { throw Error('do not sleep'); },
  }), err => err.code === 'TELEGRAM_RATE_LIMITED' && /HTTP 429/.test(err.message));
  assert.equal(attempts, 1);
});

test('repeated rate limiting only retries once', async () => {
  let count = 0, sleepCount = 0;
  await assert.rejects(sendTelegramMessage('secret', { chat_id: 42 }, {
    fetchImpl: async () => { count++; return { ok: false, status: 429,
      json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 0 } }) }; },
    sleep: async () => { sleepCount++; },
  }), /HTTP 429/);
  assert.equal(count, 2);
  assert.equal(sleepCount, 1);
});

test('unknown transport outcome never immediately resends and sanitizes secrets', async () => {
  let count = 0;
  await assert.rejects(sendTelegramMessage('my-secret-token', { chat_id: 123 }, {
    fetchImpl: async () => { count++; throw new Error('my-secret-token chat 123'); },
    sleep: async () => { throw Error('do not sleep'); },
  }), err => {
    assert.equal(err.message, 'Telegram notification transport failure');
    assert.doesNotMatch(err.message, /my-secret-token|123/);
    return true;
  });
  assert.equal(count, 1);
});

test('bad Telegram replies do not look like successful delivery', async () => {
  await assert.rejects(sendTelegramMessage('secret', { chat_id: 44 }, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw Error('response secret'); } }),
  }), err => /HTTP 200/.test(err.message) && !/response secret/.test(err.message));
  assert.equal(retryDelay({ headers: { get: () => '0.5' } }, {}), 500);
});
