'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// Use the mock provider rather than external payment credentials in CI.
process.env.NODE_ENV = 'test';
const jawwal = require('../src/services/jawwalPayClient');
const { amountFor } = require('../src/services/directPayment.service');

test('Jawwal Pay recognizes positive confirmed-payment responses', () => {
  assert.equal(jawwal.isPaid({ status: 'PAID' }), true);
  assert.equal(jawwal.isPaid({ outcome: 'paid' }), true);
  assert.equal(jawwal.isPaid({ paid: true }), true);
});

test('Jawwal Pay never treats pending, failed, or cancelled responses as paid', () => {
  for (const payload of [{ status: 'otp_sent' }, { status: 'failed' }, { status: 'cancelled' }, { paid: false }, {}]) {
    assert.equal(jawwal.isPaid(payload), false);
  }
});

test('Jawwal Pay reads provider references and transaction identifiers', () => {
  assert.equal(jawwal.referenceOf({ payment_reference: ' pay-1 ' }), 'pay-1');
  assert.equal(jawwal.referenceOf({ reference: 'ref-2' }), 'ref-2');
  assert.equal(jawwal.referenceOf({ id: 'fallback-3' }), 'fallback-3');
  assert.equal(jawwal.transactionIdOf({ provider_transaction_id: ' tx-1 ' }), 'tx-1');
  assert.equal(jawwal.transactionIdOf({ transaction_id: 'tx-2' }), 'tx-2');
  assert.equal(jawwal.transactionIdOf({ transactionId: 'tx-3' }), 'tx-3');
});

test('direct payment amount includes items and delivery less earned discount', () => {
  assert.equal(amountFor({ store: { itemsTotal: 125.75 }, price: 9.5, rewardDiscount: 4 }), 131.25);
  assert.equal(amountFor({ store: { itemsTotal: 10 }, price: 5, rewardDiscount: 100 }), 0);
  assert.equal(amountFor({ price: 12.235 }), 12.24);
});

test('retrying a payment initiation with the same idempotency key preserves reference', async () => {
  const args = {
    mobile: '0591234567',
    amount: 17.5,
    externalReference: 'order-retry-001',
    idempotencyKey: 'jawwal-order:order-retry-001',
  };
  const first = await jawwal.createPayment(args);
  const retried = await jawwal.createPayment(args);
  assert.equal(first.reference, retried.reference);
  assert.ok(first.reference);
});

test('simulated gateway confirmation returns a paid response', async () => {
  const payment = await jawwal.createPayment({
    mobile: '0591234567',
    amount: 30,
    externalReference: 'order-confirm-002',
    idempotencyKey: 'jawwal-order:order-confirm-002',
  });
  const confirmed = await jawwal.confirmPayment(payment.reference, '1234');
  assert.equal(jawwal.isPaid(confirmed), true);
});
