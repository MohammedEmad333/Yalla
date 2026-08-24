'use strict';

// أدوات تحقّق من المدخلات — دوال نقيّة قابلة للاختبار بلا إطار خارجي.
// كل مُتحقّق يُعيد رسالة خطأ (نص) عند الفشل، أو null عند النجاح.

const V = {
  required: (v) =>
    v === undefined || v === null || v === '' ? 'حقل مطلوب' : null,

  string: (v) => (typeof v === 'string' ? null : 'يجب أن يكون نصًا'),

  phone: (v) =>
    typeof v === 'string' && /^[0-9+\-\s]{6,15}$/.test(v) ? null : 'رقم هاتف غير صالح',

  number: (v) => (typeof v === 'number' && !Number.isNaN(v) ? null : 'يجب أن يكون رقمًا'),

  // مُنتِجات (higher-order) لمُتحقّقات ذات معاملات
  minLength: (n) => (v) =>
    typeof v === 'string' && v.length >= n ? null : `الطول الأدنى ${n} أحرف`,

  inRange: (min, max) => (v) =>
    typeof v === 'number' && v >= min && v <= max ? null : `القيمة يجب أن تكون بين ${min} و ${max}`,

  isIn: (list) => (v) => (list.includes(v) ? null : 'قيمة غير مسموحة'),

  // إحداثيات GeoJSON [lng, lat] ضمن النطاق الجغرافي الصحيح
  coordinates: (v) =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === 'number') &&
    v[0] >= -180 &&
    v[0] <= 180 &&
    v[1] >= -90 &&
    v[1] <= 90
      ? null
      : 'إحداثيات [lng, lat] غير صالحة',

  // موقع طلب: عنوان صالح + إحداثيات صالحة داخل location.coordinates.
  // العنوان صالح إمّا بحقل `address` نصّي، أو بأحد الحقول المُفصّلة (الحي/الشارع/التفاصيل)
  // ليُركَّب منها العنوان تلقائيًا لاحقًا (Card 21).
  location: (v) => {
    if (typeof v !== 'object' || v === null) return 'الموقع غير صالح';
    const hasAddress = typeof v.address === 'string' && v.address.trim() !== '';
    const hasParts = ['neighborhood', 'street', 'details'].some(
      (k) => typeof v[k] === 'string' && v[k].trim() !== ''
    );
    if (!hasAddress && !hasParts) return 'العنوان مطلوب (أدخل الحي/الشارع أو عنوانًا)';
    return V.coordinates(v.location?.coordinates);
  },

  // موقع بلا إحداثيّات (Card 68): يُستخدم لطلبات الأدمن حيث تُشتقّ الإحداثيّات من
  // الحي في الخادم لاحقًا. يكفي وجود حيّ (أو عنوان نصّي) لصلاحية المدخل.
  neighborhoodLocation: (v) => {
    if (typeof v !== 'object' || v === null) return 'الموقع غير صالح';
    const hasAddress = typeof v.address === 'string' && v.address.trim() !== '';
    const hasHood = typeof v.neighborhood === 'string' && v.neighborhood.trim() !== '';
    if (!hasAddress && !hasHood) return 'اختر الحي';
    return null;
  },
};

/**
 * تشغيل مخطّط تحقّق على كائن بيانات.
 * @param {Object<string, Function[]>} schema  {الحقل: [مُتحقّقات]}
 * @param {Object} data
 * @returns {Object} كائن الأخطاء ({} يعني صالح)
 */
function runSchema(schema, data = {}) {
  const errors = {};
  for (const [field, validators] of Object.entries(schema)) {
    const value = data[field];
    const isRequired = validators.includes(V.required);
    const absent = value === undefined || value === null || value === '';

    // حقل اختياري وغائب → لا نتحقّق منه
    if (absent && !isRequired) continue;

    for (const validate of validators) {
      const err = validate(value);
      if (err) {
        errors[field] = err;
        break; // أوّل خطأ لكل حقل يكفي
      }
    }
  }
  return errors;
}

module.exports = { V, runSchema };
