'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleNotificationSettings, READ_PATH, WRITE_PATH } = require('../src/notificationSettings');

function callback(data, from = 91, chat = 91) {
  return { callback_query: { id: 'cb-notifications', from: { id: from }, data,
    message: { message_id: 72, chat: { type: 'private', id: chat } } } };
}

test('private notification settings show two explicit opt-out controls', async () => {
  const calls = [];
  const handled = await handleNotificationSettings(callback('menu:notifications'),
    async (method, payload) => calls.push({ method, payload }),
    async (path, body) => {
      assert.equal(path, READ_PATH);
      assert.deepEqual(body, { telegramUserId: '91', telegramChatId: '91' });
      return { linked: true, assigned: true, status: false };
    }, 'en');
  assert.equal(handled, true);
  assert.deepEqual(calls.map(c => c.method), ['answerCallbackQuery', 'editMessageText']);
  const card = calls[1].payload;
  assert.match(card.text, /Notification settings/);
  assert.equal(card.reply_markup.inline_keyboard[0][0].callback_data,
    'notifications:set:assigned:off');
  assert.equal(card.reply_markup.inline_keyboard[1][0].callback_data,
    'notifications:set:status:on');
});

test('setting callbacks send desired boolean to authorized bridge and are retry-idempotent', async () => {
  const requests = [], calls = [];
  const req = async (path, body) => {
    requests.push({ path, body });
    return { linked: true, assigned: false, status: true };
  };
  for (let i = 0; i < 2; i++) {
    await handleNotificationSettings(callback('notifications:set:assigned:off'),
      async (method, payload) => calls.push({ method, payload }), req, 'ar');
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, WRITE_PATH);
  assert.deepEqual(requests[0].body, {
    telegramUserId: '91', telegramChatId: '91', kind: 'assigned', enabled: false,
  });
  assert.deepEqual(requests[1], requests[0]);
  assert.match(calls[1].payload.text, /إعدادات الإشعارات/);
});

test('unlinked captain sees no preference controls and forged identities cannot change settings', async () => {
  const calls = [];
  await handleNotificationSettings(callback('notifications:refresh'),
    async (method, payload) => calls.push({ method, payload }),
    async () => ({ linked: false }), 'en');
  assert.deepEqual(calls[1].payload.reply_markup.inline_keyboard.map(row => row[0].callback_data),
    ['menu:help']);
  assert.deepEqual(calls[1].payload.reply_markup.inline_keyboard.length, 1);
  let requested = false;
  const forged = await handleNotificationSettings(callback('notifications:set:status:off', 98, 91),
    async () => { throw Error('must not send'); },
    async () => { requested = true; }, 'en');
  assert.equal(forged, false);
  assert.equal(requested, false);
  assert.equal(await handleNotificationSettings(callback('notifications:set:status:maybe'),
    async () => { throw Error('must not send'); },
    async () => { requested = true; }, 'en'), false);
  assert.equal(requested, false);
});

test('backend failure propagates before Telegram callback is acknowledged', async () => {
  const calls = [];
  await assert.rejects(handleNotificationSettings(callback('notifications:set:assigned:on'),
    async (method) => calls.push(method),
    async () => { throw new Error('backend 503'); }, 'en'), /backend 503/);
  assert.deepEqual(calls, []);
});

test('command and callback both enforce private chat identity', async () => {
  const calls = [];
  const request = async () => ({ linked: true, assigned: true, status: true });
  assert.equal(await handleNotificationSettings({
    message: { text: '/notifications', chat: { type: 'group', id: -91 },
      from: { id: 91 } },
  }, async (...args) => calls.push(args), request), false);
  assert.equal(await handleNotificationSettings({
    message: { text: '/notifications', chat: { type: 'private', id: 91 },
      from: { id: 92 } },
  }, async (...args) => calls.push(args), request), false);
  assert.equal(await handleNotificationSettings({
    message: { text: '/notifications', chat: { type: 'private', id: 91 },
      from: { id: 91 } },
  }, async (...args) => calls.push(args), request), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sendMessage');
});
