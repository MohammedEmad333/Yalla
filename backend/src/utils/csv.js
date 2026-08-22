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

/**
 * تنظيف قيمة خلية لتنسيق مفصول بالجدولة (TAB) — نزيل الجدولات والأسطر الجديدة
 * لأنّها فواصل الحقول/الصفوف فلا تُفسد التخطيط. (بيانات يلا نصّية بسيطة.)
 */
function sanitizeTabCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * بناء ملفّ Excel موثوق للعربية وفصل الأعمدة على كل اللغات (Card 58).
 *
 * المشكلة: ملفّ CSV بفاصلة عادية يعتمد على «فاصل القوائم» في إعدادات ويندوز:
 * فعلى Excel العربي/الأوروبي (فاصله «؛») تظهر كل البيانات في عمود واحد. وسطر
 * «sep=,» يحلّ الفصل لكنه يكسر ترميز UTF-8 فتتشوّه العربية.
 *
 * الحلّ الأمتَن: نُصدّر بترميز UTF-16LE مع BOM وفاصل جدولة (TAB). يتعرّف Excel
 * على ملفّات UTF-16 كنصّ Unicode (عربية سليمة) ويقسّمها على الجدولة تلقائيًا
 * بغضّ النظر عن إعداد فاصل القوائم في النظام — فتظهر الأعمدة صحيحة في كل اللغات.
 *
 * @param {Array<Object>} rows
 * @param {Array<{key:string, header:string}>} columns
 * @returns {Buffer} بايتات الملفّ (UTF-16LE + BOM + مفصول بالجدولة + أسطر CRLF)
 */
function excelUnicodeBuffer(rows, columns) {
  const header = columns.map((c) => sanitizeTabCell(c.header)).join('\t');
  const lines = rows.map((row) => columns.map((c) => sanitizeTabCell(row[c.key])).join('\t'));
  // البادئة '﻿' تُكتب كبايتات BOM لـ UTF-16LE (FF FE) عند الترميز.
  const content = '﻿' + [header, ...lines].join('\r\n');
  return Buffer.from(content, 'utf16le');
}

module.exports = { toCsv, escapeCell, csvForExcel, UTF8_BOM, excelUnicodeBuffer, sanitizeTabCell };
