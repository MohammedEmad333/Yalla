'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePhone,
  normalizePalestinianMobile,
  isPalestinianMobile,
} = require('../src/utils/phone');

test('normalizePhone: يوحّد الأرقام العربية ويحذف المسافات والشرطات', () => {
  assert.equal(normalizePhone('٠٥٩-٩١١ ١٢٢٢'), '0599111222');
  assert.equal(normalizePhone('۰۵۹ ۹۱۱-۱۲۲۲'), '0599111222');
});

test('normalizePhone: يحافظ على + في بداية الرقم فقط', () => {
  assert.equal(normalizePhone('+970 59 911 1222'), '+970599111222');
});

test('normalizePalestinianMobile: يوحّد الصيغ المحلية والدولية إلى 05xxxxxxxx', () => {
  assert.equal(normalizePalestinianMobile('059-911 1222'), '0599111222');
  assert.equal(normalizePalestinianMobile('+970 59 911 1222'), '0599111222');
  assert.equal(normalizePalestinianMobile('970599111222'), '0599111222');
  assert.equal(normalizePalestinianMobile('00970 59 911 1222'), '0599111222');
  assert.equal(normalizePalestinianMobile('٠٥٩٩١١١٢٢٢'), '0599111222');
});

test('normalizePalestinianMobile: يرفض القيم التي لا يمكن تحويلها إلى رقم فلسطيني', () => {
  assert.equal(normalizePalestinianMobile('12345'), '');
  assert.equal(normalizePalestinianMobile('+972599111222'), '');
  assert.equal(normalizePalestinianMobile('05991112222'), '');
  assert.equal(isPalestinianMobile('0599111222'), true);
  assert.equal(isPalestinianMobile('12345'), false);
});
