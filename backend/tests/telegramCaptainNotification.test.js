'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyAssignedOrder, assignmentText } = require('../src/services/telegramCaptainNotification.service');
const captainId = '507f1f77bcf86cd799439011';
const orderId = '507f1f77bcf86cd799439012';
const link = { telegramUserId: '123456', telegramChatId: '123456' };
const env = {
  TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED: 'true',
  TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS: captainId,
  TELEGRAM_BOT_TOKEN: 'test-only',
};
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

test('enabled flag still requires an explicit pilot allowlist', async () => {
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env: { TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-only' },
    findLink() { throw new Error('must not query link'); },
  })).status, 'not-allowlisted');
});
test('unlisted captain cannot receive an assignment', async () => {
  assert.equal((await notifyAssignedOrder({ captainId, orderId }, {
    env: { ...env, TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS: '507f1f77bcf86cd799439099' },
    findLink() { throw new Error('must not query link'); },
  })).status, 'not-allowlisted');
});

const { notifyOrderStatus, orderStatusText } = require('../src/services/telegramCaptainNotification.service');
const options = {
  env, findLink: async () => link, isApproved: async () => true,
  findCurrentOrder: async () => true,
  fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
};
test('status notifications are disabled by default and do not query data', async () => {
  assert.deepEqual(await notifyOrderStatus({ captainId, orderId, status: 'accepted' }, {
    env: {}, findLink: () => { throw Error('queried'); },
    findCurrentOrder: () => { throw Error('queried'); },
  }), { status: 'disabled' });
});
test('status notifications require pilot allowlist and valid events', async () => {
  assert.equal((await notifyOrderStatus({ captainId, orderId, status: 'accepted' }, {
    ...options, env: { ...env, TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS: '' },
  })).status, 'not-allowlisted');
  assert.equal((await notifyOrderStatus({ captainId, orderId, status: 'assigned' }, options)).status, 'invalid-event');
  assert.equal((await notifyOrderStatus({ captainId, orderId: 'invalid', status: 'cancelled' }, options)).status, 'invalid-event');
});
test('status notifications require same private Telegram chat and approved captain', async () => {
  assert.equal((await notifyOrderStatus({ captainId, orderId, status: 'picked_up' }, {
    ...options, findLink: async () => ({ telegramUserId: '2', telegramChatId: '1' }),
  })).status, 'unlinked');
  assert.equal((await notifyOrderStatus({ captainId, orderId, status: 'picked_up' }, {
    ...options, isApproved: async () => false,
  })).status, 'unapproved');
});
test('status notifications suppress stale or reassigned orders', async () => {
  assert.equal((await notifyOrderStatus({ captainId, orderId, status: 'delivered' }, {
    ...options, findCurrentOrder: async (id, owner, status) => {
      assert.equal(id, orderId);
      assert.equal(owner, captainId);
      assert.equal(status, 'delivered');
      return null;
    },
  })).status, 'stale-event');
});
test('status payload excludes sensitive fields even if passed extra customer data', async () => {
  for (const status of ['accepted', 'picked_up', 'delivered', 'cancelled']) {
    let payload;
    const result = await notifyOrderStatus({
      captainId, orderId, status, phone: '0599000000',
      deliveryCode: '1234', address: 'Private address', wallet: 500,
    }, {
      ...options, fetchImpl: async (_url, req) => {
        payload = JSON.parse(req.body);
        return { ok: true, json: async () => ({ ok: true }) };
      },
    });
    assert.equal(result.status, 'sent');
    assert.equal(payload.chat_id, link.telegramChatId);
    assert.equal(payload.protect_content, true);
    assert.ok(payload.text.includes(orderId.slice(-6)));
    assert.ok(!/0599000000|1234|Private address|wallet|500/.test(payload.text));
  }
  assert.throws(() => orderStatusText('bad', 'accepted'), /Invalid order status/);
});
test('Telegram status API errors do not pretend to be sent', async () => {
  await assert.rejects(notifyOrderStatus({ captainId, orderId, status: 'accepted' }, {
    ...options, fetchImpl: async () => ({ ok: false, status: 429 }),
  }), /HTTP 429/);
});
