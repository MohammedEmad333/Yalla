'use strict';

const mongoose = require('mongoose');

/**
 * إعدادات المنظومة القابلة للضبط لحظيًا من لوحة الأدمن (Singleton).
 * وثيقة واحدة فقط (key='global') تحمل المفاتيح القابلة للتبديل أثناء التشغيل
 * دون إعادة نشر الخادم — على رأسها مفتاح «الإسناد التلقائي» (بثّ الطلبات لكل
 * الكباتن ليأخذها أوّل من يقبل).
 */
const settingsSchema = new mongoose.Schema(
  {
    // مفتاح ثابت لضمان وجود وثيقة واحدة فقط (فريد)
    key: { type: String, default: 'global', unique: true, index: true },

    // الإسناد التلقائي: عند التفعيل تُبثّ الطلبات الجديدة لكل الكباتن (مع إشعار
    // Push حتى لو الهاتف مغلق)، ويأخذها أوّل كابتن يقبلها ثم تختفي من الباقين.
    autoAssignBroadcast: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
