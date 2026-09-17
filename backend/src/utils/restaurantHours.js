'use strict';

// مواعيد عمل المتاجر. الجدول الأسبوعي هو مصدر الحقيقة الجديد، مع إبقاء
// openTime/closeTime كخطة توافق للمتاجر القديمة التي لا تملك جدولًا أسبوعيًا.
// التوقيت المرجعي فلسطين ويُعالج التوقيت الصيفي تلقائيًا بواسطة Intl.

const DEFAULT_TZ = process.env.RESTAURANT_TZ || 'Asia/Hebron';

function toMinutes(hhmm) {
  const s = (hhmm ?? '').toString().trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function nowPartsInTZ(tz = DEFAULT_TZ, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const dayByName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayByName[weekday];
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const min = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isInteger(day) || Number.isNaN(h) || Number.isNaN(min)) return null;
    return { day, minutes: (h % 24) * 60 + min };
  } catch {
    return null;
  }
}

function nowMinutesInTZ(tz = DEFAULT_TZ, date = new Date()) {
  return nowPartsInTZ(tz, date)?.minutes ?? null;
}

/**
 * منطق الفترة اليومية القديمة. يبقى للتوافق مع سجلات لم يُحفظ لها weeklyHours بعد.
 */
function isOpenBySchedule(openTime, closeTime, nowMin = nowMinutesInTZ()) {
  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  if (open === null || close === null || open === close) return true;
  if (nowMin === null) return true;
  if (close > open) return nowMin >= open && nowMin < close;
  return nowMin >= open || nowMin < close;
}

/**
 * يفحص الجدول الأسبوعي عند يوم/دقائق محددة.
 * يرجع null إذا لم يوجد جدول صالح لليوم حتى نتمكن من الرجوع للتنسيق القديم.
 * يدعم فترة تعبر منتصف الليل، مثل الاثنين 20:00 → 02:00؛ عند الثلاثاء 01:00
 * يبقى المتجر مفتوحًا حتى لو كان الثلاثاء نفسه مغلقًا.
 */
function isOpenByWeeklyHoursAt(weeklyHours, day, nowMin) {
  if (!Array.isArray(weeklyHours) || weeklyHours.length === 0) return null;
  if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(nowMin)) return null;

  const rows = new Map();
  for (const raw of weeklyHours) {
    const rowDay = Number(raw?.day);
    if (Number.isInteger(rowDay) && rowDay >= 0 && rowDay <= 6) rows.set(rowDay, raw);
  }

  // قد تكون بداية الفترة في اليوم السابق وتمتد لما بعد منتصف الليل.
  const previousDay = (day + 6) % 7;
  const previous = rows.get(previousDay);
  if (previous && previous.closed !== true) {
    const previousOpen = toMinutes(previous.open);
    const previousClose = toMinutes(previous.close);
    if (
      previousOpen !== null &&
      previousClose !== null &&
      previousClose < previousOpen &&
      nowMin < previousClose
    ) {
      return true;
    }
  }

  const today = rows.get(day);
  if (!today) return null;
  if (today.closed === true) return false;

  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (open === null || close === null) return null;
  if (open === close) return true;
  if (close > open) return nowMin >= open && nowMin < close;
  return nowMin >= open;
}

function isOpenByWeeklyHours(weeklyHours, date = new Date(), tz = DEFAULT_TZ) {
  const now = nowPartsInTZ(tz, date);
  if (!now) return null;
  return isOpenByWeeklyHoursAt(weeklyHours, now.day, now.minutes);
}

/** الجدول الأسبوعي أولًا، ثم المواعيد القديمة فقط عند غياب جدول لذلك اليوم. */
function isRestaurantOpen(restaurant = {}, date = new Date(), tz = DEFAULT_TZ) {
  const weekly = isOpenByWeeklyHours(restaurant.weeklyHours, date, tz);
  if (weekly !== null) return weekly;
  return isOpenBySchedule(
    restaurant.openTime,
    restaurant.closeTime,
    nowMinutesInTZ(tz, date)
  );
}

module.exports = {
  toMinutes,
  nowPartsInTZ,
  nowMinutesInTZ,
  isOpenBySchedule,
  isOpenByWeeklyHoursAt,
  isOpenByWeeklyHours,
  isRestaurantOpen,
  DEFAULT_TZ,
};
