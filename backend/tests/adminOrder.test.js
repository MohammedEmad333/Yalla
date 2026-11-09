'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdminOrder } = require('../src/utils/adminOrder');

const id = '507f1f77bcf86cd799439011';
const address = (city, neighborhood) => ({ city, neighborhood, street: 'شارع', details: 'مدخل 1' });
const sample = () => ({
  userId: id,
  pickup: address('غزة', 'الرمال'),
  dropoff: address('غزة', 'الزيتون'),
  packageNote: 'طرد خفيف',
});

test('admin order derives approved coordinates on server', () => {
  const out = parseAdminOrder(sample());
  assert.equal(out.userId, id);
  assert.equal(out.payload.pickup.address, 'غزة، الرمال، شارع، مدخل 1');
  assert.deepEqual(out.payload.pickup.location.coordinates, [34.445, 31.525]);
  assert.deepEqual(out.payload.dropoff.location.coordinates, [34.465, 31.5]);
});

test('admin order cannot inject price, payment status, coordinates or other fields', () => {
  for (const data of [
    { ...sample(), price: 0 },
    { ...sample(), payment: { status: 'paid' } },
    { ...sample(), pickup: { ...sample().pickup, location: { coordinates: [0, 0] } } },
    { ...sample(), dropoff: { ...sample().dropoff, coordinates: [0, 0] } },
    { ...sample(), store: {} },
  ]) {
    assert.throws(() => parseAdminOrder(data), { statusCode: 400 });
  }
});

test('admin order rejects invalid neighborhoods, users, request keys and malformed fields', () => {
  assert.throws(() => parseAdminOrder({ ...sample(), userId: 'bad' }), { statusCode: 400 });
  assert.throws(() => parseAdminOrder({ ...sample(), pickup: address('غزة', 'حي غير صالح') }), { statusCode: 400 });
  assert.throws(() => parseAdminOrder({ ...sample(), requestKey: 'abc' }, true), { statusCode: 400 });
  assert.throws(() => parseAdminOrder({ ...sample(), packageNote: 'x'.repeat(501) }), { statusCode: 400 });
  assert.throws(() => parseAdminOrder({ ...sample(), pickup: { ...sample().pickup, street: 7 } }), { statusCode: 400 });
});

test('admin create requires idempotency key and keeps it in separate namespace', () => {
  assert.throws(() => parseAdminOrder(sample(), true), { statusCode: 400 });
  const created = parseAdminOrder({ ...sample(), requestKey: 'abcde1234567890fedcba' }, true);
  assert.equal(created.requestKey, 'admin:abcde1234567890fedcba');
});
