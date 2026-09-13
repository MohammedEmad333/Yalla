'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone } = require('../src/utils/phone');

test('normalizePhone: يوحّد الأرقام العربية ويحذف المسافات والشرطات', () => {
  assert.equal(normalizePhone('٠٥٩-٩١١ ١٢٢٢'), '0599111222');
  assert.equal(normalizePhone('۰۵۹ ۹۱۱-۱۲۲۲'), '0599111222');
});

test('normalizePhone: يحافظ على + في بداية الرقم فقط', () => {
  assert.equal(normalizePhone('+970 59 911 1222'), '+970599111222');
});
