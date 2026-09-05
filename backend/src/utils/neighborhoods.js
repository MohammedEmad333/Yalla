'use strict';

// أحياء قطاع غزة مُصنّفة حسب المدينة (Card 109) — تُستخدم في:
//   • منتقي "المدينة" ثم "الحي" عند إنشاء الطلب (المدينة قبل الحي).
//   • اشتقاق إحداثيّات النقطة (lng/lat) لحساب المسافة والسعر التقريبي.
//
// المدن: غزة، شمال غزة، الوسطى، خانيونس، رفح. لكل حيّ إحداثيّة تمثيليّة
// [lng, lat] قرب مركزه تكفي لتقدير المسافة (نموذج التسعير: كل ٢٥٠ مترًا = ١ شيكل).
// دالة نقيّة بلا قاعدة بيانات — قابلة للاختبار مباشرةً.

// أحياء مدينة غزة (Card 27 — القائمة الأصلية)
const GAZA_NEIGHBORHOODS = Object.freeze([
  { name: 'الرمال', coordinates: [34.4450, 31.5250] },
  { name: 'الرمال الجنوبي', coordinates: [34.4400, 31.5150] },
  { name: 'تل الهوا', coordinates: [34.4350, 31.5050] },
  { name: 'الشيخ عجلين', coordinates: [34.4250, 31.4950] },
  { name: 'الصبرة', coordinates: [34.4550, 31.5100] },
  { name: 'الزيتون', coordinates: [34.4650, 31.5000] },
  { name: 'الشجاعية', coordinates: [34.4800, 31.5050] },
  { name: 'التفاح', coordinates: [34.4700, 31.5150] },
  { name: 'الدرج', coordinates: [34.4600, 31.5080] },
  { name: 'الجلاء', coordinates: [34.4550, 31.5200] },
  { name: 'الوحدة', coordinates: [34.4500, 31.5150] },
  { name: 'الشيخ رضوان', coordinates: [34.4550, 31.5350] },
  { name: 'النصر', coordinates: [34.4450, 31.5350] },
  { name: 'الكرامة', coordinates: [34.4400, 31.5450] },
  { name: 'السلام', coordinates: [34.4500, 31.5400] },
  { name: 'الجديدة', coordinates: [34.4650, 31.5300] },
  { name: 'الزرقا', coordinates: [34.4700, 31.5450] },
  { name: 'الشاطئ', coordinates: [34.4300, 31.5300] },
  { name: 'الميناء', coordinates: [34.4250, 31.5200] },
  { name: 'المنطقة الصناعية', coordinates: [34.4800, 31.4900] },
]);

// أحياء/مناطق شمال غزة
const NORTH_GAZA_NEIGHBORHOODS = Object.freeze([
  { name: 'جباليا', coordinates: [34.4830, 31.5280] },
  { name: 'جباليا النزلة', coordinates: [34.4900, 31.5350] },
  { name: 'بيت لاهيا', coordinates: [34.5020, 31.5490] },
  { name: 'مشروع بيت لاهيا', coordinates: [34.4970, 31.5420] },
  { name: 'بيت حانون', coordinates: [34.5350, 31.5400] },
  { name: 'العطاطرة', coordinates: [34.4850, 31.5560] },
  { name: 'الصفطاوي', coordinates: [34.4700, 31.5250] },
  { name: 'تل الزعتر', coordinates: [34.4920, 31.5200] },
  { name: 'القرية البدوية', coordinates: [34.5080, 31.5330] },
]);

// أحياء/مناطق المحافظة الوسطى
const MIDDLE_NEIGHBORHOODS = Object.freeze([
  { name: 'دير البلح', coordinates: [34.3510, 31.4180] },
  { name: 'النصيرات', coordinates: [34.3930, 31.4470] },
  { name: 'البريج', coordinates: [34.4040, 31.4370] },
  { name: 'المغازي', coordinates: [34.3980, 31.4270] },
  { name: 'الزوايدة', coordinates: [34.3750, 31.4350] },
  { name: 'المصدر', coordinates: [34.4000, 31.4180] },
  { name: 'وادي غزة', coordinates: [34.4180, 31.4620] },
]);

// أحياء/مناطق محافظة خانيونس
const KHAN_YOUNIS_NEIGHBORHOODS = Object.freeze([
  { name: 'خانيونس البلد', coordinates: [34.3060, 31.3460] },
  { name: 'بني سهيلا', coordinates: [34.3230, 31.3460] },
  { name: 'عبسان الكبيرة', coordinates: [34.3400, 31.3280] },
  { name: 'عبسان الصغيرة', coordinates: [34.3450, 31.3350] },
  { name: 'خزاعة', coordinates: [34.3520, 31.3430] },
  { name: 'القرارة', coordinates: [34.3130, 31.3770] },
  { name: 'المواصي', coordinates: [34.2700, 31.3500] },
  { name: 'معن', coordinates: [34.3250, 31.3600] },
]);

