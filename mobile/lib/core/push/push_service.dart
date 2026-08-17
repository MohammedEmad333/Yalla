// خدمة الإشعارات المنبثقة (FCM) — بطاقة 22: تصل الإشعارات حتى والتطبيق مغلق.
//
// تصميم آمن: إن لم يُولَّد `firebase_options.dart` بعد (لم يُشغَّل flutterfire
// configure)، تفشل التهيئة بهدوء وتبقى الإشعارات معطّلة دون أن تُعطّل بقيّة التطبيق.
//
// كيف تصل والتطبيق مغلق؟ الخادم يرسل رسالة تحوي كتلة notification بأولويّة عالية،
// فيعرضها نظام التشغيل تلقائيًا في شريط الإشعارات دون الحاجة لتشغيل كود التطبيق.

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../network/api_client.dart';
import '../../firebase_options.dart';

/// معالج رسائل الخلفية — **يجب** أن يبقى دالّة علوية (top-level) موسومة بـ
/// vm:entry-point، لأنّ النظام يستدعيه في عزلة Dart منفصلة عندما يصل إشعار
/// والتطبيق مغلق أو في الخلفية. النظام يعرض كتلة notification تلقائيًا؛ نُعيد
/// تهيئة Firebase فقط ليعمل أي منطق لاحق بأمان.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // Firebase غير مُهيّأ — لا شيء نفعله في الخلفية
  }
}

class PushService {
  final ApiClient api;
  PushService(this.api);

  static bool _ready = false; // هل نجحت تهيئة Firebase؟
  bool get isReady => _ready;

  /// تهيئة Firebase وتسجيل معالج الخلفية — تُستدعى مرّة واحدة عند إقلاع التطبيق.
  /// آمنة: إن لم يُولَّد firebase_options.dart تبقى الإشعارات معطّلة.
  static Future<void> initialize() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      _ready = true;
    } catch (e) {
      _ready = false;
      debugPrint('FCM غير مُهيّأ (شغّل flutterfire configure لتفعيله): $e');
    }
  }

  /// بعد تسجيل الدخول (أو استعادة الجلسة): طلب الإذن، جلب رمز الجهاز، وتسجيله
  /// في الخادم على /notifications/device-token. آمنة ضدّ الفشل.
  Future<void> registerAfterLogin() async {
    if (!_ready) return;
    try {
      final messaging = FirebaseMessaging.instance;
      // الإذن مطلوب على iOS و Android 13+ (POST_NOTIFICATIONS)
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) await _send(token);
      // عند تدوير الرمز لاحقًا نُحدّثه في الخادم تلقائيًا
      messaging.onTokenRefresh.listen(_send);
    } catch (e) {
      debugPrint('تعذّر تسجيل رمز الإشعارات: $e');
    }
  }

  Future<void> _send(String token) async {
    try {
      await api.post('/notifications/device-token', {'token': token});
    } catch (_) {
      // لا نُعطّل تسجيل الدخول إن فشل تسجيل الرمز
    }
  }

  /// عند تسجيل الخروج: إلغاء تسجيل رمز هذا الجهاز من الخادم.
  /// يجب استدعاؤها **قبل** مسح التوكن ليمرّ الطلب مصادَقًا.
  Future<void> unregister() async {
    if (!_ready) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await api.delete('/notifications/device-token', {'token': token});
      }
    } catch (_) {
      // تجاهل — الخروج يجب أن يكتمل على أي حال
    }
  }
}
