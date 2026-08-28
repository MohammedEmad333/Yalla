// Card 103: استقبال إشعارات Push في نسخة أندرويد من لوحة الأدمن.
//
// نستخدم واجهة Capacitor العامّة عبر window.Capacitor (تُحقَن داخل تطبيق
// أندرويد فقط) بدلًا من استيراد الحزم وقت البناء — هكذا يبقى بناء الويب
// (vite build) سليمًا دون الحاجة لتثبيت حزم Capacitor، وتُفعَّل الإشعارات
// تلقائيًا فقط داخل تطبيق الأندرويد حيث يكون المكوّن الإضافي مثبَّتًا.
//
// خطوات إعداد تطبيق الأندرويد موثّقة في admin/README-android.md

import { api } from './api/client';

// هل نعمل داخل تطبيق Capacitor أصلي (أندرويد)؟
function nativePush() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  const plugin = cap.Plugins && cap.Plugins.PushNotifications;
  return plugin || null;
}

let currentToken = null;
let listenersBound = false;

// إرسال رمز الجهاز إلى الخادم ليُسجَّل ضمن deviceTokens الخاصّة بالأدمن
async function sendTokenToServer(token) {
  try {
    await api.post('/notifications/device-token', { token });
    currentToken = token;
  } catch (_) {
    // فشل الشبكة/غير مصادَق — نتجاهل بأمان، سنعيد المحاولة عند الدخول التالي
  }
}

// تفعيل استقبال الإشعارات (يُستدعى بعد نجاح دخول الأدمن)
export async function enablePush() {
  const PushNotifications = nativePush();
  if (!PushNotifications) return; // ويب عادي — لا شيء نفعله

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return; // رفض المستخدم الإذن

    if (!listenersBound) {
      listenersBound = true;
      // عند نجاح التسجيل يصلنا رمز FCM — نرسله للخادم
      PushNotifications.addListener('registration', (t) => {
        const token = t && t.value;
        if (token) sendTokenToServer(token);
      });
      PushNotifications.addListener('registrationError', () => {
        // نتجاهل — قد لا تتوفّر إعدادات Firebase بعد
      });
    }

    await PushNotifications.register();
  } catch (_) {
    // أيّ خطأ في المكوّن الإضافي لا يجب أن يكسر اللوحة
  }
}

// إلغاء تسجيل رمز الجهاز عند تسجيل الخروج
export async function disablePush() {
  const PushNotifications = nativePush();
  if (!PushNotifications || !currentToken) return;
  try {
    await api.del('/notifications/device-token', { token: currentToken });
  } catch (_) {
    // نتجاهل
  }
  currentToken = null;
}
