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


test('private /order command looks up only full ID scoped to the Telegram identity', async () => {
  const id = 'a'.repeat(24);
  const calls = [];
  const request = async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/order');
    assert.deepEqual(body, { telegramUserId: '321', telegramChatId: '321', orderId: id });
    return { linked: true, order: { orderId: id, reference: 'aaaaaa', status: 'picked_up', storeName: 'Store' } };
  };
  assert.equal(await handleReadOnlyCommand({ message: {
    chat: { type: 'private', id: 321 }, from: { id: 321 },
    text: '/order ' + id,
  } }, async (...args) => calls.push(args), request), true);
  assert.match(calls[0][1].text, /قيد التوصيل/);
  assert.equal(calls[0][1].reply_markup.inline_keyboard[0][0].callback_data, 'status:' + id);
});
test('/order rejects short, injected, and absent IDs without backend calls', async () => {
  for (const input of ['/order', '/order abcdef', '/order ../etc/passwd', '/order ' + 'a'.repeat(24) + ' extra']) {
    const calls = [];
    assert.equal(await handleReadOnlyCommand({ message: {
      chat: { type: 'private', id: 321 }, from: { id: 321 }, text: input,
    } }, async (...args) => calls.push(args), async () => {
      throw Error('backend must not be called');
    }), true);
    assert.match(calls[0][1].text, /24 حرفًا/);
  }
});
test('/order never reveals an unowned or unlinked order', async () => {
  for (const [result, expected] of [
    [{ linked: true, order: null }, /غير متاح/],
    [{ linked: false, order: { status: 'accepted', reference: '123456' } }, /غير مرتبط/],
  ]) {
    const calls = [];
    await handleReadOnlyCommand({ message: {
      chat: { type: 'private', id: 321 }, from: { id: 321 }, text: '/order ' + 'b'.repeat(24),
    } }, async (...args) => calls.push(args), async () => result);
    assert.match(calls[0][1].text, expected);
    assert.equal(calls[0][1].reply_markup, undefined);
  }
});
test('/order from a forged private chat identity is ignored without backend access', async () => {
  const calls = [];
  assert.equal(await handleReadOnlyCommand({ message: {
    chat: { type: 'private', id: 321 }, from: { id: 900 }, text: '/order ' + 'a'.repeat(24),
  } }, async (...args) => calls.push(args), async () => {
    throw Error('forged identity may not access backend');
  }), false);
  assert.deepEqual(calls, []);
});


test('orders list has a refresh button and safe direct navigation for at most 5 orders', async () => {
  const calls = [];
  const many = Array.from({ length: 8 }, (_, i) => ({
    orderId: String(i + 1).padStart(24, 'a'), reference: '00000' + (i + 1),
    status: i % 2 ? 'picked_up' : 'accepted', storeName: 'Store\nName',
  }));
  const request = async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/orders');
    assert.deepEqual(body, { telegramUserId: '11', telegramChatId: '11' });
    return { linked: true, orders: many };
  };
  assert.equal(await handleReadOnlyCommand({
    message: { chat: { type: 'private', id: 11 }, from: { id: 11 }, text: '/orders' },
  }, async (...args) => calls.push(args), request), true);
  const payload = calls[0][1];
  assert.equal(payload.reply_markup.inline_keyboard.length, 7);
  assert.equal(payload.reply_markup.inline_keyboard[5][0].callback_data, 'orders:refresh');
  assert.equal(payload.reply_markup.inline_keyboard[6][0].callback_data, 'menu:help');
  assert.equal((payload.text.match(/المتجر:/g) || []).length, 5);
  assert.doesNotMatch(payload.text, /Store\nName/);
  assert.match(payload.reply_markup.inline_keyboard[0][0].text, /تم قبوله/);
});

test('orders refresh button re-checks ownership in private chat and acknowledges callback', async () => {
  const id = 'c'.repeat(24);
  const calls = [];
  const request = async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/orders');
    assert.deepEqual(body, { telegramUserId: '17', telegramChatId: '17' });
    return { linked: true, orders: [{ orderId: id, reference: 'cccccc', status: 'assigned' }] };
  };
  assert.equal(await handleReadOnlyCommand({
    callback_query: {
      id: 'refresh-one', from: { id: 17 }, data: 'orders:refresh',
      message: { chat: { type: 'private', id: 17 } },
    },
  }, async (...args) => calls.push(args), request), true);
  assert.deepEqual(calls.map(x => x[0]), ['answerCallbackQuery', 'sendMessage']);
  assert.equal(calls[1][1].reply_markup.inline_keyboard[0][0].callback_data, 'status:' + id);
});

