'use strict';

const mongoose = require('mongoose');

// موديل يخزّن الملفّات المرفوعة (الصور) داخل قاعدة البيانات نفسها بدلًا من
// القرص المحلّي. سبب وجوده: تخزين الملفّات على قرص الخادم لا يُضمَن بقاؤه —
// فإن عمل الباك اند داخل حاوية Docker بلا volume دائم لمجلّد uploads/ (وهو
// حال النشر على خادم Oracle الحالي)، يُمحى المجلّد ومعه الصور عند كلّ إعادة
// نشر/بناء أو إعادة إنشاء للحاوية — فتختفي الصور الشخصية "بعد فترة" (Card 102).
// أمّا قاعدة البيانات (MongoDB على Oracle) فدائمة، فتبقى الصورة. حجم الصور
// الشخصية صغير (بحدّ 5MB لكلّ صورة، وغالبًا أقلّ) فلا يقترب من حدود التخزين.
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
