'use strict';

const mongoose = require('mongoose');

// FileAsset أصبح طبقة توافق للصور القديمة فقط.
// الصور الجديدة تُحفظ على قرص Oracle تحت MEDIA_ROOT وتُخدَم عبر /media/... مباشرة.
// أثناء الهجرة التدريجية ننقل binary القديم إلى القرص ونحتفظ بهذا السجلّ كـ metadata
// حتى تبقى روابط /files/<id> القديمة صالحة من دون تحديث كل السجلات دفعة واحدة.
const fileAssetSchema = new mongoose.Schema(
  {
    kind: { type: String, default: 'avatar', index: true },

    // موجود للصور القديمة التي لم تُهاجَر بعد. بعد نجاح النسخ إلى القرص يُزال الحقل.
    data: { type: Buffer, required: false },

    // مسار نسبي داخل MEDIA_ROOT للصورة القديمة بعد هجرتها، مثل:
    // legacy/507f1f77bcf86cd799439011.jpg
    storagePath: { type: String, default: '', trim: true },

    contentType: { type: String, required: true },
    size: { type: Number, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId },
    ownerRole: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FileAsset', fileAssetSchema);