test('orders refresh ignores mismatched private chat identity and group callbacks', async () => {
  for (const chat of [
    { id: 17, type: 'private' }, { id: 18, type: 'group' },
  ]) {
    const calls = [];
    assert.equal(await handleReadOnlyCommand({
      callback_query: {
        id: 'forged', from: { id: 18 }, data: 'orders:refresh',
        message: { chat },
      },
    }, async (...args) => calls.push(args), async () => { throw Error('must not call backend'); }), false);
    assert.deepEqual(calls, []);
  }
});

test('refreshing an unlinked account reveals no orders or navigation buttons', async () => {
  const calls = [];
  await handleReadOnlyCommand({
    callback_query: {
      id: 'unlinked', from: { id: 17 }, data: 'orders:refresh',
      message: { chat: { type: 'private', id: 17 } },
    },
  }, async (...args) => calls.push(args), async () => ({
    linked: false, orders: [{ orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'accepted' }],
  }));
  assert.equal(calls[1][1].reply_markup, undefined);
  assert.match(calls[1][1].text, /غير مرتبط/);
  assert.doesNotMatch(calls[1][1].text, /aaaaaa/);
});

test('individual order status offers safe navigation back to order list', async () => {
  const id = 'd'.repeat(24), calls = [];
  await handleReadOnlyCommand({
    callback_query: {
      id: 'detail', from: { id: 21 }, data: 'status:' + id,
      message: { chat: { type: 'private', id: 21 } },
    },
  }, async (...args) => calls.push(args), async () => ({
    linked: true, order: { orderId: id, reference: 'dddddd', status: 'picked_up' },
  }));
  assert.equal(calls[1][1].reply_markup.inline_keyboard[1][0].callback_data, 'orders:refresh');
});


test('refresh edits the existing order list card instead of sending a new message', async () => {
  const calls = [];
  const id = 'a'.repeat(24);
  await handleReadOnlyCommand({ callback_query: {
    id: 'refresh-edit', from: { id: 17 }, data: 'orders:refresh',
    message: { message_id: 101, chat: { id: 17, type: 'private' } },
  } }, async (method, payload) => calls.push({ method, payload }),
  async () => ({ linked: true, orders: [{ orderId: id, reference: 'aaaaaa', status: 'accepted' }] }));
  assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
  assert.equal(calls[1].payload.message_id, 101);
  assert.equal(calls[1].payload.chat_id, 17);
  assert.equal(calls[1].payload.reply_markup.inline_keyboard[0][0].callback_data, 'status:' + id);
});

test('refresh after unlink removes any previously actionable inline buttons', async () => {
  const calls = [];
  await handleReadOnlyCommand({ callback_query: {
    id: 'unlinked-edit', from: { id: 17 }, data: 'orders:refresh',
    message: { message_id: 102, chat: { id: 17, type: 'private' } },
  } }, async (method, payload) => calls.push({ method, payload }),
  async () => ({ linked: false, orders: [{ orderId: 'b'.repeat(24), reference: 'bbbbbb' }] }));
  assert.equal(calls[1].method, 'editMessageText');
  assert.deepEqual(calls[1].payload.reply_markup, { inline_keyboard: [] });
  assert.doesNotMatch(calls[1].payload.text, /bbbbbb/);
});

test('status detail callbacks reuse the same message and recheck order ownership', async () => {
  const calls = [];
  const id = 'd'.repeat(24);
  await handleReadOnlyCommand({ callback_query: {
    id: 'status-edit', from: { id: 24 }, data: 'status:' + id,
    message: { message_id: 203, chat: { id: 24, type: 'private' } },
  } }, async (method, payload) => calls.push({ method, payload }), async (path, body) => {
    assert.equal(path, '/api/telegram-captain/internal/order');
    assert.equal(body.telegramUserId, '24');
    assert.equal(body.orderId, id);
    return { linked: true, order: { orderId: id, reference: 'dddddd', status: 'picked_up' } };
  });
  assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
  assert.equal(calls[1].payload.message_id, 203);
  assert.equal(calls[1].payload.reply_markup.inline_keyboard[1][0].callback_data, 'orders:refresh');
});

test('reassigned order refresh removes the stale status button', async () => {
  const calls = [];
  await handleReadOnlyCommand({ callback_query: {
    id: 'reassigned', from: { id: 24 }, data: 'status:' + 'c'.repeat(24),
    message: { message_id: 204, chat: { id: 24, type: 'private' } },
  } }, async (method, payload) => calls.push({ method, payload }),
  async () => ({ linked: true, order: null }));
  assert.equal(calls[1].method, 'editMessageText');
  assert.deepEqual(calls[1].payload.reply_markup, { inline_keyboard: [] });
  assert.match(calls[1].payload.text, /غير متاح/);
});
