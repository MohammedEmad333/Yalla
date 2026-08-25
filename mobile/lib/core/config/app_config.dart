// إعدادات التطبيق — عنوان الـ Backend قابل للضبط دون تعديل الكود.
//
// طريقتان لضبط الخادم عند التشغيل عبر --dart-define:
//
// 1) الخادم السحابي (HTTPS بلا منفذ) — الأسهل للاستخدام الحقيقي:
//      flutter run --dart-define=API_ORIGIN=https://yalla-api.duckdns.org
//
// 2) خادم محلّي على الشبكة (مضيف + منفذ):
//      flutter run --dart-define=API_HOST=192.168.1.5
//
// القيم الافتراضية تناسب محاكي أندرويد (10.0.2.2:4000). للجهاز الحقيقي استخدم
// API_ORIGIN للخادم السحابي، أو مرّر API_HOST بعنوان جهازك على نفس شبكة WiFi.
class AppConfig {
  static const String apiHost =
      String.fromEnvironment('API_HOST', defaultValue: '10.0.2.2');
  static const int apiPort =
      int.fromEnvironment('API_PORT', defaultValue: 4000);

  // تجاوز كامل لأصل الخادم (سكيمة + مضيف [+ منفذ]) — يُستخدم للنشر السحابي.
  // إن تُرك فارغًا نبني الأصل من المضيف والمنفذ أعلاه.
  static const String _apiOrigin = String.fromEnvironment('API_ORIGIN');

  // أصل الخادم (يُستخدم للسوكت): API_ORIGIN إن وُجد، وإلّا http://host:port
  static const String origin =
      _apiOrigin == '' ? 'http://$apiHost:$apiPort' : _apiOrigin;
  // جذر الـ REST API
  static const String apiBaseUrl = '$origin/api';
}
