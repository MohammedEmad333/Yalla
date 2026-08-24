'use strict';

// اختبارات وحدة لرسائل الأدمن الجماعية (Card 66) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateBroadcast,
  includesUsers,
  includesCaptains,
} = require('../src/utils/broadcast');
const { BROADCAST_AUDIENCE } = require('../src/utils/constants');

test('validateBroadcast: يقبل رسالة للجميع', () => {
  const err = validateBroadcast({ audience: 'all', title: 'تنبيه', body: 'مرحبًا' });
  assert.equal(err, null);
});

test('validateBroadcast: يرفض جمهورًا غير صالح', () => {
  assert.ok(validateBroadcast({ audience: 'nobody', title: 'x' }));
});

test('validateBroadcast: يرفض عنوانًا فارغًا', () => {
  assert.ok(validateBroadcast({ audience: 'all', title: '   ' }));
});

test('validateBroadcast: يرفض المحدّد بلا مستلِمين', () => {
  const err = validateBroadcast({ audience: 'specific', title: 'x', userIds: [], captainIds: [] });
  assert.ok(err);
});

test('validateBroadcast: يقبل المحدّد مع كابتن واحد', () => {
  const err = validateBroadcast({ audience: 'specific', title: 'x', captainIds: ['c1'] });
  assert.equal(err, null);
});

test('validateBroadcast: يرفض عنوانًا طويلًا جدًا', () => {
  assert.ok(validateBroadcast({ audience: 'all', title: 'ا'.repeat(121) }));
});

test('includesUsers/includesCaptains: الجمهور "all" يشمل الفئتين', () => {
  assert.equal(includesUsers(BROADCAST_AUDIENCE.ALL), true);
  assert.equal(includesCaptains(BROADCAST_AUDIENCE.ALL), true);
});

test('includesUsers: "captains" لا يشمل الزبائن', () => {
  assert.equal(includesUsers(BROADCAST_AUDIENCE.CAPTAINS), false);
  assert.equal(includesCaptains(BROADCAST_AUDIENCE.CAPTAINS), true);
});

test('includes*: "specific" يعتمد على وجود معرّفات في الفئة', () => {
  assert.equal(includesUsers(BROADCAST_AUDIENCE.SPECIFIC, ['u1']), true);
  assert.equal(includesUsers(BROADCAST_AUDIENCE.SPECIFIC, []), false);
  assert.equal(includesCaptains(BROADCAST_AUDIENCE.SPECIFIC, ['c1']), true);
  assert.equal(includesCaptains(BROADCAST_AUDIENCE.SPECIFIC, []), false);
});
