# تطبيق يلا (Flutter) — المستخدم والكابتن

شاشات نظيفة + هيكل تشغيل كامل (`main.dart`، تنقّل، ربط الخدمات).

## التشغيل خطوة بخطوة

### 1) المتطلّبات
- Flutter SDK 3.19+ (`flutter doctor` يجب أن يكون سليمًا).
- الـ Backend شغّال (راجع `../backend` أو `docker compose up` من الجذر).

### 2) توليد مجلّدات المنصّات (مرّة واحدة)
المستودع يحوي `lib/` و`pubspec.yaml` و**ملفّ `android/app/src/main/AndroidManifest.xml`**
(يحمل اسم التطبيق «Yalla» + صلاحيات الموقع/الإنترنت + وسم `<queries>`). ولّد بقيّة
مجلّدات المنصّات دون المساس بالمانيفست:

```bash
cd mobile
# نحفظ المانيفست ثم نُعيد توليد السقالة ثم نُعيده (لأن flutter create يُعيد كتابته)
cp android/app/src/main/AndroidManifest.xml /tmp/AndroidManifest.xml
flutter create --platforms=android,ios,web .
cp /tmp/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
```
> لو عدّل `pubspec.yaml` استعده من git: `git checkout pubspec.yaml`.
>
> **بناء APK جاهز عبر GitHub:** لا حاجة لتوليد المنصّات يدويًا — شغّل
> workflow **«Build Mobile APK»** من تبويب Actions (أو يُبنى تلقائيًا عند تعديل
> `mobile/`)، وحمّل ملفّ `yalla-apk` من مخرجات التشغيل. يمرّر عنوان الخادم عبر
> مُدخَل `API_ORIGIN` (افتراضيًا الخادم السحابي).

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

**الاسم → "Yalla"** — مضبوط مسبقًا لـ **Android** في المانيفست المتتبَّع
(`android/app/src/main/AndroidManifest.xml` → `android:label="Yalla"`)، فلا حاجة
لأي تعديل يدوي. للـ **iOS** (اختياري) اضبط `CFBundleDisplayName` و`CFBundleName`
إلى `Yalla` في `ios/Runner/Info.plist`.

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

## الإشعارات المنبثقة (FCM) — مُدمجة (Card 22)
كود الإشعارات مُدمج بالفعل (`core/push/push_service.dart` + التهيئة في `main.dart`).
الخطوة الوحيدة المتبقّية لتفعيلها: توليد إعدادات مشروعك بتشغيل — من مجلّد `mobile/`:

```bash
dart pub global activate flutterfire_cli
flutterfire configure --project=yalla-c751d
```

هذا يستبدل `lib/firebase_options.dart` المؤقّت بقيم مشروعك الحقيقية. قبل تشغيله يبقى
التطبيق يعمل بأمان مع تعطيل الإشعارات فقط. تفاصيل كاملة في `docs/07-firebase-fcm.md`.
الإشعارات الداخلية (in-app) تعمل عبر السوكت بلا Firebase.

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
