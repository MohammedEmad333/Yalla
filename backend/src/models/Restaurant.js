'use strict';

const mongoose = require('mongoose');

/**
 * موديل المطعم/المتجر (Card 110) — يختار الزبون مطعمًا، تظهر قائمته، ويطلب منه
 * مباشرةً عبر التطبيق. موقع المطعم هو نقطة استلام الطلب (pickup) تلقائيًا،
 * فيُحسب سعر التوصيل من موقعه إلى عنوان الزبون بنفس معادلة التسعير الحاليّة.
 */
const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // تصنيف المطعم للعرض والفلترة (مطاعم، شاورما، بيتزا، حلويات، سوبرماركت...)
    category: { type: String, default: 'مطاعم', trim: true, index: true },

    // صورة الغلاف (رابط مباشر أو /files/<id> لملفّ مرفوع)
    imageUrl: { type: String, default: '' },
    phone: { type: String, default: '' },

    // عنوان المطعم — المدينة والحي يحدّدان الإحداثيّات (نفس منطق الطلبات)
    city: { type: String, default: '', index: true },
    neighborhood: { type: String, default: '' },
    street: { type: String, default: '' },
    address: { type: String, default: '' }, // عنوان موحّد للعرض (يُركَّب تلقائيًا)

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

    // الحدّ الأدنى لقيمة الطلب (₪) — يمنع تأكيد سلّة أقلّ منه
    minOrder: { type: Number, default: 0 },

    // زمن التحضير التقديري بالدقائق (يُضاف لزمن التوصيل المتوقّع)
    prepMinutes: { type: Number, default: 15 },

    // مفتوح الآن؟ (يتحكّم به الأدمن) — المغلق يظهر في القائمة بلا إمكانية طلب
    isOpen: { type: Boolean, default: true },

    // مفعّل؟ (المعطّل لا يظهر للزبائن إطلاقًا)
    active: { type: Boolean, default: true, index: true },

    // ترتيب العرض (الأصغر أوّلًا) ثمّ حسب الاسم
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// فهرس جغرافي — يتيح لاحقًا ترتيب المطاعم حسب قربها من الزبون
restaurantSchema.index({ location: '2dsphere' });
// بحث بالاسم/الوصف من التطبيق
restaurantSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Restaurant', restaurantSchema);
