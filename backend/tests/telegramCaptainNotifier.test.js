'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sendOrderEvent } = require('../src/services/telegramCaptainNotifier.service');

function sample(status = 'assigned') {
  return {
    _id: 'a'.repeat(24), captain: 'b'.repeat(24), status,
    timeline: { assignedAt: new Date('2026-11-09T18:00:00Z'), acceptedAt: new Date('2026-11-09T18:01:00Z') },
  };
}

test('Telegram captain notification is opt-in and performs no network call by default', async () => {
  const prev = process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
  delete process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
  try {
    const result = await sendOrderEvent(sample(), 'assigned', () => { throw new Error('called'); });
    assert.equal(result.skipped, true);
  } finally {
    if (prev === undefined) delete process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
    else process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED = prev;
  }
});

test('outbound notification carries only IDs and status, not user PII', async () => {
  const prev = process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
  const prevSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED = 'true';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'K'.repeat(48);
  try {
    let calls = 0;
    const sampleOrder = { ...sample(), pickup: { address: 'secret pickup' }, user: { phone: 'secret phone' } };
    await sendOrderEvent(sampleOrder, 'assigned', async (url, opts) => {
      calls++;
      assert.equal(String(url), 'http://127.0.0.1:8098/internal/order-event');
      assert.equal(opts.headers['x-telegram-pairing-secret'], 'K'.repeat(48));
      const body = JSON.parse(opts.body);
      assert.deepEqual(Object.keys(body).sort(), ['captainId', 'eventId', 'eventType', 'orderId', 'status']);
      assert.equal(body.eventType, 'assigned');
      assert.equal(body.status, 'assigned');
      assert.ok(!opts.body.includes('secret pickup'));
      assert.ok(!opts.body.includes('secret phone'));
      return { ok: true };
    });
    assert.equal(calls, 1);
  } finally {
    if (prev === undefined) delete process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
    else process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED = prev;
    if (prevSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = prevSecret;
  }
});

test('failed internal push reports an error without disclosing secrets', async () => {
  const prev = process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
  const prevSecret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED = 'true';
  process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = 'K'.repeat(48);
  try {
    await assert.rejects(sendOrderEvent(sample(), 'assigned', async () => ({ ok: false, status: 503 })),
      /Telegram notification HTTP 503/);
  } finally {
    if (prev === undefined) delete process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED;
    else process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED = prev;
    if (prevSecret === undefined) delete process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    else process.env.TELEGRAM_PAIRING_BRIDGE_SECRET = prevSecret;
  }
});
