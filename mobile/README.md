# تطبيق يلا (Flutter) — المستخدم والكابتن

شاشات نظيفة + هيكل تشغيل كامل (`main.dart`، تنقّل، ربط الخدمات).

## التشغيل خطوة بخطوة

### 1) المتطلّبات
- Flutter SDK 3.19+ (`flutter doctor` يجب أن يكون سليمًا).
- الـ Backend شغّال (راجع `../backend` أو `docker compose up` من الجذر).

### 2) توليد مجلّدات المنصّات (مرّة واحدة)
هذا المستودع يحوي `lib/` و`pubspec.yaml` فقط؛ ولّد مجلّدات android/ios/web:

```bash
cd mobile
flutter create --platforms=android,ios,web .
```
> لا يحذف هذا الأمر ملفّاتنا؛ يُنشئ المفقود فقط. لو عدّل `pubspec.yaml`
> استعده من git: `git checkout pubspec.yaml`.

### 3) ضبط عنوان الـ Backend (بلا تعديل كود)
العنوان يُمرَّر عبر `--dart-define=API_HOST=...` (انظر `lib/core/config/app_config.dart`):
- **محاكي أندرويد**: الافتراضي `10.0.2.2` — لا تحتاج شيئًا.
- **محاكي iOS**: `flutter run --dart-define=API_HOST=127.0.0.1`
- **جهاز حقيقي**: `flutter run --dart-define=API_HOST=<IP-جهازك>` (من `ipconfig`، ونفس WiFi).

### 4) التشغيل
```bash
flutter pub get
flutter run
```

## الخرائط والإشعارات (مُزالة افتراضيًا لتسهيل التشغيل)
لتفادي متطلّبات المفاتيح الخارجية، أُزيلت المكتبتان الأصليّتان من الإعداد الافتراضي:
- **Google Maps**: شاشتا «إنشاء طلب» و«التتبّع» تعملان **بلا خريطة** (اختيار مواقع
  جاهزة + عرض إحداثيات الكابتن). لإضافة خريطة تفاعلية: أعِد `google_maps_flutter`
  إلى `pubspec.yaml`، واستبدل الشاشتين بنسخ الخريطة، وأضف مفتاح Google Maps في
  `android/app/src/main/AndroidManifest.xml`.
- **إشعارات FCM**: تتطلّب إعداد Firebase (`flutterfire configure`). لإعادتها أضِف
  `firebase_core`/`firebase_messaging` وأعِد `push_service.dart`.

> السماح بـ HTTP: للاتصال بالـ Backend عبر `http` من جهاز حقيقي، أضِف
> `android:usesCleartextTraffic="true"` إلى وسم `<application>` في AndroidManifest.

## البنية
```
lib/
├── main.dart              # الإقلاع + بوابة المصادقة + اختيار الدور
├── app/                   # الأصداف الرئيسية (user/captain home + profile)
├── core/                  # network / realtime / storage / notifications
└── features/              # auth / user / captain / notifications
```
