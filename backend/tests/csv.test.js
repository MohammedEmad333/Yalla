'use strict';

// اختبارات وحدة لمُسلسِل الـ CSV — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { toCsv, escapeCell, csvForExcel, UTF8_BOM } = require('../src/utils/csv');

test('escapeCell: القيم البسيطة بلا تغيير', () => {
  assert.equal(escapeCell('hello'), 'hello');
  assert.equal(escapeCell(42), '42');
});

test('escapeCell: القيم الفارغة → نصّ فارغ', () => {
  assert.equal(escapeCell(null), '');
  assert.equal(escapeCell(undefined), '');
});

test('escapeCell: يغلّف عند وجود فاصلة أو سطر جديد', () => {
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('line1\nline2'), '"line1\nline2"');
});

test('escapeCell: يضاعف الاقتباسات الداخلية', () => {
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
});

test('toCsv: يبني ترويسة وصفوفًا', () => {
  const rows = [
    { id: '1', name: 'أحمد' },
    { id: '2', name: 'سارة' },
  ];
  const cols = [
    { key: 'id', header: 'المعرّف' },
    { key: 'name', header: 'الاسم' },
  ];
  const csv = toCsv(rows, cols);
  assert.equal(csv, 'المعرّف,الاسم\n1,أحمد\n2,سارة');
});

test('toCsv: يهرب القيم التي تحوي فواصل', () => {
  const rows = [{ addr: 'شارع 1, مبنى 2' }];
  const cols = [{ key: 'addr', header: 'العنوان' }];
  assert.equal(toCsv(rows, cols), 'العنوان\n"شارع 1, مبنى 2"');
});

test('toCsv: صفوف فارغة → الترويسة فقط', () => {
  assert.equal(toCsv([], [{ key: 'a', header: 'A' }]), 'A');
});

// Card 58: ملفّ Excel — BOM في المقدّمة، نهايات أسطر CRLF، وبلا سطر sep= الذي
// يكسر ترميز UTF-8 في Excel (كان يجعل العربية تظهر مشوّهة ط§ظ„…).
test('csvForExcel: يبدأ بـ BOM ولا يحوي سطر sep=', () => {
  const rows = [{ id: '1', name: 'أحمد' }];
  const cols = [{ key: 'id', header: 'المعرّف' }, { key: 'name', header: 'الاسم' }];
  const out = csvForExcel(rows, cols);
  assert.equal(out[0], UTF8_BOM, 'يبدأ بـ BOM');
  assert.ok(!out.includes('sep='), 'لا يحوي سطر sep=');
});

test('csvForExcel: نهايات أسطر CRLF ومحتوى مطابق لـ toCsv', () => {
  const rows = [{ a: '1' }, { a: '2' }];
  const cols = [{ key: 'a', header: 'A' }];
  const out = csvForExcel(rows, cols);
  assert.equal(out, UTF8_BOM + 'A\r\n1\r\n2');
});
