'use strict';

// أدوات قائمة الطعام والسلّة (Card 110) — دوال نقيّة بلا قاعدة بيانات، قابلة للاختبار.
// تُستخدم عند إنشاء طلب من مطعم: تطبيع السلّة القادمة من التطبيق، ثمّ بناء أسطر
// الطلب من أسعار قاعدة البيانات (مصدر الحقيقة — لا نثق بأسعار العميل)، وتلخيصها
// نصًّا يظهر للكابتن والأدمن في وصف الشحنة.

// الحدّ الأقصى للكمّية لكل صنف في السلّة (يمنع الأرقام العبثية)
const MAX_QTY = 50;

// الحدّ الأقصى لعدد الأصناف المختلفة في السلّة الواحدة
const MAX_LINES = 40;

/** تصنيف افتراضي للأصناف التي لا تحمل قسمًا */
const DEFAULT_CATEGORY = 'أصناف أخرى';

/**
 * تطبيع سلّة قادمة من العميل: [{menuItemId, qty, note}]
 * - يتجاهل المدخلات غير الصالحة (بلا معرّف أو بكمّية غير موجبة)
 * - يقصّ الكمّية إلى الحدّ الأقصى، ويدمج تكرار الصنف نفسه في سطر واحد
 * @param {Array} raw
 * @returns {Array<{menuItemId:string, qty:number, note:string}>}
 */
function normalizeCartItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const merged = new Map();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = (entry.menuItemId ?? entry.menuItem ?? entry.id ?? '').toString().trim();
    if (!id) continue;

    const qty = Math.floor(Number(entry.qty ?? entry.quantity ?? 1));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const note = (entry.note || '').toString().trim();
    const prev = merged.get(id);
    if (prev) {
      prev.qty = Math.min(MAX_QTY, prev.qty + qty);
      if (note && !prev.note) prev.note = note;
    } else {
      merged.set(id, { menuItemId: id, qty: Math.min(MAX_QTY, qty), note });
    }
  }

  return [...merged.values()].slice(0, MAX_LINES);
}

/**
 * بناء أسطر الطلب من أصناف قاعدة البيانات + السلّة المُطبّعة.
 * السعر يُؤخذ دائمًا من وثيقة الصنف (لا من العميل). الأصناف غير الموجودة أو
 * غير المتاحة أو التابعة لمطعم آخر تُعاد في `missing` ليرفضها المستدعي.
 * @param {Array} menuDocs  وثائق الأصناف من قاعدة البيانات
 * @param {Array} cartItems السلّة المُطبّعة (مخرجات normalizeCartItems)
 * @returns {{lines:Array, itemsTotal:number, missing:string[]}}
 */
function buildOrderLines(menuDocs, cartItems) {
  const byId = new Map(
    (Array.isArray(menuDocs) ? menuDocs : []).map((d) => [String(d._id ?? d.id), d])
  );

  const lines = [];
  const missing = [];

  for (const item of Array.isArray(cartItems) ? cartItems : []) {
    const doc = byId.get(String(item.menuItemId));
    if (!doc || doc.available === false) {
      missing.push(item.menuItemId);
      continue;
    }
    const price = Math.max(0, Number(doc.price) || 0);
    lines.push({
      menuItem: doc._id ?? doc.id,
      name: (doc.name || '').toString(),
      price,
      qty: item.qty,
      note: item.note || '',
    });
  }

  return { lines, itemsTotal: cartTotal(lines), missing };
}

/**
 * مجموع قيمة الأصناف (السعر × الكمّية) — مُقرَّب لخانتين عشريتين.
 * @param {Array<{price:number, qty:number}>} lines
 * @returns {number}
 */
function cartTotal(lines) {
  const sum = (Array.isArray(lines) ? lines : []).reduce(
    (acc, l) => acc + (Number(l?.price) || 0) * (Number(l?.qty) || 0),
    0
  );
  return Math.round(sum * 100) / 100;
}

/**
 * تلخيص السلّة نصًّا لوصف الشحنة: «مطعم كذا: ٢× برجر، ١× بطاطا».
 * يُخزَّن في packageNote ليقرأه الكابتن والأدمن دون فتح تفاصيل الطلب.
 * @param {string} restaurantName
 * @param {Array<{name:string, qty:number}>} lines
 * @param {string} [note] ملاحظة عامّة على الطلب
 * @returns {string}
 */
function summarizeCart(restaurantName, lines, note = '') {
  const items = (Array.isArray(lines) ? lines : [])
    .map((l) => `${l.qty}× ${l.name}`)
    .join('، ');
  const head = (restaurantName || '').toString().trim();
  const body = [head ? `${head}: ${items}` : items].filter(Boolean).join('');
  const extra = (note || '').toString().trim();
  return extra ? `${body} — ${extra}` : body;
}

/**
 * تجميع أصناف القائمة حسب القسم للعرض في التطبيق.
 * يحافظ على ترتيب ظهور الأقسام كما وردت في المصفوفة.
 * @param {Array<{category?:string}>} items
 * @returns {Array<{category:string, items:Array}>}
 */
function groupMenuByCategory(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = (item?.category || '').toString().trim() || DEFAULT_CATEGORY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([category, list]) => ({ category, items: list }));
}

/**
 * هل يبلغ مجموع السلّة الحدّ الأدنى لطلب المطعم؟
 * @param {number} itemsTotal
 * @param {number} minOrder
 * @returns {boolean}
 */
function meetsMinOrder(itemsTotal, minOrder) {
  const min = Math.max(0, Number(minOrder) || 0);
  return (Number(itemsTotal) || 0) >= min;
}

module.exports = {
  MAX_QTY,
  MAX_LINES,
  DEFAULT_CATEGORY,
  normalizeCartItems,
  buildOrderLines,
  cartTotal,
  summarizeCart,
  groupMenuByCategory,
  meetsMinOrder,
};
