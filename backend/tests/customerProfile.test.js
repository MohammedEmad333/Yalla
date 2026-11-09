'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EDITABLE_FIELDS, parseCustomerProfilePatch, parseCustomerUpdate } = require('../src/utils/customerProfile');

test('customer profile patch updates only allowed contact fields', () => {
  assert.deepEqual(EDITABLE_FIELDS, ['name', 'lastName', 'phone', 'email', 'governorate', 'city', 'address']);
  assert.deepEqual(parseCustomerProfilePatch({ name: '  محمد  ', address: '  رفيديا  ' }), {
    name: 'محمد',
    address: 'رفيديا',
  });
});

test('customer phone uses canonical Palestinian mobile format', () => {
  assert.deepEqual(parseCustomerProfilePatch({ phone: '+970 59 911 1222' }), {
    phone: '0599111222',
  });
  assert.deepEqual(parseCustomerProfilePatch({ phone: '٠٥٩٩١١١٢٢٢' }), {
    phone: '0599111222',
  });
  assert.throws(() => parseCustomerProfilePatch({ phone: '12345' }), /05xxxxxxxx/);
});

test('customer email can be normalized or cleared without sparse-index conflicts', () => {
  assert.deepEqual(parseCustomerProfilePatch({ email: '  Person@Example.COM  ' }), {
    email: 'person@example.com',
  });
  assert.deepEqual(parseCustomerProfilePatch({ email: '  ' }), { email: undefined });
  assert.throws(() => parseCustomerProfilePatch({ email: 'broken@@address' }), /البريد/);
});

test('customer profile patch rejects privileged fields and malformed payloads', () => {
  for (const field of ['role', 'adminRole', 'isActive', 'balance', 'passwordHash', 'emailVerifiedAt', 'loyaltyPoints']) {
    assert.throws(() => parseCustomerProfilePatch({ name: 'محمد', [field]: 'bad' }), /لا يُسمح/);
  }
  assert.throws(() => parseCustomerProfilePatch({}), /أدخل بيانات/);
  assert.throws(() => parseCustomerProfilePatch(null), /غير صالحة/);
  assert.throws(() => parseCustomerProfilePatch({ name: 42 }), /نصوصًا/);
  assert.throws(() => parseCustomerProfilePatch({ name: '  ' }), /اسم الزبون/);
  assert.throws(() => parseCustomerProfilePatch({ address: 'a'.repeat(501) }), /طويلة/);
});

test('password update is validated separately and never included in profile patch', () => {
  const result = parseCustomerUpdate({ name: 'محمد', newPassword: 'BetterPass123!' });
  assert.deepEqual(result.patch, { name: 'محمد' });
  assert.equal(result.newPassword, 'BetterPass123!');
  assert.deepEqual(parseCustomerUpdate({ newPassword: 'BetterPass123!' }).patch, {});
  assert.throws(() => parseCustomerUpdate({ newPassword: 'short' }), /10/);
  assert.throws(() => parseCustomerUpdate({ newPassword: '' }), /10/);
  assert.throws(() => parseCustomerUpdate({ newPassword: 'x'.repeat(129) }), /128/);
  assert.throws(() => parseCustomerUpdate({ newPassword: 22 }), /10/);
  assert.throws(() => parseCustomerUpdate({ passwordHash: 'bad', newPassword: 'BetterPass123!' }), /لا يُسمح/);
});
