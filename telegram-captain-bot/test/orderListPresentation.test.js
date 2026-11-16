'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleReadOnlyCommand } = require('../src/captainOrders');

test('active orders list shows numbered items and the visible count', async () => {
  const calls = [];
  const orders = [
    { orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'assigned', storeName: 'Market\nName' },
    { orderId: 'b'.repeat(24), reference: 'bbbbbb', status: 'accepted', storeName: 'Shop' },
  ];
  const handled = await handleReadOnlyCommand({
    message: { chat: { type: 'private', id: 123 }, from: { id: 123 }, text: '/orders' },
  }, async (method, payload) => calls.push({ method, payload }),
  async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/orders');
    assert.deepEqual(body, { telegramUserId: '123', telegramChatId: '123' });
    return { linked: true, orders };
  });
  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  const view = calls[0].payload;
  assert.match(view.text, /طلباتك النشطة \(2 معروضة، بحد أقصى 5\)/);
  assert.match(view.text, /1\. #aaaaaa/);
  assert.match(view.text, /2\. #bbbbbb/);
  assert.doesNotMatch(view.text, /Market\nName/);
  assert.deepEqual(view.reply_markup.inline_keyboard.slice(0, 2).map(row => row[0].callback_data),
    ['status:' + 'a'.repeat(24), 'status:' + 'b'.repeat(24)]);
});

test('unlinked accounts never see numbered order data', async () => {
  const calls = [];
  await handleReadOnlyCommand({
    message: { chat: { type: 'private', id: 123 }, from: { id: 123 }, text: '/orders' },
  }, async (method, payload) => calls.push(payload),
  async () => ({ linked: false, orders: [
    { orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'assigned' },
  ] }));
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /غير مرتبط/);
  assert.doesNotMatch(calls[0].text, /aaaaaa/);
  assert.equal(calls[0].reply_markup, undefined);
});
