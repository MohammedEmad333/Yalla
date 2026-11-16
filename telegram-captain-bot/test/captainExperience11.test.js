'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLanguageStore } = require('../src/languageStore');
const { handleUpdate } = require('../src/telegram');
const { handleReadOnlyCommand } = require('../src/captainOrders');
const { t } = require('../src/i18n');

function privateMessage(text, id = 101) {
  return { message: { chat: { id, type: 'private' }, from: { id }, text } };
}
function privateCallback(data, id = 101) {
  return { callback_query: {
    id: 'callback-1', from: { id }, data,
    message: { message_id: 200, chat: { id, type: 'private' } },
  } };
}
test('Arabic remains default and both languages have safe order labels', () => {
  assert.match(t('ar', 'help'), /مساعد الكابتن/);
  assert.match(t('en', 'help'), /Captain Assistant/);
  assert.equal(t('en', 'status.picked_up'), 'On the way');
  assert.equal(t('unknown', 'buttons.orders'), t('ar', 'buttons.orders'));
});

test('language selection persists after bot restart and is scoped to the private chat', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalla-lang-'));
  const file = path.join(dir, 'data', 'prefs.json');
  try {
    const store = createLanguageStore({ file });
    const messages = [];
    await handleUpdate(privateCallback('language:set:en'), async (method, payload) => {
      messages.push({ method, payload });
    }, store);
    assert.equal(store.get('101'), 'en');
    assert.equal(store.get('102'), 'ar');
    assert.deepEqual(messages.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
    assert.match(messages[1].payload.text, /English saved/);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const reloaded = createLanguageStore({ file });
    assert.equal(reloaded.get('101'), 'en');
    const sent = [];
    await handleUpdate(privateMessage('/menu'), async (_method, payload) => sent.push(payload), reloaded);
    assert.match(sent[0].text, /Captain Assistant/);
    assert.equal(sent[0].reply_markup.inline_keyboard[0][0].callback_data, 'menu:orders');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('forged language-setting callbacks cannot modify another chat language', async () => {
  let writes = 0;
  const store = { get: () => 'ar', set: async () => { writes++; } };
  const sent = [];
  await handleUpdate({ callback_query: {
    id: 'forged', from: { id: 102 }, data: 'language:set:en',
    message: { chat: { id: 101, type: 'private' } },
  } }, async (...args) => sent.push(args), store);
  assert.equal(writes, 0);
  assert.deepEqual(sent, []);
  await handleUpdate(privateCallback('language:set:xx'), async (...args) => sent.push(args), store);
  assert.equal(writes, 0);
  assert.deepEqual(sent.map(x => x[0]), ['answerCallbackQuery']);
});

test('language preference updates serialize and retain previous state if writing fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalla-store-'));
  const file = path.join(dir, 'prefs.json');
  try {
    const store = createLanguageStore({ file });
    await Promise.all([store.set('101', 'en'), store.set('102', 'ar'), store.set('103', 'en')]);
    assert.equal(createLanguageStore({ file }).get('103'), 'en');
    await assert.rejects(store.set('104', 'invalid'));
    assert.equal(store.get('104'), 'ar');
    const blockedFile = path.join(dir, 'missing', 'prefs.json');
    const broken = createLanguageStore({ file: blockedFile, io: {
      readFileSync: fs.readFileSync,
      promises: { mkdir: async () => { throw new Error('disk unavailable'); },
        unlink: fs.promises.unlink },
    } });
    await assert.rejects(broken.set('104', 'en'), /disk unavailable/);
    assert.equal(broken.get('104'), 'ar');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('English filters use the authenticated backend before rendering and preserve order IDs', async () => {
  const id = 'a'.repeat(24);
  const calls = [];
  await handleReadOnlyCommand(privateCallback('orders:filter:accepted'),
    async (method, payload) => calls.push({ method, payload }),
    async (url, body) => {
      assert.equal(url, '/api/telegram-captain/internal/orders');
      assert.deepEqual(body, {
        telegramUserId: '101', telegramChatId: '101', status: 'accepted',
      });
      return { linked: true, orders: [{
        orderId: id, reference: 'aaaaaa', status: 'accepted', storeName: 'Market\nName',
      }] };
    }, 'en');
  assert.deepEqual(calls.map(x => x.method), ['answerCallbackQuery', 'editMessageText']);
  const card = calls[1].payload;
  assert.match(card.text, /Accepted orders \(1 shown/);
  assert.match(card.text, /1\. #aaaaaa/);
  assert.match(card.text, /Store: Market Name/);
  assert.doesNotMatch(card.text, /Market\nName/);
  assert.equal(card.reply_markup.inline_keyboard[0][0].callback_data, 'status:' + id);
  assert.equal(card.reply_markup.inline_keyboard[2][0].callback_data, 'orders:filter:accepted');
});

test('empty filtered views are localized and no unlinked data is shown', async () => {
  const sent = [];
  await handleReadOnlyCommand(privateCallback('orders:filter:picked_up'),
    async (method, payload) => sent.push({ method, payload }),
    async () => ({ linked: true, orders: [] }), 'en');
  assert.match(sent[1].payload.text, /No On the way orders/);
  assert.equal(sent[1].payload.reply_markup.inline_keyboard[0][0].callback_data, 'orders:refresh');
  const noAccess = [];
  await handleReadOnlyCommand(privateCallback('orders:filter:assigned'),
    async (method, payload) => noAccess.push({ method, payload }),
    async () => ({ linked: false, orders: [{
      orderId: 'a'.repeat(24), reference: 'aaaaaa', status: 'assigned',
    }] }), 'en');
  assert.match(noAccess[1].payload.text, /not linked or approved/);
  assert.deepEqual(noAccess[1].payload.reply_markup, { inline_keyboard: [] });
  assert.doesNotMatch(noAccess[1].payload.text, /aaaaaa/);
});

test('invalid filter callback never queries backend and forged sender is rejected', async () => {
  const calls = [];
  await handleReadOnlyCommand(privateCallback('orders:filter:delivered'),
    async (method, payload) => calls.push({ method, payload }),
    async () => { throw Error('backend must not be called'); }, 'en');
  assert.equal(calls.length, 0); // falls back to unknown callback acknowledgement in handleUpdate
  await handleUpdate(privateCallback('orders:filter:delivered'), async (method, payload) =>
    calls.push({ method, payload }), { get: () => 'en', set: async () => {} });
  assert.equal(calls[0].method, 'answerCallbackQuery');
  const spoofed = privateCallback('orders:filter:assigned');
  spoofed.callback_query.from.id = 999;
  const out = [];
  await handleReadOnlyCommand(spoofed, async (...args) => out.push(args),
    async () => { throw Error('forged identity'); }, 'en');
  assert.deepEqual(out, []);
});
