'use strict';

// Card 112: مواعيد عمل المطاعم — دوالّ نقيّة لحساب هل المطعم مفتوح الآن حسب
// وقت الفتح/الإغلاق (صيغة "HH:MM"، توقيت محلّي)، مع دعم الفترات العابرة لمنتصف
// الليل (مثل 20:00 → 02:00). التوقيت المحلّي المرجعي فلسطين (Asia/Hebron) —
// يعتمد على ICU الكامل في Node لمعالجة التوقيت الصيفي تلقائيًّا.

const DEFAULT_TZ = process.env.RESTAURANT_TZ || 'Asia/Hebron';

// يحوّل "HH:MM" إلى عدد دقائق منذ منتصف الليل، أو null إن كان فارغًا/غير صالح.
function toMinutes(hhmm) {
  const s = (hhmm ?? '').toString().trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// دقائق اليوم الحاليّة في المنطقة الزمنيّة المعطاة (0..1439).
function nowMinutesInTZ(tz = DEFAULT_TZ, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const min = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    return (h % 24) * 60 + min;
  } catch {
    return null; // منطقة زمنيّة غير مدعومة — نتجاهل قيد المواعيد
  }
}

/**
 * هل المطعم مفتوح الآن حسب مواعيده فقط (بمعزل عن مفتاح isOpen اليدوي)؟
 * مواعيد فارغة أو غير صالحة → يُعتبر مفتوحًا طوال اليوم (لا قيد).
 * @param {string} openTime "HH:MM"
 * @param {string} closeTime "HH:MM"
 * @param {number} [nowMin] دقائق اليوم (للاختبار) — الافتراضي وقت فلسطين الآن
 * @returns {boolean}
 */
function isOpenBySchedule(openTime, closeTime, nowMin = nowMinutesInTZ()) {
  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  if (open === null || close === null || open === close) return true; // بلا مواعيد محدّدة
  if (nowMin === null) return true; // تعذّر تحديد الوقت — لا نمنع الطلب
  if (close > open) return nowMin >= open && nowMin < close; // نفس اليوم
  return nowMin >= open || nowMin < close; // فترة تعبر منتصف الليل
}

module.exports = { toMinutes, nowMinutesInTZ, isOpenBySchedule, DEFAULT_TZ };
