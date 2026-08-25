'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GOVERNORATES,
  listGovernorates,
  isValidGovernorate,
} = require('../src/utils/governorates');

// Card 96: قائمة المحافظات المعتمَدة لمنتقي "مكان السكن"
test('listGovernorates: يُعيد كل محافظات القائمة بالترتيب', () => {
  const list = listGovernorates();
  assert.equal(list.length, GOVERNORATES.length);
  assert.deepEqual(list, [...GOVERNORATES]);
  // القائمة تشمل المحافظات المذكورة في البطاقة
  for (const g of ['غزة', 'بيت حانون', 'خانيونس', 'رفح', 'دير البلح', 'الزوايدة']) {
    assert.ok(list.includes(g), `يجب أن تتضمّن ${g}`);
  }
});

test('listGovernorates: نسخة جديدة لا تُعدّل المصدر', () => {
  const list = listGovernorates();
  list.push('محافظة وهمية');
  assert.ok(!GOVERNORATES.includes('محافظة وهمية'), 'المصدر يبقى ثابتًا');
});

test('isValidGovernorate: صحيح فقط للمحافظات المعروفة', () => {
  assert.equal(isValidGovernorate('غزة'), true);
  assert.equal(isValidGovernorate('رفح'), true);
  assert.equal(isValidGovernorate('القدس'), false);
  assert.equal(isValidGovernorate(''), false);
  assert.equal(isValidGovernorate(undefined), false);
});
