'use strict';

// اختبارات وحدة لمطابقة رابط الصورة المخزّنة في قاعدة البيانات (Card 102).
// نتحقّق أنّ نمط /files/<ObjectId> يُطابق الروابط الصحيحة ويرفض غيرها،
// حتى لا نحذف صورة قديمة عن طريق الخطأ عند التبديل.

const test = require('node:test');
const assert = require('node:assert/strict');

const { FILE_URL_RE, fileIdFromUrl } = require('../src/utils/avatarUrl');

test('FILE_URL_RE: يطابق رابط صورة قاعدة البيانات الصحيح', () => {
  const m = '/files/507f1f77bcf86cd799439011'.match(FILE_URL_RE);
  assert.ok(m);
  assert.equal(m[1], '507f1f77bcf86cd799439011');
});

test('FILE_URL_RE: يرفض روابط القرص القديمة والقيم الفارغة', () => {
  assert.equal(FILE_URL_RE.test('/uploads/avatars/avatar-123.jpg'), false);
  assert.equal(FILE_URL_RE.test('/files/not-an-id'), false);
  assert.equal(FILE_URL_RE.test(''), false);
  assert.equal(FILE_URL_RE.test('https://cdn/x/507f1f77bcf86cd799439011'), false);
});

test('fileIdFromUrl: يعيد المعرّف أو null', () => {
  assert.equal(fileIdFromUrl('/files/507f1f77bcf86cd799439011'), '507f1f77bcf86cd799439011');
  assert.equal(fileIdFromUrl('/uploads/avatars/x.jpg'), null);
  assert.equal(fileIdFromUrl(null), null);
  assert.equal(fileIdFromUrl(undefined), null);
});
