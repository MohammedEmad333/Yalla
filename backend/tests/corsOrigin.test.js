'use strict';

// اختبارات وحدة لدمج أصول CORS (Card 105): يجب أن تعمل نسخة أندرويد من لوحة
// الأدمن (Capacitor) دائمًا دون إضافة أصلها يدويًا، مع الحفاظ على السلوك القديم
// (غياب القيمة أو "*" = السماح للجميع).

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCorsOrigin, CAPACITOR_ORIGINS } = require('../src/config/env');

test('parseCorsOrigin: غياب القيمة → "*" (السماح للجميع كما كان)', () => {
  assert.equal(parseCorsOrigin(undefined), '*');
  assert.equal(parseCorsOrigin(''), '*');
  assert.equal(parseCorsOrigin('*'), '*');
});

test('parseCorsOrigin: أصل واحد يُدمج مع أصول Capacitor', () => {
  const out = parseCorsOrigin('https://admin.example.com');
  assert.ok(Array.isArray(out));
  assert.ok(out.includes('https://admin.example.com'));
  for (const o of CAPACITOR_ORIGINS) assert.ok(out.includes(o), `يجب أن يحوي ${o}`);
});

test('parseCorsOrigin: عدّة أصول مفصولة بفاصلة + Capacitor بلا تكرار', () => {
  const out = parseCorsOrigin('https://a.com, https://b.com , https://localhost');
  assert.ok(out.includes('https://a.com') && out.includes('https://b.com'));
  // https://localhost مكرّر (مضبوط + Capacitor) — يظهر مرّة واحدة فقط
  assert.equal(out.filter((o) => o === 'https://localhost').length, 1);
});
