'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { record, snapshot, recordBestEffort } =
  require('../src/services/telegramCaptainMetrics.service');

test('aggregated metrics contain only allowlisted dimensions and counts', async () => {
  const writes = [];
  const model = { async updateOne(query, change, options) {
    writes.push({ query, change, options });
  } };
  await record('assigned', 'sent', { model, now: () => Date.parse('2026-11-16T14:00:00.000Z') });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].query, { day: '2026-11-16', kind: 'assigned', outcome: 'sent' });
  assert.equal(writes[0].change.$inc.count, 1);
  assert.equal(writes[0].options.upsert, true);
  assert.ok(!JSON.stringify(writes[0]).includes('chat_id'));
  await assert.rejects(record('status', 'unknown', { model }), /Invalid Telegram metric/);
  await assert.rejects(record('unknown', 'failed', { model }), /Invalid Telegram metric/);
});

test('snapshot reports daily outcome totals without private identifiers', async () => {
  const rows = [
    { day: '2026-11-15', kind: 'assigned', outcome: 'sent', count: 10 },
    { day: '2026-11-16', kind: 'status', outcome: 'failed', count: 2 },
    { day: '2026-11-16', kind: 'status', outcome: 'rate_limited', count: 1 },
    { day: '2026-11-16', kind: 'assigned', outcome: 'retried', count: 3 },
  ];
  const model = { find(query) {
    assert.equal(query.day.$gte, '2026-11-10');
    return { select() { return { sort() { return { lean: async () => rows }; } }; } };
  } };
  const deliveries = { async countDocuments(query) {
    assert.equal(query.state, 'sending');
    return 4;
  } };
  const report = await snapshot({ model, deliveries, days: 7, now: () => Date.parse('2026-11-16T15:00:00.000Z') });
  assert.equal(report.total.sent, 10);
  assert.equal(report.total.failed, 2);
  assert.equal(report.total.rate_limited, 1);
  assert.equal(report.total.retried, 3);
  assert.equal(report.byKind.status.failed, 2);
  assert.equal(report.stalled, 4);
  assert.equal(report.failureRatePercent, 23.08);
  assert.equal(report.daily.length, 2);
  assert.equal(Object.hasOwn(report, 'captainId'), false);
  assert.ok(!JSON.stringify(report).includes('telegramChatId'));
});

test('metrics failures are non-blocking and invalid reporting windows are rejected', async () => {
  await recordBestEffort('assigned', 'failed', { model: { async updateOne() {
    throw Error('database temporarily unavailable');
  } } });
  await assert.rejects(snapshot({ days: 0 }), /Invalid Telegram metric window/);
  await assert.rejects(snapshot({ days: 31 }), /Invalid Telegram metric window/);
});
