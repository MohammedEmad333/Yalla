'use strict';

// تحويل صفوف بيانات إلى CSV — دالة نقيّة قابلة للاختبار مع هروب صحيح للمحارف.

// هروب قيمة خلية واحدة وفق RFC 4180
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // نغلّف بعلامتَي اقتباس إن احتوت القيمة على فاصلة أو اقتباس أو سطر جديد
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`; // مضاعفة الاقتباسات الداخلية
  }
  return s;
}

/**
 * بناء نصّ CSV من صفوف وأعمدة.
 * @param {Array<Object>} rows
 * @param {Array<{key:string, header:string}>} columns
 * @returns {string} نصّ CSV (سطر ترويسة ثم الصفوف)
 */
function toCsv(rows, columns) {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key])).join(',')
  );
  return [headerLine, ...lines].join('\n');
}

module.exports = { toCsv, escapeCell };
