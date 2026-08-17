'use strict';

// أحياء مدينة غزة (Card 27) — قائمة موحّدة تُستخدم في:
//   • منتقي الحي عند إنشاء الطلب (بدل خانة "المنطقة التقريبية" المحذوفة).
//   • اشتقاق إحداثيات النقطة (lng/lat) لحساب المسافة والسعر التقريبي.
//
// لكل حيّ إحداثيّة تمثيليّة [lng, lat] قرب مركزه — تكفي لتقدير المسافة بين
// الأحياء (نموذج التسعير: كل ١٦٠ مترًا = ١ شيكل). القائمة مرتّبة للعرض.
// دالة نقيّة بلا قاعدة بيانات — قابلة للاختبار مباشرةً.

// [lng, lat]
const GAZA_NEIGHBORHOODS = Object.freeze([
  { name: 'الرمال', coordinates: [34.4450, 31.5250] },
  { name: 'الرمال الجنوبي', coordinates: [34.4400, 31.5150] },
  { name: 'تل الهوا', coordinates: [34.4350, 31.5050] },
  { name: 'الشيخ عجلين', coordinates: [34.4250, 31.4950] },
  { name: 'الصبرة', coordinates: [34.4550, 31.5100] },
  { name: 'الزيتون', coordinates: [34.4650, 31.5000] },
  { name: 'الشجاعية', coordinates: [34.4800, 31.5050] },
  { name: 'التفاح', coordinates: [34.4700, 31.5150] },
  { name: 'الدرج', coordinates: [34.4600, 31.5080] },
  { name: 'الجلاء', coordinates: [34.4550, 31.5200] },
  { name: 'الوحدة', coordinates: [34.4500, 31.5150] },
  { name: 'الشيخ رضوان', coordinates: [34.4550, 31.5350] },
  { name: 'النصر', coordinates: [34.4450, 31.5350] },
  { name: 'الكرامة', coordinates: [34.4400, 31.5450] },
  { name: 'السلام', coordinates: [34.4500, 31.5400] },
  { name: 'الجديدة', coordinates: [34.4650, 31.5300] },
  { name: 'الزرقا', coordinates: [34.4700, 31.5450] },
  { name: 'الشاطئ', coordinates: [34.4300, 31.5300] },
  { name: 'الميناء', coordinates: [34.4250, 31.5200] },
  { name: 'المنطقة الصناعية', coordinates: [34.4800, 31.4900] },
]);

// فهرس سريع: اسم الحي → إحداثيّاته
const _byName = new Map(GAZA_NEIGHBORHOODS.map((n) => [n.name, n.coordinates]));

/** أسماء الأحياء بالترتيب (للعرض في منتقي العميل). */
function listNeighborhoods() {
  return GAZA_NEIGHBORHOODS.map((n) => n.name);
}

/** هل الاسم المُرسَل حيًّا معروفًا من أحياء غزة؟ */
function isValidNeighborhood(name) {
  return _byName.has((name || '').toString().trim());
}

/**
 * إحداثيّات حيّ بالاسم [lng, lat]، أو null إن لم يُعرَف.
 * @param {string} name
 * @returns {[number, number] | null}
 */
function coordsForNeighborhood(name) {
  const coords = _byName.get((name || '').toString().trim());
  return coords ? [...coords] : null;
}

module.exports = {
  GAZA_NEIGHBORHOODS,
  listNeighborhoods,
  isValidNeighborhood,
  coordsForNeighborhood,
};
