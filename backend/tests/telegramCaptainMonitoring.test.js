'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyAssignedOrder, notifyOrderStatus } =
  require('../src/services/telegramCaptainNotification.service');

const captainId = 'a'.repeat(24), orderId = 'b'.repeat(24);
const env = {
  TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED: 'true',
  TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS: captainId,
  TELEGRAM_BOT_TOKEN: 'test-token',
};
const link = { telegramUserId: '123', telegramChatId: '123' };
const common = {
  env, findLink: async () => link, isApproved: async () => true,
  findCurrentOrder: async () => true,
};
test('assigned notifications count a successful 429 retry exactly once', async () => {
  const outcomes = [];
  let calls = 0;
  const result = await notifyAssignedOrder({ captainId, orderId }, {
    ...common, metrics: async (kind, outcome) => outcomes.push({ kind, outcome }),
    sendDelivery: async (_event, send) => { await send(); return { status: 'sent' }; },
    fetchImpl: async () => ++calls === 1
      ? { ok: false, status: 429, json: async () => ({ ok: false, parameters: { retry_after: 0 } }) }
      : { ok: true, status: 200, json: async () => ({ ok: true }) },
    sleep: async () => {},
  });
  assert.equal(result.status, 'sent');
  assert.equal(calls, 2);
  assert.deepEqual(outcomes, [{ kind: 'assigned', outcome: 'retried' }, { kind: 'assigned', outcome: 'sent' }]);
});

test('exhausted rate limiting records only safe categories then propagates', async () => {
  const outcomes = [];
  await assert.rejects(notifyOrderStatus({ captainId, orderId, status: 'accepted' }, {
    ...common, metrics: async (kind, outcome) => outcomes.push({ kind, outcome }),
    sendDelivery: async (_event, send) => { await send(); return { status: 'sent' }; },
    fetchImpl: async () => ({ ok: false, status: 429,
      json: async () => ({ ok: false, parameters: { retry_after: 12 } }) }),
    sleep: () => { throw Error('long sleep forbidden'); },
  }), /HTTP 429/);
  assert.deepEqual(outcomes, [{ kind: 'status', outcome: 'rate_limited' }]);
});

test('durable duplicate and in-flight notices are counted but never sent again', async () => {
  const outcomes = [];
  let sent = 0;
  for (const status of ['duplicate', 'in-flight']) {
    const result = await notifyOrderStatus({ captainId, orderId, status: 'picked_up' }, {
      ...common, metrics: async (kind, outcome) => outcomes.push([kind, outcome]),
      sendDelivery: async () => ({ status }),
      fetchImpl: async () => { sent++; throw Error('must not send'); },
    });
    assert.equal(result.status, status);
  }
  assert.equal(sent, 0);
  assert.deepEqual(outcomes, [['status', 'duplicate'], ['status', 'in_flight']]);
});

test('failed Telegram delivery reports failure without exposing response bodies', async () => {
  const outcomes = [];
  await assert.rejects(notifyAssignedOrder({ captainId, orderId }, {
    ...common, metrics: async (kind, outcome) => outcomes.push([kind, outcome]),
    sendDelivery: async (_event, send) => { await send(); return { status: 'sent' }; },
    fetchImpl: async () => ({ ok: false, status: 502,
      json: async () => ({ ok: false, description: 'private customer phone' }) }),
  }), e => /HTTP 502/.test(e.message) && !e.message.includes('customer phone'));
  assert.deepEqual(outcomes, [['assigned', 'failed']]);
});
