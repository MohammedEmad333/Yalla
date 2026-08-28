'use strict';

// اختبارات وحدة لتحويل بيانات الصورة إلى Buffer (Card 104).
// السبب: قراءة FileAsset بـ .lean() تُعيد البيانات كـ BSON Binary لا Buffer،
// فكان الخادم يُرسلها كـ JSON (نصّ base64) بدل الصورة — فلا تظهر في التطبيق
// ولا لوحة الأدمن. نتحقّق أنّ toBuffer يُعيد Buffer صحيحًا من كلّ شكل محتمَل.

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { toBuffer } = require('../src/utils/toBuffer');

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('toBuffer: يمرّر Buffer كما هو', () => {
  const out = toBuffer(PNG);
  assert.ok(Buffer.isBuffer(out));
  assert.deepEqual([...out], [...PNG]);
});

test('toBuffer: يحوّل BSON Binary (كما تُعيده lean) إلى Buffer', () => {
  const { BSON } = mongoose.mongo;
  // نحاكي ما يعود من السائق: نُسلسِل ثم نفكّ بالخيارات الافتراضية → Binary
  const back = BSON.deserialize(BSON.serialize({ data: PNG }));
  assert.equal(back.data.constructor.name, 'Binary'); // تأكيد أنّه Binary لا Buffer
  const out = toBuffer(back.data);
  assert.ok(Buffer.isBuffer(out));
  assert.deepEqual([...out], [...PNG]);
});

test('toBuffer: يحوّل Buffer المسلسَل ({type:"Buffer", data:[...]})', () => {
  const out = toBuffer({ type: 'Buffer', data: [...PNG] });
  assert.ok(Buffer.isBuffer(out));
  assert.deepEqual([...out], [...PNG]);
});

test('toBuffer: يعيد null للقيم الفارغة', () => {
  assert.equal(toBuffer(null), null);
  assert.equal(toBuffer(undefined), null);
});
