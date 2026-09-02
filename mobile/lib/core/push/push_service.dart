// خدمة الإشعارات المنبثقة (FCM) — بطاقة 22: تصل الإشعارات حتى والتطبيق مغلق
// وشاشة الهاتف مقفلة، وتظهر على شاشة القفل بمحتواها كاملًا.
//
// تصميم آمن: إن لم يُولَّد `firebase_options.dart` بعد (لم يُشغَّل flutterfire
// configure)، تفشل التهيئة بهدوء وتبقى الإشعارات معطّلة دون أن تُعطّل بقيّة التطبيق.
//
// كيف تصل والتطبيق مغلق وشاشة الهاتف مقفلة؟ الخادم يرسل رسالة تحوي كتلة
// notification بأولويّة عالية (priority=high + visibility=public)، فيعرضها نظام
// التشغيل تلقائيًا على شريط الإشعارات وشاشة القفل دون تشغيل كود التطبيق. ولضمان
// ظهورها كإشعار منبثق (heads-up) يُوقظ الشاشة، ننشئ قناة عالية الأهمّية على الجهاز
// (channelId = yalla_orders يطابق ما يرسله الخادم). وعند فتح التطبيق (foreground)
// لا يعرض النظام الإشعار تلقائيًا، فنعرضه نحن عبر flutter_local_notifications.

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_client.dart';
import '../../firebase_options.dart';

// قناة الإشعارات عالية الأهمّية — تطابق channelId الذي يرسله الخادم و
// default_notification_channel_id في AndroidManifest. الأهمّية القصوى تجعل
// الإشعار منبثقًا (heads-up) يُوقظ الشاشة، وترى محتواه على شاشة القفل.
const AndroidNotificationChannel _ordersChannel = AndroidNotificationChannel(
  'yalla_orders',
  'طلبات يلا',
  description: 'إشعارات الطلبات والتحديثات المهمّة',
  importance: Importance.max,
  playSound: true,
  enableVibration: true,
);

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

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

  /// تهيئة Firebase + الإشعارات المحلّية + قناة عالية الأهمّية + معالج الخلفية.
  /// تُستدعى مرّة واحدة عند إقلاع التطبيق. آمنة: إن لم يُولَّد firebase_options.dart
  /// تبقى الإشعارات معطّلة.
  static Future<void> initialize() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

      // الإشعارات المحلّية (القناة + عرض في المقدّمة + معالج الخلفية) خاصّة بالجوّال
      // فقط — حزمة flutter_local_notifications لا تدعم الويب. نتخطّاها على الويب حتى
      // لا نكسر بناء/تشغيل تطبيق الويب (نفس مشروع Flutter يُبنى للويب أيضًا).
      if (!kIsWeb) {
        // تهيئة الإشعارات المحلّية (تُستخدم لعرض الإشعار والتطبيق مفتوح، وإنشاء القناة)
        await _initLocalNotifications();

        // معالج رسائل الخلفية/الإغلاق (يعرضها النظام تلقائيًا)
        FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

        // عند فتح التطبيق (foreground): النظام لا يعرض الإشعار تلقائيًا — نعرضه نحن.
        FirebaseMessaging.onMessage.listen(_showForeground);
      }

      // على iOS/الويب: اعرض الإشعار المنبثق حتى والتطبيق في المقدّمة (no-op على أندرويد)
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

      _ready = true;
    } catch (e) {
      _ready = false;
      debugPrint('FCM غير مُهيّأ (شغّل flutterfire configure لتفعيله): $e');
    }
  }

  // تهيئة إضافة الإشعارات المحلّية وإنشاء القناة عالية الأهمّية على أندرويد.
  static Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    // إنشاء القناة عالية الأهمّية (Android 8+) — تظهر منبثقة وعلى شاشة القفل
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_ordersChannel);
  }

  // عرض إشعار محلّي عند وصول رسالة والتطبيق مفتوح (foreground) — بمحتوى عامّ على
  // شاشة القفل وأولويّة قصوى ليظهر منبثقًا.
  static Future<void> _showForeground(RemoteMessage message) async {
    if (kIsWeb) return; // الإشعارات المحلّية غير مدعومة على الويب
    final n = message.notification;
    if (n == null) return; // رسالة بيانات فقط — لا نعرض شيئًا
    try {
      await _localNotifications.show(
        n.hashCode,
        n.title,
        n.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _ordersChannel.id,
            _ordersChannel.name,
            channelDescription: _ordersChannel.description,
            importance: Importance.max,
            priority: Priority.max,
            visibility: NotificationVisibility.public, // محتوى كامل على شاشة القفل
            playSound: true,
            icon: '@mipmap/ic_launcher',
          ),
          iOS: const DarwinNotificationDetails(presentAlert: true, presentSound: true),
        ),
        payload: message.data['orderId']?.toString(),
      );
    } catch (e) {
      debugPrint('تعذّر عرض الإشعار في المقدّمة: $e');
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
