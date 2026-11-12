'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleReadOnlyCommand, deliverEvent, requestBackend, formatOrder } = require('../src/captainOrders');

test('orders command returns sanitized summaries and status buttons', async () => {
  const calls = [];
  const request = async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/orders');
    assert.deepEqual(body, { telegramUserId: '321', telegramChatId: '321' });
    return { linked: true, orders: [{
      orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'assigned', storeName: 'Market\nName',
    }] };
  };
  const handled = await handleReadOnlyCommand({
    message: { chat: { type: 'private', id: 321 }, from: { id: 321 }, text: '/orders' },
  }, async (...args) => calls.push(args), request);
  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][1].text, /تم إسناده/);
  assert.ok(!calls[0][1].text.includes('Market\nName'));
  assert.equal(calls[0][1].reply_markup.inline_keyboard[0][0].callback_data, 'status:' + 'a'.repeat(24));
});
test('unlinked orders reveal no information', async () => {
  const calls = [];
  await handleReadOnlyCommand({ message: {
    chat: { type: 'private', id: 7 }, from: { id: 7 }, text: '/orders',
  } }, async (...args) => calls.push(args), async () => ({ linked: false, orders: [] }));
  assert.match(calls[0][1].text, /غير مرتبط/);
});
test('callback refresh checks current order using backend', async () => {
  const calls = [];
  const callback = { from: { id: 1 }, id: 'callback-1',
    message: { chat: { id: 1, type: 'private' } }, data: 'status:' + 'a'.repeat(24) };
  await handleReadOnlyCommand({ callback_query: callback }, async (...args) => calls.push(args),
    async (path, body) => {
      assert.equal(path, '/api/telegram-captain/internal/order');
      assert.equal(body.orderId, 'a'.repeat(24));
      return { linked: true, order: { orderId: body.orderId, reference: 'aaaaaa', status: 'picked_up' } };
    });
  assert.match(calls[1][1].text, /قيد التوصيل/);
  callback.data = 'status:../etc/passwd';
  await handleReadOnlyCommand({ callback_query: callback }, async (...args) => calls.push(args),
    async () => { throw Error('invalid callback must not access backend'); });
  assert.equal(calls[calls.length - 1][0], 'answerCallbackQuery');
});
test('forged Telegram identities cannot query the backend', async () => {
  let called = false;
  const result = await handleReadOnlyCommand({
    message: { chat: { type: 'private', id: 8 }, from: { id: 9 }, text: '/orders' },
  }, async () => {}, async () => { called = true; });
  assert.equal(result, false);
  assert.equal(called, false);
});
test('stale or unauthorized notifications are suppressed', async () => {
  const calls = [];
  const event = { eventType: 'assigned', captainId: 'b'.repeat(24), orderId: 'a'.repeat(24), status: 'assigned' };
  await deliverEvent(event, async (...args) => calls.push(args), async () => ({ deliver: false }));
  assert.equal(calls.length, 0);
  await deliverEvent(event, async (...args) => calls.push(args), async (path) => {
    assert.equal(path, '/api/telegram-captain/internal/resolve-event');
    return {
      deliver: true, telegramChatId: '33',
      order: { orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'assigned', storeName: 'A' },
    };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].chat_id, '33');
  assert.match(calls[0][1].text, /طلب جديد/);
});
test('backend request refuses insecure remote URLs', async () => {
  const oldUrl = process.env.YALLA_BACKEND_URL, oldSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.YALLA_BACKEND_URL = 'http://example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'Z'.repeat(48);
  try {
    await assert.rejects(requestBackend('/api/telegram-captain/internal/orders', {}, async () => {
      throw Error('must not fetch');
    }), /requires HTTPS/);
  } finally {
    if (oldUrl === undefined) delete process.env.YALLA_BACKEND_URL; else process.env.YALLA_BACKEND_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = oldSecret;
  }
});
test('store names cannot inject multiline content', () => {
  assert.equal(formatOrder({ reference: '123456', status: 'assigned', storeName: 'X\nY' }),
    '#123456 — تم إسناده\nالمتجر: X Y');
});
