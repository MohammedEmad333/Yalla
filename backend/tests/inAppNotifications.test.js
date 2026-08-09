'use strict';

// اختبارات وحدة لعدّ الإشعارات غير المقروءة — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { unreadCount } = require('../src/utils/notifications');

test('unreadCount: قائمة فارغة = 0', () => {
  assert.equal(unreadCount([]), 0);
});

test('unreadCount: يعدّ غير المقروء فقط', () => {
  const list = [{ read: false }, { read: true }, { read: false }];
  assert.equal(unreadCount(list), 2);
});

test('unreadCount: كلّها مقروءة = 0', () => {
  assert.equal(unreadCount([{ read: true }, { read: true }]), 0);
});
