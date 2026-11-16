'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sendOnce, eventKey, RETENTION_MS, LEASE_MS } = require('../src/services/telegramCaptainDelivery.service');
const event = { captainId: 'a'.repeat(24), orderId: 'b'.repeat(24),
  kind: 'status', status: 'accepted' };

function fakeLedger() {
  const records = new Map();
  return {
    records,
    async create(doc) {
      if (records.has(doc.key)) { const error = new Error('duplicate'); error.code = 11000; throw error; }
      records.set(doc.key, { ...doc });
    },
    findOne({ key }) {
      return { lean: async () => records.has(key) ? { ...records.get(key) } : null };
    },
    findOneAndUpdate(query, change) {
      const current = records.get(query.key);
      let result = null;
      if (current && current.state === query.state &&
          current.leaseUntil <= query.leaseUntil.$lte) {
        result = { ...current, ...change.$set };
        records.set(query.key, result);
      }
      return { lean: async () => result };
    },
    async updateOne(query, change) {
      const doc = records.get(query.key);
      if (!doc || doc.state !== query.state || doc.leaseToken !== query.leaseToken) {
        return { matchedCount: 0 };
      }
      records.set(query.key, { ...doc, ...change.$set, leaseToken: undefined, leaseUntil: undefined });
      return { matchedCount: 1 };
    },
    async deleteOne(query) {
      const doc = records.get(query.key);
      if (doc?.leaseToken === query.leaseToken && doc.state === query.state) records.delete(query.key);
    },
  };
}
test('unique event keys are deterministic and do not reveal order IDs', () => {
  const key = eventKey(event);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(key, /aaaaaaaa|bbbbbbbb/);
  assert.notEqual(key, eventKey({ ...event, status: 'delivered' }));
  assert.throws(() => eventKey({ ...event, status: 'invalid' }));
});
test('successful notifications remain deduplicated after service restart', async () => {
  const model = fakeLedger();
  let sent = 0;
  assert.deepEqual(await sendOnce(event, async () => { sent++; }, { model }),
    { status: 'sent' });
  // Fresh caller, durable collection retained.
  assert.deepEqual(await sendOnce(event, async () => { sent++; }, { model }),
    { status: 'duplicate' });
  assert.equal(sent, 1);
  const receipt = model.records.get(eventKey(event));
  assert.equal(receipt.state, 'sent');
  assert.ok(receipt.expiresAt > new Date(Date.now() + RETENTION_MS - 5000));
});
test('concurrent attempts do not send twice while one lease is active', async () => {
  const model = fakeLedger();
  let release;
  let enter;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { enter = resolve; });
  let sends = 0;
  const first = sendOnce(event, async () => { sends++; enter(); await gate; }, { model });
  await entered;
  assert.deepEqual(await sendOnce(event, async () => { sends++; }, { model }),
    { status: 'in-flight' });
  release();
  assert.deepEqual(await first, { status: 'sent' });
  assert.equal(sends, 1);
});
test('failed sends release lease; expired leases may recover', async () => {
  const model = fakeLedger();
  await assert.rejects(sendOnce(event, async () => { throw new Error('HTTP 503'); }, { model }),
    /HTTP 503/);
  assert.equal(model.records.size, 0);
  model.records.set(eventKey(event), { key: eventKey(event), state: 'sending',
    leaseToken: 'stale', leaseUntil: new Date(Date.now() - LEASE_MS),
    expiresAt: new Date(Date.now() + RETENTION_MS) });
  assert.deepEqual(await sendOnce(event, async () => {}, { model }), { status: 'sent' });
});
