'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { makeEventHandler, validOrderEvent } = require('../src/eventServer');
const secret = 'Q'.repeat(48);
const valid = {
  orderId: 'a'.repeat(24), captainId: 'b'.repeat(24),
  eventType: 'assigned', status: 'assigned',
  eventId: 'a'.repeat(24) + ':assigned:assigned:1794247200000',
};
async function withServer(deliver, task) {
  const handler = makeEventHandler({ secret, deliver, logger: { error() {} } });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, key = secret) => fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-pairing-secret': key },
    body: JSON.stringify(body),
  });
  try { await task(post); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('validates event schema before processing', () => {
  assert.equal(validOrderEvent(valid), true);
  assert.equal(validOrderEvent({ ...valid, eventId: '../wrong' }), false);
  assert.equal(validOrderEvent({ ...valid, captainId: 'bad' }), false);
  assert.equal(validOrderEvent({ ...valid, eventType: 'accept' }), false);
});
test('internal event endpoint rejects wrong secret', async () => {
  let calls = 0;
  await withServer(() => { calls++; }, async post => {
    assert.equal((await post(valid, 'wrong')).status, 403);
    assert.equal(calls, 0);
  });
});
test('failed events may retry and successful duplicates are skipped', async () => {
  let count = 0;
  await withServer(async () => {
    count++;
    if (count === 1) throw Error('Telegram temporarily offline');
  }, async post => {
    assert.equal((await post(valid)).status, 503);
    assert.equal((await post(valid)).status, 200);
    assert.equal((await post(valid)).status, 200);
    assert.equal(count, 2);
  });
});
