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

// علامة ترتيب البايتات لـ UTF-8 (BOM) — تُخبِر Excel أنّ الملفّ UTF-8 فتظهر العربية سليمة.
const UTF8_BOM = '﻿';

/**
 * بناء ملفّ CSV جاهز لفتحه في Excel مع دعم صحيح للعربية (Card 58).
 *
 * لماذا لا نضع سطر «sep=,»؟ عند بدء الملفّ بـ BOM ثمّ «sep=,» يتجاهل Excel الـ BOM
 * ويقرأ الملفّ بترميز النظام (Windows-1256) فتتحوّل العربية إلى رموز مشوّهة
 * (ط§ظ„…). كما أنّ سطر «sep=,» صفّ زائد يُفسد أي قارئ CSV قياسيّ. لذا نكتفي بـ:
 *   • BOM في المقدّمة  → Excel الحديث يقرأ الملفّ UTF-8 ويكتشف الفاصلة تلقائيًا.
 *   • نهايات أسطر CRLF → توافق أوسع مع Excel.
 * والنتيجة ملفّ CSV قياسيّ (RFC 4180) تظهر فيه العربية سليمة.
 *
 * @param {Array<Object>} rows
 * @param {Array<{key:string, header:string}>} columns
 * @returns {string} نصّ CSV مسبوقًا بـ BOM وبنهايات أسطر CRLF
 */
function csvForExcel(rows, columns) {
  return UTF8_BOM + toCsv(rows, columns).replace(/\n/g, '\r\n');
}

module.exports = { toCsv, escapeCell, csvForExcel, UTF8_BOM };
