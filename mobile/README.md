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

### 5) اسم التطبيق وأيقونته على الجهاز (مرّة واحدة بعد توليد المنصّات)
الاسم الافتراضي الذي يظهر تحت الأيقونة هو «mobile» وأيقونة Flutter الافتراضية.

**الأيقونة** — أيقونة الدرّاجة الكهربائية البرتقالية مضبوطة مسبقًا في `pubspec.yaml`
(قسم `flutter_launcher_icons`). ولّدها بأمر واحد:
```bash
cd mobile
flutter pub get
dart run flutter_launcher_icons    # يستبدل الأيقونة الافتراضية بأيقونة Yalla
```
> لاستبدال التصميم لاحقًا، ضع صورة مربّعة 1024×1024 مكان
> `assets/icon/yalla_icon.png` وأعِد تشغيل الأمر.

**الاسم → "Yalla"** — عدّل سطرًا واحدًا في المنصّتين (لا نستخدم حزمة
`flutter_launcher_name` لأنها قديمة ولا تدعم null-safety فتكسر `pub get`):

- **Android** — في `android/app/src/main/AndroidManifest.xml` داخل وسم
  `<application>` غيّر:
  ```xml
  android:label="mobile"   <!-- إلى: -->
  android:label="Yalla"
  ```
- **iOS** (اختياري) — في `ios/Runner/Info.plist` اضبط
  `CFBundleDisplayName` و`CFBundleName` إلى `Yalla`.

ثم أعِد التثبيت لرؤية الاسم والأيقونة الجديدَين:
```bash
flutter run
```

## خدمة خرائط جوجل (Card 10)
التطبيق يفتح **خرائط جوجل** عبر روابط عميقة (بلا مفتاح API ولا خريطة مضمّنة):
- **الكابتن** — زرّ «الملاحة إلى الاستلام/التسليم» في شاشة الطلب النشط يفتح خرائط
  جوجل للملاحة نحو النقطة الصحيحة حسب مرحلة الطلب (`core/maps/maps_service.dart`).
- **المستخدم** — في شاشة التتبّع زرّ الخريطة بجانب موقع الكابتن يفتح موقعه على خرائط جوجل.
- كما يمكن للكابتن الاتصال بصاحب الطلب مباشرةً عبر زرّ الاتصال (`tel:`).

> **مطلوب على Android 11+ (API 30+):** حتى تعمل روابط `url_launcher` يجب إضافة وسم
> `<queries>` داخل `android/app/src/main/AndroidManifest.xml` (بجانب `<application>`):
> ```xml
> <queries>
>   <intent><action android:name="android.intent.action.VIEW" />
>     <data android:scheme="https" /></intent>
>   <intent><action android:name="android.intent.action.DIAL" />
>     <data android:scheme="tel" /></intent>
> </queries>
> ```
> لإضافة خريطة **مضمّنة** داخل التطبيق لاحقًا: أعِد `google_maps_flutter` مع مفتاح
> Google Maps في نفس الملفّ.

## الإشعارات (مُزالة افتراضيًا لتسهيل التشغيل)
**إشعارات FCM**: تتطلّب إعداد Firebase (`flutterfire configure`). لإعادتها أضِف
`firebase_core`/`firebase_messaging` وأعِد `push_service.dart`. الإشعارات الداخلية
(in-app) تعمل حاليًا وتصل **لحظيًا** عبر السوكت دون Firebase.

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
