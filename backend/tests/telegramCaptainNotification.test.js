'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyAssignedOrder, assignmentText } = require('../src/services/telegramCaptainNotification.service');
const captainId = '507f1f77bcf86cd799439011';
const orderId = '507f1f77bcf86cd799439012';
const link = { telegramUserId: '123456', telegramChatId: '123456' };
const env = { TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-only' };
test('disabled by default; no DB query', async () => {
  assert.deepEqual(await notifyAssignedOrder({ captainId, orderId }, {
    env: {}, findLink() { throw Error('unexpected query'); },
  }), { status: 'disabled' });
});
test('unlinked and unapproved captains cannot receive messages', async () => {
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env, findLink: async () => null,
  })).status, 'unlinked');
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env, findLink: async () => link, isApproved: async () => false,
  })).status, 'unapproved');
});
test('private chat must match linked Telegram identity', async () => {
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env, findLink: async () => ({ telegramUserId: '123', telegramChatId: '456' }),
  })).status, 'unlinked');
});
test('only order ID and app instructions are sent', async () => {
  let payload;
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env, findLink: async () => link, isApproved: async () => true,
    fetchImpl: async (url, options) => {
      assert.match(url, /^https:\/\/api\.telegram\.org\/bot/);
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  })).status, 'sent');
  assert.equal(payload.chat_id, link.telegramChatId);
  assert.equal(payload.protect_content, true);
  assert.ok(payload.text.includes(orderId));
  assert.doesNotMatch(payload.text, /OTP|هاتف|عنوان|عميل|السعر/);
  assert.throws(() => assignmentText('bad'), /Invalid order ID/);
});
test('Telegram HTTP failures are reported', async () => {
  await assert.rejects(notifyAssignedOrder({ captainId, orderId }, {
    env, findLink: async () => link, isApproved: async () => true,
    fetchImpl: async () => ({ ok: false, status: 429 }),
  }), /HTTP 429/);
});
