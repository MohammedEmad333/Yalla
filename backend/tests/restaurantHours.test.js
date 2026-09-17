'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toMinutes,
  isOpenBySchedule,
  isOpenByWeeklyHoursAt,
} = require('../src/utils/restaurantHours');

test('toMinutes: يحوّل HH:MM إلى دقائق ويرفض غير الصالح', () => {
  assert.equal(toMinutes('09:00'), 540);
  assert.equal(toMinutes('23:30'), 1410);
  assert.equal(toMinutes(''), null);
  assert.equal(toMinutes('9'), null);
  assert.equal(toMinutes('25:00'), null);
});

test('isOpenBySchedule: يبقى متاحًا للتوافق مع المواعيد القديمة', () => {
  assert.equal(isOpenBySchedule('', '', 0), true);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('08:59')), false);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('09:00')), true);
  assert.equal(isOpenBySchedule('09:00', '23:00', toMinutes('23:00')), false);
});

test('weekly hours: يستخدم ساعات اليوم الأسبوعية', () => {
  const hours = [
    { day: 0, open: '09:00', close: '23:00', closed: false },
    { day: 1, open: '10:00', close: '18:00', closed: false },
  ];
  assert.equal(isOpenByWeeklyHoursAt(hours, 0, toMinutes('08:59')), false);
  assert.equal(isOpenByWeeklyHoursAt(hours, 0, toMinutes('09:00')), true);
  assert.equal(isOpenByWeeklyHoursAt(hours, 0, toMinutes('22:59')), true);
  assert.equal(isOpenByWeeklyHoursAt(hours, 0, toMinutes('23:00')), false);
  assert.equal(isOpenByWeeklyHoursAt(hours, 1, toMinutes('09:30')), false);
  assert.equal(isOpenByWeeklyHoursAt(hours, 1, toMinutes('10:00')), true);
});

test('weekly hours: اليوم المغلق يبقى مغلقًا', () => {
  const hours = [{ day: 5, open: '09:00', close: '23:00', closed: true }];
  assert.equal(isOpenByWeeklyHoursAt(hours, 5, toMinutes('12:00')), false);
});

test('weekly hours: يدعم فترة تمتد لليوم التالي', () => {
  const hours = [
    { day: 1, open: '20:00', close: '02:00', closed: false },
    { day: 2, open: '09:00', close: '17:00', closed: true },
  ];
  assert.equal(isOpenByWeeklyHoursAt(hours, 1, toMinutes('21:00')), true);
  assert.equal(isOpenByWeeklyHoursAt(hours, 2, toMinutes('01:00')), true);
  assert.equal(isOpenByWeeklyHoursAt(hours, 2, toMinutes('02:00')), false);
});

test('weekly hours: يرجع null عند غياب يوم من الجدول للتوافق مع السجلات القديمة', () => {
  const hours = [{ day: 0, open: '09:00', close: '23:00', closed: false }];
  assert.equal(isOpenByWeeklyHoursAt(hours, 3, toMinutes('12:00')), null);
  assert.equal(isOpenByWeeklyHoursAt([], 3, toMinutes('12:00')), null);
});
