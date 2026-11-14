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
  await handleUpdate({ message: { chat: { id: 2, type: 'private' }, from: { id: 2 }, text: '/start' } }, async (...args) => calls.push(args));
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

test('private /start with pairing code invokes backend bridge', async () => {
  const previousUrl = process.env.YALLA_BACKEND_URL;
  const previousSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  const previousFetch = global.fetch;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'c'.repeat(40);
  const code = 'A'.repeat(32);
  let redeemed = false;
  global.fetch = async (url, opts) => {
    assert.equal(new URL(url).pathname, '/api/telegram-captain/internal/redeem');
    assert.equal(JSON.parse(opts.body).code, code);
    redeemed = true;
    return { status: 200 };
  };
  try {
    const sent = [];
    await handleUpdate({ message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/start ' + code } }, async (method, payload) => sent.push({ method, payload }));
    assert.equal(redeemed, true);
    assert.match(sent[0].payload.text, /تم ربط/);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = previousSecret;
  }
});

test('backend 5xx response triggers retry instead of false success', async () => {
  const oldUrl = process.env.YALLA_BACKEND_URL;
  const oldSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'D'.repeat(48);
  try {
    await assert.rejects(
      redeemPairing('A'.repeat(32), '4', '4', async () => ({ status: 503 })),
      /Pairing bridge HTTP 503/
    );
  } finally {
    if (oldUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = oldSecret;
  }
});

test('invalid pairing code is reported without retrying', async () => {
  const oldUrl = process.env.YALLA_BACKEND_URL;
  const oldSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'D'.repeat(48);
  try {
    assert.equal(await redeemPairing('A'.repeat(32), '4', '4',
      async () => ({ status: 400 })), false);
  } finally {
    if (oldUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = oldSecret;
  }
});


test('private help and privacy commands show safe interactive menu', async () => {
  for (const [command, expected] of [['/help', /الأوامر/], ['/commands', /الأوامر/],
    ['/start', /الأوامر/], ['/privacy', /الخصوصية/]]) {
    const calls = [];
    await handleUpdate({
      message: { chat: { id: 71, type: 'private' }, from: { id: 71 }, text: command },
    }, async (method, payload) => calls.push({ method, payload }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'sendMessage');
    assert.match(calls[0].payload.text, expected);
    assert.equal(calls[0].payload.reply_markup.inline_keyboard[0][0].callback_data, 'menu:orders');
    assert.doesNotMatch(calls[0].payload.text, /0599000000|12345678/);
  }
});

test('menu callbacks never respond to a different Telegram identity', async () => {
  const calls = [];
  await handleUpdate({
    callback_query: { id: 'cb-other', from: { id: 90 },
      data: 'menu:privacy', message: { chat: { id: 71, type: 'private' } } },
  }, async (method) => calls.push(method));
  assert.deepEqual(calls, []);
});

test('help and privacy callbacks are answered without backend requests', async () => {
  for (const name of ['help', 'privacy']) {
    const calls = [];
    await handleUpdate({
      callback_query: { id: 'cb-' + name, from: { id: 71 },
        data: 'menu:' + name, message: { chat: { id: 71, type: 'private' } } },
    }, async (method, payload) => calls.push({ method, payload }));
    assert.deepEqual(calls.map(x => x.method), ['sendMessage', 'answerCallbackQuery']);
    assert.equal(calls[0].payload.chat_id, 71);
  }
});

test('unknown menu callback is acknowledged without order access', async () => {
  const calls = [];
  await handleUpdate({
    callback_query: { id: 'cb-unknown', from: { id: 71 },
      data: 'menu:invalid', message: { chat: { id: 71, type: 'private' } } },
  }, async (method, payload) => calls.push({ method, payload }));
  assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery']);
  assert.match(calls[0].payload.text, /غير متاح/);
});

test('private menu orders delegates to authenticated read-only backend', async () => {
  const oldUrl = process.env.YALLA_BACKEND_URL;
  const oldSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  const oldFetch = global.fetch;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'F'.repeat(48);
  global.fetch = async (url, opts) => {
    assert.equal(new URL(url).pathname, '/api/telegram-captain/internal/orders');
    assert.deepEqual(JSON.parse(opts.body), { telegramUserId: '71', telegramChatId: '71' });
    return { ok: true, json: async () => ({ linked: true, orders: [] }) };
  };
  try {
    const calls = [];
    await handleUpdate({
      callback_query: { id: 'cb-orders', from: { id: 71 },
        data: 'menu:orders', message: { chat: { id: 71, type: 'private' } } },
    }, async (method, payload) => calls.push({ method, payload }));
    assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'sendMessage']);
    assert.match(calls[1].payload.text, /لا توجد لديك طلبات نشطة/);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = oldSecret;
  }
});

test('permanently blocked Telegram users do not trigger infinite webhook retries', async () => {
  const send = createTelegramClient('test-token', async () => ({
    ok: false, status: 403,
    json: async () => ({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }),
  }));
  assert.equal(await send('sendMessage', { chat_id: 1, text: 'hello' }), null);
});

test('expired callback acknowledgements are safely discarded', async () => {
  const send = createTelegramClient('test-token', async () => ({
    ok: false, status: 400,
    json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: query is too old and response timeout expired or query ID is invalid' }),
  }));
  assert.equal(await send('answerCallbackQuery', { callback_query_id: 'expired' }), null);
  await assert.rejects(send('sendMessage', { chat_id: 1, text: 'hello' }), /Telegram HTTP 400/);
});

test('authorization, rate limits and server errors still retry instead of being swallowed', async () => {
  for (const [status, description] of [
    [403, 'Forbidden: invalid token'],
    [429, 'Too Many Requests: retry after 10'],
    [502, 'Bad Gateway'],
  ]) {
    const send = createTelegramClient('test-token', async () => ({
      ok: false, status, json: async () => ({ ok: false, error_code: status, description }),
    }));
    await assert.rejects(send('sendMessage', { chat_id: 1, text: 'hi' }),
      new RegExp('Telegram HTTP ' + status));
  }
});

test('Telegram API errors never expose backend response descriptions or tokens', async () => {
  const token = 'do-not-leak-secret-token';
  const send = createTelegramClient(token, async () => ({
    ok: false, status: 401,
    json: async () => ({ ok: false, error_code: 401, description: token }),
  }));
  await assert.rejects(send('sendMessage', { chat_id: 1 }), (error) => {
    assert.doesNotMatch(error.message, /do-not-leak-secret-token/);
    assert.match(error.message, /Telegram HTTP 401/);
    return true;
  });
});

test('malformed Telegram responses fail closed', async () => {
  const send = createTelegramClient('test-token', async () => ({
    ok: true, status: 200, json: async () => { throw Error('bad json'); },
  }));
  await assert.rejects(send('sendMessage', { chat_id: 1 }), /Telegram API invalid response/);
});


test('private menu navigation edits current message without duplicate replies', async () => {
  const calls = [];
  await handleUpdate({ callback_query: {
    id: 'menu-nav', from: { id: 77 }, data: 'menu:privacy',
    message: { message_id: 55, chat: { id: 77, type: 'private' } },
  } }, async (method, payload) => calls.push({ method, payload }));
  assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
  assert.equal(calls[1].payload.message_id, 55);
  assert.match(calls[1].payload.text, /الخصوصية/);
});

test('orders menu callback acknowledges once and updates existing card', async () => {
  const oldUrl = process.env.YALLA_BACKEND_URL;
  const oldSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  const oldFetch = global.fetch;
  process.env.YALLA_BACKEND_URL = 'https://api.example.org';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'F'.repeat(48);
  global.fetch = async (url, opts) => {
    assert.equal(new URL(url).pathname, '/api/telegram-captain/internal/orders');
    assert.deepEqual(JSON.parse(opts.body), { telegramUserId: '77', telegramChatId: '77' });
    return { ok: true, json: async () => ({ linked: true, orders: [] }) };
  };
  try {
    const calls = [];
    await handleUpdate({ callback_query: {
      id: 'menu-orders-nav', from: { id: 77 }, data: 'menu:orders',
      message: { message_id: 56, chat: { id: 77, type: 'private' } },
    } }, async (method, payload) => calls.push({ method, payload }));
    assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
    assert.equal(calls[1].payload.message_id, 56);
    assert.match(calls[1].payload.text, /لا توجد لديك طلبات نشطة/);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.YALLA_BACKEND_URL;
    else process.env.YALLA_BACKEND_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = oldSecret;
  }
});