// أحياء/مناطق محافظة رفح
const RAFAH_NEIGHBORHOODS = Object.freeze([
  { name: 'رفح البلد', coordinates: [34.2460, 31.2870] },
  { name: 'تل السلطان', coordinates: [34.2300, 31.3000] },
  { name: 'الشابورة', coordinates: [34.2530, 31.2930] },
  { name: 'يبنا', coordinates: [34.2560, 31.2830] },
  { name: 'البرازيل', coordinates: [34.2480, 31.2780] },
  { name: 'مواصي رفح', coordinates: [34.2200, 31.2900] },
  { name: 'النصر (رفح)', coordinates: [34.2600, 31.3000] },
  { name: 'الشوكة', coordinates: [34.2900, 31.2700] },
]);

// خريطة المدينة → أحياؤها (مرتّبة للعرض)
const CITY_NEIGHBORHOODS = Object.freeze({
  'غزة': GAZA_NEIGHBORHOODS,
  'شمال غزة': NORTH_GAZA_NEIGHBORHOODS,
  'الوسطى': MIDDLE_NEIGHBORHOODS,
  'خانيونس': KHAN_YOUNIS_NEIGHBORHOODS,
  'رفح': RAFAH_NEIGHBORHOODS,
});

// أسماء المدن بالترتيب (للعرض في منتقي المدينة)
const CITIES = Object.freeze(Object.keys(CITY_NEIGHBORHOODS));

// فهرس سريع لكل مدينة: اسم الحي → إحداثيّاته (لبحثٍ دقيق داخل المدينة)
const _byCity = new Map(
  CITIES.map((city) => [
    city,
    new Map(CITY_NEIGHBORHOODS[city].map((n) => [n.name, n.coordinates])),
  ])
);

/** أسماء المدن بالترتيب. */
function listCities() {
  return [...CITIES];
}

/** هل القيمة مدينة معروفة؟ */
function isValidCity(city) {
  return _byCity.has((city || '').toString().trim());
}

/** أسماء أحياء مدينة معيّنة (فارغة إن كانت المدينة مجهولة). */
function listNeighborhoodsByCity(city) {
  const key = (city || '').toString().trim();
  const list = CITY_NEIGHBORHOODS[key];
  return list ? list.map((n) => n.name) : [];
}

/** خريطة {المدينة: [أسماء الأحياء]} — لجلبها دفعةً واحدة في العميل. */
function neighborhoodsByCity() {
  const out = {};
  for (const city of CITIES) out[city] = CITY_NEIGHBORHOODS[city].map((n) => n.name);
  return out;
}

/** كل أسماء الأحياء في كل المدن (توافقًا مع ما سبق — منتقي الحي المسطّح). */
function listNeighborhoods() {
  return CITIES.flatMap((city) => CITY_NEIGHBORHOODS[city].map((n) => n.name));
}

/** هل الاسم المُرسَل حيًّا معروفًا في أيّ مدينة (أو داخل مدينة محدّدة إن مُرّرت)؟ */
function isValidNeighborhood(name, city) {
  const n = (name || '').toString().trim();
  if (!n) return false;
  const c = (city || '').toString().trim();
  if (c && _byCity.has(c)) return _byCity.get(c).has(n);
  return CITIES.some((cityName) => _byCity.get(cityName).has(n));
}

/**
 * إحداثيّات حيّ بالاسم [lng, lat]، أو null إن لم يُعرَف.
 * يُفضّل تمرير المدينة لدقّة أعلى (أسماء أحياء قد تتكرّر بين المدن)؛ وبدونها
 * يُبحث في كل المدن ويُعاد أوّل تطابق (توافقًا مع ما سبق).
 * @param {string} name
 * @param {string} [city]
 * @returns {[number, number] | null}
 */
function coordsForNeighborhood(name, city) {
  const n = (name || '').toString().trim();
  if (!n) return null;
  const c = (city || '').toString().trim();
  if (c && _byCity.has(c)) {
    const coords = _byCity.get(c).get(n);
    return coords ? [...coords] : null;
  }
  for (const cityName of CITIES) {
    const coords = _byCity.get(cityName).get(n);
    if (coords) return [...coords];
  }
  return null;
}

module.exports = {
  GAZA_NEIGHBORHOODS,
  CITY_NEIGHBORHOODS,
  CITIES,
  listCities,
  isValidCity,
  listNeighborhoodsByCity,
  neighborhoodsByCity,
  listNeighborhoods,
  isValidNeighborhood,
  coordsForNeighborhood,
};
