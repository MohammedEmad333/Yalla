'use strict';

// أدوات عنوان نقيّة (Card 21) — تركيب عنوان موحّد من الحقول المُفصّلة
// وتطبيع حمولة الموقع القادمة من العميل. قابلة للاختبار بلا قاعدة بيانات.

// ترتيب حقول العنوان المطلوب: الحي ← الشارع ← العنوان بالتفاصيل
const ADDRESS_PARTS = ['neighborhood', 'street', 'details'];

/**
 * تركيب عنوان نصّي موحّد من الحقول المُفصّلة (الحي، الشارع، التفاصيل).
 * يتجاهل الأجزاء الفارغة ويصلها بفاصلة عربية. (الملاحظة لا تدخل العنوان.)
 * @param {object} loc
 * @returns {string}
 */
function composeAddress(loc = {}) {
  return ADDRESS_PARTS.map((k) => (loc[k] || '').toString().trim())
    .filter(Boolean)
    .join('، ');
}

/**
 * تطبيع موقع طلب (استلام/تسليم): يحافظ على الحقول المُفصّلة، ويضمن وجود
 * عنوان موحّد `address` — يُركَّب من الأجزاء إن لم يُرسله العميل.
 * @param {object} loc  حمولة الموقع الخام من العميل
 * @returns {object}    موقع مُطبّع جاهز للتخزين
 */
function normalizeLocation(loc = {}) {
  const neighborhood = (loc.neighborhood || '').toString().trim();
  const street = (loc.street || '').toString().trim();
  const details = (loc.details || '').toString().trim();
  const note = (loc.note || '').toString().trim();

  const composed = composeAddress({ neighborhood, street, details });
  const address = (loc.address || '').toString().trim() || composed;

  return {
    ...loc,
    neighborhood,
    street,
    details,
    note,
    address,
  };
}

module.exports = { composeAddress, normalizeLocation, ADDRESS_PARTS };
