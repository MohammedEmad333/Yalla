'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWebhookServer } = require('../src/webhook');

const secret = 'A'.repeat(48);
async function withServer(processUpdate, task) {
  const server = createWebhookServer({ secret, processUpdate, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const post = (update, overrideSecret = secret) => fetch(base + '/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': overrideSecret },
      body: JSON.stringify(update),
    });
    await task({ post, base });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('requires a strong webhook secret at startup', () => {
  assert.throws(() => createWebhookServer({ secret: 'short', processUpdate() {} }), /32-256/);
});

test('rejects wrong secret without handling the update', async () => {
  let calls = 0;
  await withServer(() => { calls++; }, async ({ post }) => {
    const response = await post({ update_id: 1 }, 'wrong');
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  });
});

test('does not acknowledge an update before processing completes', async () => {
  let enter;
  let release;
  const started = new Promise((r) => { enter = r; });
  const gate = new Promise((r) => { release = r; });
  await withServer(async () => { enter(); await gate; }, async ({ post }) => {
    const responsePromise = post({ update_id: 2 });
    try {
      await started;
      let replied = false;
      responsePromise.then(() => { replied = true; }, () => { replied = true; });
      await new Promise((r) => setImmediate(r));
      assert.equal(replied, false);
    } finally {
      release();
    }
    const response = await responsePromise;
    assert.equal(response.status, 200);
  });
});

test('returns 503 for transient failure; retry succeeds; duplicate is skipped', async () => {
  let attempts = 0;
  await withServer(() => {
    attempts++;
    if (attempts === 1) throw new Error('offline backend');
  }, async ({ post }) => {
    assert.equal((await post({ update_id: 3 })).status, 503);
    assert.equal((await post({ update_id: 3 })).status, 200);
    assert.equal((await post({ update_id: 3 })).status, 200);
    assert.equal(attempts, 2);
  });
});

test('rejects malformed updates, still exposes local health', async () => {
  await withServer(async () => {}, async ({ post, base }) => {
    assert.equal((await post({ message: { text: 'hello' } })).status, 400);
    assert.equal((await fetch(base + '/health')).status, 200);
  });
});
