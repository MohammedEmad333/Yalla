'use strict';

// اختبارات وحدة لمنطق مواعيد عمل المطاعم — نقيّة بلا قاعدة بيانات ولا وقت حقيقي
// (نمرّر دقائق اليوم صراحةً).

const test = require('node:test');
const assert = require('node:assert/strict');

const { toMinutes, isOpenBySchedule } = require('../src/utils/restaurantHours');

test('toMinutes: يحوّل HH:MM إلى دقائق ويرفض غير الصالح', () => {
  assert.equal(toMinutes('09:00'), 540);
  assert.equal(toMinutes('23:30'), 1410);
  assert.equal(toMinutes(''), null);
  assert.equal(toMinutes('9'), null);
  assert.equal(toMinutes('25:00'), null);
});

test('isOpenBySchedule: مواعيد فارغة → مفتوح دائمًا', () => {
  assert.equal(isOpenBySchedule('', '', 0), true);
  assert.equal(isOpenBySchedule('09:00', '', 100), true);
});

test('isOpenBySchedule: فترة نفس اليوم 09:00–23:00', () => {
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('08:59')), false);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('09:00')), true);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('15:00')), true);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('23:00')), false);
});

test('isOpenBySchedule: فترة تعبر منتصف الليل 20:00–02:00', () => {
  assert.equal(isOpenBySchedule('20:00', '02:00', toMinutes('21:00')), true);
  assert.equal(isOpenBySchedule('20:00', '02:00', toMinutes('01:00')), true);
  assert.equal(isOpenBySchedule('20:00', '02:00', toMinutes('02:00')), false);
  assert.equal(isOpenBySchedule('20:00', '02:00', toMinutes('12:00')), false);
});
