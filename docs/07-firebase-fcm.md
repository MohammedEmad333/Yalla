# إضافة Firebase Cloud Messaging (FCM) — الإشعارات المنبثقة والتطبيق مغلق (بطاقة 22)

هذا الدليل يشرح كيفية تفعيل الإشعارات المنبثقة التي تصل **حتى عندما يكون التطبيق مغلقًا**.

## كيف يعمل الأمر؟

```
حدث في الخادم (إسناد طلب، تغيّر حالة، رمز تسليم…)
        │
        ▼
firebase-admin يرسل رسالة إلى FCM  ──►  خوادم Google (FCM)
                                              │
                                              ▼
                              نظام تشغيل الهاتف (Android/iOS)
                              يعرض الإشعار في شريط النظام
                              ولو كان التطبيق مغلقًا تمامًا
```

النقطة الجوهرية: عندما يكون التطبيق مغلقًا لا يعمل الـSocket، فالوسيلة الوحيدة لإيقاظ
الهاتف هي **FCM**. الخادم عندنا **جاهز بالكامل**؛ الناقص هو ربط تطبيق Flutter بـFirebase.

---

## الجزء 1: إنشاء مشروع Firebase (مرّة واحدة)

1. افتح <https://console.firebase.google.com> ← **Add project** ← اختر اسمًا (مثل `yalla`).
2. داخل المشروع ← ⚙️ **Project settings** ← تبويب **Cloud Messaging**: تأكّد أن
   *Firebase Cloud Messaging API (V1)* مُفعّل.
3. **مفتاح الخادم (Service Account):** Project settings ← تبويب **Service accounts** ←
   **Generate new private key** ← ينزّل ملف JSON. **احفظه بأمان ولا ترفعه إلى git.**

---

## الجزء 2: الخادم (Backend) — شبه جاهز ✅

الكود موجود مسبقًا في `backend/src/services/notification.service.js` (يستخدم `firebase-admin`
ويعمل كـ no-op بلا مفاتيح). كل المطلوب:

1. تأكّد أن الحزمة مثبّتة:
   ```bash
   cd backend && npm install firebase-admin
   ```
2. ضع ملف الـService Account JSON على الخادم (مثلًا `backend/secrets/fcm.json`) وأضِفه إلى
   `.gitignore`.
3. اضبط متغيّر البيئة قبل التشغيل:
   ```bash
   # .env أو docker-compose environment
   FCM_CREDENTIALS_PATH=/app/secrets/fcm.json
   ```
   (في Docker: mount الملف داخل الحاوية ووجّه المسار إليه.)
4. عند الإقلاع سترى في السجلّ: `✅ FCM مُهيّأ — الإشعارات مفعّلة`.

نقاط استقبال رموز الأجهزة جاهزة أيضًا:
- `POST /api/notifications/device-token`  ← الجسم `{ "token": "<fcm-token>" }`
- `DELETE /api/notifications/device-token` ← لإلغاء التسجيل عند تسجيل الخروج

والخادم يرسل تلقائيًا عند: إسناد طلب، تغيّر حالة، رمز تسليم، إلغاء، ورسائل الدردشة.

---

## الجزء 3: تطبيق الجوال (Flutter) — الخطوات الأساسية

### 3.1 ربط المشروع بـFirebase

ثبّت الأدوات (مرّة واحدة على جهازك):
```bash
dart pub global activate flutterfire_cli
npm install -g firebase-tools && firebase login
```
ثم من داخل مجلّد `mobile/`:
```bash
flutterfire configure --project=<firebase-project-id>
```
هذا الأمر:
- ينشئ `mobile/lib/firebase_options.dart`.
- يضيف `android/app/google-services.json` (وملف iOS إن لزم).

### 3.2 الحِزم

في `mobile/pubspec.yaml` تحت `dependencies:`
```yaml
  firebase_core: ^3.6.0
  firebase_messaging: ^15.1.3
  flutter_local_notifications: ^17.2.3   # لعرض الإشعار والتطبيق مفتوح (foreground)
```
ثم:
```bash
cd mobile && flutter pub get
```

### 3.3 إعداد Android

