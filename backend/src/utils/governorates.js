'use strict';

// محافظات/مناطق قطاع غزة (Card 96) — قائمة موحّدة تُستخدم في منتقي "مكان السكن"
// عند إنشاء حساب العميل، وفي عرض بيانات الزبائن بلوحة الأدمن.
// دالة نقيّة بلا قاعدة بيانات — قابلة للاختبار مباشرةً.
const GOVERNORATES = Object.freeze([
  'غزة',
  'بيت حانون',
  'بيت لاهيا',
  'خانيونس',
  'رفح',
  'النصيرات',
  'المغازي',
  'البريج',
  'دير البلح',
  'الزوايدة',
]);

/** أسماء المحافظات بالترتيب (للعرض في منتقي العميل). */
function listGovernorates() {
  return [...GOVERNORATES];
}

/** هل القيمة محافظة معروفة؟ (يُستخدم في التحقّق من صحّة المدخلات) */
function isValidGovernorate(name) {
  return GOVERNORATES.includes(name);
}

module.exports = { GOVERNORATES, listGovernorates, isValidGovernorate };
