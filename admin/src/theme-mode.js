// وضع العرض (فاتح/ليلي/حسب النظام) للوحة الأدمن.
// نضع `data-theme` على <html>: القيمة "dark" أو "light" تفوز على إعداد النظام،
// وغيابها يعني «حسب النظام» (تتكفّل به prefers-color-scheme في tokens.css).
// الاختيار محفوظ في localStorage فيبقى بعد إغلاق التطبيق.

const KEY = 'themeMode';
export const THEME_MODES = ['system', 'light', 'dark'];

/** الوضع المحفوظ (افتراضيًّا: حسب النظام). */
export function getThemeMode() {
  const saved = localStorage.getItem(KEY);
  return THEME_MODES.includes(saved) ? saved : 'system';
}

/** هل الواجهة داكنة فعليًّا الآن؟ (للأيقونات ولون شريط الحالة) */
export function isDarkNow(mode = getThemeMode()) {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** تطبيق الوضع على <html> + مزامنة لون شريط المتصفّح/النظام. */
export function applyThemeMode(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);

  // لون شريط الحالة على أندرويد/كروم يتبع خلفية الشريط العلوي
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDarkNow(mode) ? '#1c1f24' : '#ffffff');
}

/** حفظ الوضع وتطبيقه. */
export function setThemeMode(mode) {
  const value = THEME_MODES.includes(mode) ? mode : 'system';
  localStorage.setItem(KEY, value);
  applyThemeMode(value);
  return value;
}

/** تهيئة مبكّرة (قبل أوّل رسم) لتفادي وميض الأبيض عند فتح التطبيق ليلًا. */
export function initThemeMode() {
  const mode = getThemeMode();
  applyThemeMode(mode);
  // تتبّع تغيّر إعداد النظام أثناء التشغيل عندما يكون الوضع «حسب النظام»
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getThemeMode() === 'system') applyThemeMode('system');
  });
  return mode;
}
