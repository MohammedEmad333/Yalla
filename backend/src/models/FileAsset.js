'use strict';

const mongoose = require('mongoose');

// موديل يخزّن الملفّات المرفوعة (الصور) داخل قاعدة البيانات نفسها بدلًا من
// القرص المحلّي. سبب وجوده: الاستضافة المجانية (Render Free) تستخدم قرصًا
// مؤقّتًا (ephemeral) يُمحى عند كلّ إعادة تشغيل/نشر — فتختفي الصور الشخصية
// "بعد فترة" (Card 102). التخزين في MongoDB Atlas دائم، فتبقى الصورة.
const fileAssetSchema = new mongoose.Schema(
  {
    // نوع الأصل: avatar (صورة شخصية) — قابل للتوسّع لاحقًا (receipt / id ...)
    kind: { type: String, default: 'avatar', index: true },
    // بيانات الصورة الثنائية
    data: { type: Buffer, required: true },
    // نوع المحتوى (image/jpeg ...) لإرجاعه في ترويسة الاستجابة
    contentType: { type: String, required: true },
    // حجم الملفّ بالبايت (لمعلومة/تشخيص)
    size: { type: Number, default: 0 },
    // صاحب الملفّ (مستخدم أو كابتن) — للربط والتنظيف المستقبلي
    owner: { type: mongoose.Schema.Types.ObjectId },
    ownerRole: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FileAsset', fileAssetSchema);
