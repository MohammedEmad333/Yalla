'use strict';

// بناء مرشّحات استعلام الطلبات والترقيم — دوال نقيّة قابلة للاختبار.

const { ORDER_STATUS } = require('./constants');

/**
 * بناء مرشّح MongoDB من معايير البحث.
 * @param {{status?:string, from?:string, to?:string, q?:string}} params
 * @returns {Object} كائن مرشّح صالح لـ Order.find
 */
function buildOrderFilter({ status, from, to, q } = {}) {
  const filter = {};

  // فلترة بالحالة (فقط إن كانت حالة معروفة)
  if (status && Object.values(ORDER_STATUS).includes(status)) {
    filter.status = status;
  }

  // فلترة بنطاق تاريخ الإنشاء (نتجاهل التواريخ غير الصالحة)
  const range = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) range.$gte = fromDate;
  if (toDate && !Number.isNaN(toDate.getTime())) range.$lte = toDate;
  if (Object.keys(range).length) filter.createdAt = range;

  // بحث نصّي في العناوين وملاحظة الشحنة (هروب المحارف الخاصّة)
  if (q && typeof q === 'string' && q.trim()) {
    const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [
      { 'pickup.address': rx },
      { 'dropoff.address': rx },
      { packageNote: rx },
    ];
  }

  return filter;
}

/**
 * تحويل معاملات الترقيم إلى skip/limit مع حدود آمنة.
 * @param {{page?:number|string, limit?:number|string}} params
 * @returns {{page:number, limit:number, skip:number}}
 */
function parsePagination({ page, limit } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20)); // بين 1 و 100
  return { page: p, limit: l, skip: (p - 1) * l };
}

module.exports = { buildOrderFilter, parsePagination };
