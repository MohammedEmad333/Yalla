'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleUpdate, createTelegramClient } = require('../src/telegram');
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
