// خدمة الإشعارات (FCM) للموبايل — تطلب الإذن، تجلب رمز الجهاز، وتسجّله
// في الخادم ليتلقّى الحساب إشعارات Push (طلب جديد للكابتن، تحديث حالة للمستخدم).
// (تعتمد حزمتَي firebase_messaging و firebase_core)

import 'package:firebase_messaging/firebase_messaging.dart';

import '../network/api_client.dart';

class PushService {
  final ApiClient api;
  final _fcm = FirebaseMessaging.instance;

  PushService(this.api);

  /// التهيئة بعد تسجيل الدخول: إذن + تسجيل الرمز + متابعة تجديده.
  Future<void> init() async {
    // طلب إذن الإشعارات (iOS يتطلّبه صراحةً)
    await _fcm.requestPermission();

    // جلب رمز الجهاز وتسجيله في الخادم
    final token = await _fcm.getToken();
    if (token != null) await _register(token);

    // تحديث الرمز عند تدويره تلقائيًا من FCM
    _fcm.onTokenRefresh.listen(_register);

    // استقبال الإشعارات والتطبيق مفتوح (foreground) — اربطها بالـ UI لاحقًا
    FirebaseMessaging.onMessage.listen((msg) {
      // مثال: عرض Banner داخلي أو تحديث قائمة الطلبات
      // final data = msg.data; // {type, orderId, ...}
    });
  }

  // تسجيل الرمز في الخادم (POST /notifications/device-token)
  Future<void> _register(String token) async {
    try {
      await api.post('/notifications/device-token', {'token': token});
    } on ApiException {
      // نتجاهل الفشل بهدوء — سيُعاد المحاولة عند التجديد التالي
    }
  }

  /// عند تسجيل الخروج: إزالة الرمز من الخادم ثم حذفه محليًا.
  Future<void> unregister() async {
    final token = await _fcm.getToken();
    if (token != null) {
      try {
        await api.delete('/notifications/device-token', {'token': token});
      } on ApiException {
        // تجاهل
      }
    }
    await _fcm.deleteToken();
  }
}
