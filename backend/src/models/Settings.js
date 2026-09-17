'use strict';

const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },
    autoAssignBroadcast: { type: Boolean, default: false },
    statsResetAt: { type: Date, default: null },

    // إعدادات تحديث تطبيق Yalla — قابلة للتعديل لحظيًا من لوحة الإدارة.
    latestAppVersion: { type: String, default: '1.0.7' },
    minimumAppVersion: { type: String, default: '1.0.6' },
    forceAppUpdate: { type: Boolean, default: false },
    appUpdateEnabled: { type: Boolean, default: true },
    appUpdateTitle: { type: String, default: 'يتوفر إصدار جديد من Yalla', trim: true, maxlength: 120 },
    appUpdateMessage: { type: String, default: 'حدّث الآن للحصول على أحدث التحسينات وأفضل تجربة استخدام.', trim: true, maxlength: 500 },
    androidStoreUrl: { type: String, default: 'https://play.google.com/store/apps/details?id=com.mohammedemad333.yalla', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
