'use strict';

// اختبارات وحدة لرمز التسليم (Card 20) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateDeliveryCode, verifyDeliveryCode, CODE_LENGTH } = require('../src/utils/deliveryCode');

test('generateDeliveryCode: أربعة أرقام دائمًا (مع أصفار بادئة)', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateDeliveryCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.match(code, /^[0-9]{4}$/);
  }
});

test('verifyDeliveryCode: يطابق الرمز الصحيح ويتسامح مع المسافات', () => {
  assert.equal(verifyDeliveryCode('0473', '0473'), true);
  assert.equal(verifyDeliveryCode('0473', ' 0473 '), true);
});

test('verifyDeliveryCode: يرفض الرمز الخاطئ أو المفقود', () => {
  assert.equal(verifyDeliveryCode('0473', '0000'), false);
  assert.equal(verifyDeliveryCode('0473', ''), false);
  assert.equal(verifyDeliveryCode('0473', undefined), false);
  assert.equal(verifyDeliveryCode('0473', null), false);
});

test('verifyDeliveryCode: يرفض دائمًا إن لم يوجد رمز مُخزَّن', () => {
  assert.equal(verifyDeliveryCode('', '0000'), false);
  assert.equal(verifyDeliveryCode(undefined, '0000'), false);
});
