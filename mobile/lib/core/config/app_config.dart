// إعدادات التطبيق — عنوان الـ Backend قابل للضبط دون تعديل الكود.
//
// يُمرَّر مضيف الـ Backend عند التشغيل عبر --dart-define، مثال:
//   flutter run --dart-define=API_HOST=192.168.1.5
//
// القيم الافتراضية تناسب محاكي أندرويد (10.0.2.2). للجهاز الحقيقي مرّر IP
// جهازك على الشبكة (من ipconfig)، مع التأكّد أن الهاتف والكمبيوتر على نفس WiFi.
class AppConfig {
  static const String apiHost =
      String.fromEnvironment('API_HOST', defaultValue: '10.0.2.2');
  static const int apiPort =
      int.fromEnvironment('API_PORT', defaultValue: 4000);

  // أصل الخادم (يُستخدم للسوكت)
  static const String origin = 'http://$apiHost:$apiPort';
  // جذر الـ REST API
  static const String apiBaseUrl = '$origin/api';
}
