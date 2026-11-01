'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleUpdate, createTelegramClient, redeemPairing } = require('../src/telegram');
test('ignores group messages', async () => {
  const calls = [];
  await handleUpdate({ message: { chat: { id: 1, type: 'group' }, text: '/start' } }, async (...args) => calls.push(args));
  assert.equal(calls.length, 0);
});
test('private start is informational, no order mutations', async () => {
  const calls = [];
  await handleUpdate({ message: { chat: { id: 2, type: 'private' }, text: '/start' } }, async (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sendMessage');
  assert.match(calls[0][1].text, /ربط الحساب/);
});
test('client posts JSON to Telegram', async () => {
  const calls = [];
  const send = createTelegramClient('test-token', async (url, opts) => {
    calls.push({url,opts});
    return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};
  });
  await send('sendMessage', {chat_id:3,text:'test'});
  assert.match(calls[0].url, /sendMessage$/);
  assert.equal(JSON.parse(calls[0].opts.body).chat_id, 3);
});

test('redeems pairing through authenticated backend bridge', async () => {
  const prevUrl = process.env.YALLA_BACKEND_URL;
  const prevSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'a'.repeat(40);
  try {
    let called = false;
    const ok = await redeemPairing('A'.repeat(32), '123', '123', async (url, opts) => {
      called = true;
      assert.equal(url.pathname, '/api/telegram-captain/internal/redeem');
      assert.equal(opts.headers['x-telegram-pairing-secret'], 'a'.repeat(40));
      assert.deepEqual(JSON.parse(opts.body), {
        code: 'A'.repeat(32), telegramUserId: '123', telegramChatId: '123'
      });
      return { status: 200 };
    });
    assert.equal(ok, true);
    assert.equal(called, true);
  } finally {
    if (prevUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = prevSecret;
  }
});
test('rejects insecure remote bridge URLs', async () => {
  const prevUrl = process.env.YALLA_BACKEND_URL;
  const prevSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.YALLA_BACKEND_URL = 'http://example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'b'.repeat(40);
  try {
    await assert.rejects(redeemPairing('A'.repeat(32), '1', '1', async () => {
      throw new Error('must not fetch');
    }), /requires HTTPS/);
  } finally {
    if (prevUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = prevSecret;
  }
});
