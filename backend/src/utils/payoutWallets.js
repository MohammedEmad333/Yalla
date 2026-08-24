'use strict';

// محافظ الكابتن الإلكترونية المحفوظة (Card 67) — دوال نقيّة قابلة للاختبار بلا
// قاعدة بيانات. يخزّن الكابتن لكل تصنيف رقم المحفظة واسم صاحبها ليعرفه الأدمن
// عند تحويل الأموال. التصنيفات: بنك فلسطين، بال باي، جوال باي، وخيار "الكل".

const { PAYOUT_WALLET_CATEGORY } = require('./constants');

// التسميات العربية للتصنيفات (للعرض في لوحة الأدمن وتطبيق الكابتن)
const PAYOUT_CATEGORY_LABELS = Object.freeze({
  [PAYOUT_WALLET_CATEGORY.BANK_OF_PALESTINE]: 'بنك فلسطين',
  [PAYOUT_WALLET_CATEGORY.PALPAY]: 'محفظة بال باي',
  [PAYOUT_WALLET_CATEGORY.JAWWAL_PAY]: 'جوال باي',
  [PAYOUT_WALLET_CATEGORY.ALL]: 'الكل',
});

const VALID_CATEGORIES = Object.values(PAYOUT_WALLET_CATEGORY);

/**
 * تطبيع وتصفية قائمة محافظ الكابتن المُرسَلة من الواجهة.
 * يحذف الإدخالات غير الصالحة (تصنيف غير معروف أو رقم فارغ)، ويُبقي إدخالًا واحدًا
 * لكل تصنيف (الأحدث يفوز)، ويقصّ الأطوال. يُعيد مصفوفة جاهزة للتخزين.
 * @param {Array<{category?:string, number?:string, ownerName?:string}>} list
 * @returns {Array<{category:string, number:string, ownerName:string}>}
 */
function sanitizePayoutWallets(list) {
  if (!Array.isArray(list)) return [];
  const byCategory = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const category = String(raw.category || '').trim();
    const number = String(raw.number || '').trim();
    const ownerName = String(raw.ownerName || '').trim();
    // نتجاهل التصنيفات غير المعروفة أو الأرقام الفارغة
    if (!VALID_CATEGORIES.includes(category) || !number) continue;
    byCategory.set(category, {
      category,
      number: number.slice(0, 40),
      ownerName: ownerName.slice(0, 80),
    });
  }
  // نُرتّب حسب ترتيب التصنيفات الثابت لعرض متّسق
  return VALID_CATEGORIES.filter((c) => byCategory.has(c)).map((c) => byCategory.get(c));
}

module.exports = {
  PAYOUT_CATEGORY_LABELS,
  VALID_CATEGORIES,
  sanitizePayoutWallets,
};
