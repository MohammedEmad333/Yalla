'use strict';

const Settings = require('../models/Settings');
const logger = require('../utils/logger');

/**
 * طبقة خدمة إعدادات المنظومة القابلة للضبط لحظيًا (Singleton).
 * تحتفظ بنسخة مخبّأة في الذاكرة لتفادي الاستعلام في المسار الحرِج (إنشاء الطلب)،
 * وتُحدّثها عند كل كتابة. آمنة بلا قاعدة بيانات (تُعيد الافتراضيّات).
 */

// القيم الافتراضية عند غياب الوثيقة أو تعذّر القراءة
const DEFAULTS = Object.freeze({ autoAssignBroadcast: false });

let cache = null; // نسخة مخبّأة من الإعدادات ({ autoAssignBroadcast })

// تطبيع وثيقة الإعدادات إلى كائن بسيط قابل للإرجاع للواجهة
function shape(doc) {
  return { autoAssignBroadcast: !!(doc && doc.autoAssignBroadcast) };
}

/**
 * جلب الإعدادات (من المخبّأ إن توفّر، وإلا من القاعدة مع إنشائها إن غابت).
 * @returns {Promise<{autoAssignBroadcast:boolean}>}
 */
async function getSettings() {
  if (cache) return cache;
  try {
    let doc = await Settings.findOne({ key: 'global' });
    if (!doc) doc = await Settings.create({ key: 'global' });
    cache = shape(doc);
  } catch (err) {
    logger.warn('تعذّر قراءة الإعدادات — استخدام الافتراضيّات:', err.message);
    return { ...DEFAULTS };
  }
  return cache;
}

/**
 * قراءة متزامنة سريعة للمخبّأ (بلا استعلام). تُستخدم في المسارات الحرِجة بعد
 * ضمان تحميل الإعدادات مرّة عند الإقلاع (preload). تعود للافتراضيّات إن لم يُحمّل.
 * @returns {{autoAssignBroadcast:boolean}}
 */
function getCached() {
  return cache || { ...DEFAULTS };
}

/**
 * تحديث الإعدادات (كتابة جزئية) وتحديث المخبّأ.
 * @param {Partial<{autoAssignBroadcast:boolean}>} patch
 * @returns {Promise<{autoAssignBroadcast:boolean}>}
 */
async function updateSettings(patch = {}) {
  const update = {};
  if (typeof patch.autoAssignBroadcast === 'boolean') {
    update.autoAssignBroadcast = patch.autoAssignBroadcast;
  }
  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  cache = shape(doc);
  return cache;
}

// مُيسِّر: هل وضع الإسناد التلقائي (البثّ) مفعّل الآن؟ (يعتمد المخبّأ)
function isBroadcastMode() {
  return getCached().autoAssignBroadcast;
}

// تحميل الإعدادات مرّة عند الإقلاع لملء المخبّأ (يُستدعى من server.js)
async function preload() {
  try {
    await getSettings();
  } catch (_) {
    // نتجاهل — getCached يعود للافتراضيّات
  }
}

// مسح المخبّأ (للاختبارات)
function _clearCache() {
  cache = null;
}

module.exports = {
  getSettings,
  getCached,
  updateSettings,
  isBroadcastMode,
  preload,
  _clearCache,
  DEFAULTS,
};