في `mobile/android/app/build.gradle` (مستوى app) — يضيفه flutterfire غالبًا تلقائيًا:
```gradle
// أعلى الملف
plugins { id 'com.google.gms.google-services' }
```
وفي `android/build.gradle` (المشروع):
```gradle
buildscript { dependencies { classpath 'com.google.gms:google-services:4.4.2' } }
```
أذونات Android 13+ في `AndroidManifest.xml` داخل `<manifest>`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

### 3.4 معالج الخلفية + التهيئة (مفتاح "التطبيق مغلق")

**يجب** أن يكون معالج الخلفية دالّة **علوية** (top-level) خارج أي Class، وإلا لن يعمل
عندما يكون التطبيق مغلقًا. عدّل `mobile/lib/main.dart`:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';

// دالّة علوية: تُستدعى في عزلة منفصلة عندما يصل إشعار والتطبيق مغلق/في الخلفية
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // النظام يعرض الإشعار تلقائيًا ما دام يحمل كتلة notification (وهي كذلك من خادمنا).
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  runApp(const YallaApp());
}
```

### 3.5 خدمة الدفع (أنشئ `mobile/lib/core/push/push_service.dart`)

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import '../network/api_client.dart';

class PushService {
  final ApiClient api;
  PushService(this.api);

  // يُستدعى بعد نجاح تسجيل الدخول: يطلب الإذن، يجلب الرمز، ويسجّله بالخادم.
  Future<void> registerAfterLogin() async {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(); // iOS + Android 13+
    final token = await messaging.getToken();
    if (token != null) await _send(token);
    // تحديث الرمز عند تدويره
    messaging.onTokenRefresh.listen(_send);
  }

  Future<void> _send(String token) async {
    try {
      await api.post('/notifications/device-token', {'token': token});
    } catch (_) {/* لا نُعطّل تسجيل الدخول إن فشل */}
  }

  // عند تسجيل الخروج: ألغِ تسجيل الرمز لهذا الجهاز
  Future<void> unregister() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      try { await api.delete('/notifications/device-token', body: {'token': token}); } catch (_) {}
    }
  }
}
```

### 3.6 ربطها بدورة الجلسة

في `main.dart` داخل `AuthGate` عند توفّر `session != null` (المستخدم/الكابتن)، نادِ
`PushService(apiClient).registerAfterLogin()` مرّة واحدة. وفي `authRepository.logout`
نادِ `unregister()` قبل مسح الجلسة.

### 3.7 قناة إشعارات Android (اختياري لكن مُستحسَن)

الخادم يرسل `channelId: 'yalla_orders'`. أنشئ القناة مرّة عند الإقلاع عبر
`flutter_local_notifications` لضمان الصوت والأولوية العالية، واعرض إشعارات
**foreground** (عندما يكون التطبيق مفتوحًا) عبر `FirebaseMessaging.onMessage`.

---

## الجزء 4: الاختبار

1. شغّل الخادم بمفتاح FCM، وشغّل التطبيق على هاتف حقيقي وسجّل الدخول.
2. تحقّق أن الرمز وصل: يُخزَّن في `deviceTokens` على مستند المستخدم/الكابتن.
3. **أغلق التطبيق تمامًا** ثم أنشئ طلبًا/أسنِده — يجب أن يصل إشعار في شريط النظام.
4. تشخيص: من Firebase Console ← Cloud Messaging ← *Send test message* بإدخال الرمز.

---

## ملاحظات مهمّة

- **الأولوية:** خادمنا يرسل `priority: high` + كتلة `notification`، وهذا ما يضمن ظهور
  الإشعار والتطبيق مغلق. لا تُرسل رسائل `data-only` إن أردت ظهورًا تلقائيًا بلا كود عرض.
- **iOS:** يحتاج شهادة/مفتاح APNs في Firebase وحساب مطوّر Apple — أكثر تعقيدًا من Android.
- **الأمان:** لا ترفع ملف الـService Account ولا `google-services.json` الحسّاس إلى مستودع عام.
- **بيئة ARM64/Windows:** لا تأثير خاص؛ فقط تأكّد أن `flutter pub get` و`google-services`
  يكملان دون أخطاء الشبكة/الكاش (راجع `HANDOFF.md`).
