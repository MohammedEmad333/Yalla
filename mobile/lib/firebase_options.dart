// ⚠️ ملفّ مؤقّت — يجب توليده بقيم مشروعك الحقيقية قبل تفعيل الإشعارات.
//
// شغّل من مجلّد mobile/ :
//     flutterfire configure --project=yalla-c751d
//
// سيستبدل flutterfire هذا الملفّ تلقائيًا بقيم مشروع Firebase (apiKey/appId/
// messagingSenderId/projectId لكلّ منصّة). حتى ذلك الحين تبقى الإشعارات معطّلة
// بأمان: تُلقي currentPlatform استثناءً يلتقطه PushService فيتابع التطبيق دونها.
//
// هذا الملفّ ليس سرًّا (إعدادات عميل عامّة) — يُلتزم في git ليُبنى APK بإشعارات مفعّلة.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    throw UnsupportedError(
      'firebase_options.dart لم يُولَّد بعد. شغّل: '
      'flutterfire configure --project=yalla-c751d',
    );
  }
}
