'use strict';

// اختبارات وحدة لخدمة الإعدادات — تركّز على المنطق النقيّ للمخبّأ والافتراضيّات
// دون قاعدة بيانات (نعتمد على getCached والافتراضيّات).

const test = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../src/services/settings.service');

test('settings: الافتراضيّات — الإسناد التلقائي معطّل', () => {
  settings._clearCache();
  const cached = settings.getCached();
  assert.equal(cached.autoAssignBroadcast, false);
  assert.equal(settings.isBroadcastMode(), false);
});

test('settings: DEFAULTS ثابتة ومكشوفة', () => {
  assert.equal(settings.DEFAULTS.autoAssignBroadcast, false);
});

test('settings: getCached يعود للافتراضيّات بلا مخبّأ محمّل', () => {
  settings._clearCache();
  const cached = settings.getCached();
  assert.deepEqual(cached, { autoAssignBroadcast: false });
});
