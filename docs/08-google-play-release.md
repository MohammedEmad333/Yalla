# إصدار Yalla على Google Play (التوقيع + AAB)

هذا الدليل يشرح كيفية إنتاج **حزمة موقّعة قابلة للنشر** على Google Play، وما تبقّى
من متطلبات المتجر.

## نظرة عامّة على آلية التوقيع

- مجلّد `mobile/android/` **يُولَّد** في CI عبر `flutter create` (لضمان توافق إصدارات
  Gradle/AGP)، ثم نُعيد فوقه ملفّاتنا المتتبَّعة:
  - `android/app/src/main/AndroidManifest.xml` (الاسم + الصلاحيات + أمان الشبكة).
  - `android/app/src/main/res/xml/network_security_config.xml` (HTTPS فقط للإنتاج).
- سكربت `mobile/tool/inject_signing.py` يحقن **إعداد توقيع الإصدار** في
  `app/build.gradle` المولَّد، فيقرأ المفتاح من `android/key.properties`.
- الـ workflow **Build Mobile Release** يبني `app-release.aab` (لـ Google Play)
  و`app-release.apk` (للاختبار المباشر).

> مفتاح التوقيع **لا يُحفظ في المستودع إطلاقًا**. يُخزَّن مُرمَّزًا في أسرار GitHub
> ويُحقَن أثناء البناء فقط.

## 1) توليد مفتاح التوقيع (Keystore) — مرّة واحدة

على جهازك (يتطلّب JDK):

```bash
keytool -genkey -v -keystore yalla-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

احتفظ بالملفّ `yalla-upload.jks` وكلمات المرور في مكان آمن.
⚠️ **فقدان هذا المفتاح يعني عدم القدرة على تحديث التطبيق لاحقًا** (ما لم تُفعّل
Play App Signing، وهو مُوصى به — انظر القسم 4).

## 2) إضافة الأسرار إلى GitHub

رمّز الـ keystore إلى base64:

```bash
base64 -w0 yalla-upload.jks > yalla-upload.b64   # على macOS: base64 -i yalla-upload.jks -o yalla-upload.b64
```

ثم من **GitHub → Settings → Secrets and variables → Actions → New repository secret**
أضِف:

| السرّ | القيمة |
|------|--------|
| `ANDROID_KEYSTORE_BASE64` | محتوى ملفّ `yalla-upload.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المخزن (storePassword) |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح (keyPassword) |

## 3) بناء الحزمة

- من تبويب **Actions → Build Mobile Release → Run workflow** (أو تلقائيًا عند تعديل
  `mobile/`).
- عند اكتمال التشغيل حمّل الأثر **`yalla-aab`** (`app-release.aab`) وارفعه على
  Google Play Console.
- الأثر **`yalla-apk`** للتثبيت المباشر على الأجهزة للاختبار.

> بلا أسرار keystore: يُبنى APK موقّع بمفتاح debug **للاختبار فقط**، ولا يُبنى AAB.

## 4) رفعه على Google Play — قائمة تحقّق

- [ ] حساب مطوّر Google Play (رسم 25$ لمرة واحدة).
- [ ] تفعيل **Play App Signing** (مُوصى به — يحمي من فقدان مفتاح الرفع).
- [ ] **applicationId** ثابت: `com.yalla.yalla` (لا يمكن تغييره بعد النشر).
- [ ] **رابط سياسة الخصوصية** — منشورة تلقائيًا على GitHub Pages عبر workflow
      «Deploy Privacy Policy (Pages)»: <https://mohammedemad333.github.io/Yalla/>
      (المصدر: [`privacy-policy.md`](privacy-policy.md) و`site/index.html`). ضع
      الرابط في App content. يُفعَّل النشر عند دمج التغييرات في `main`.
- [ ] **نموذج Data Safety** — أفصِح عن: الموقع، رقم الهاتف، الصور، مُعرّف الجهاز.
- [ ] **تبرير صلاحية الموقع** (`ACCESS_FINE_LOCATION`) — أساسي لخدمة التوصيل، وبلا
      موقع في الخلفية.
- [ ] **أصول المتجر:** أيقونة 512×512، رسم مميز 1024×500، ولقطات شاشة.
- [ ] وصف قصير وطويل بالعربية.
- [ ] تدرّج المحتوى (Content rating) عبر الاستبيان.
- [ ] استهداف `targetSdk` حديث (≥ 35) — يوفّره Flutter stable تلقائيًا في CI.

## 5) رفع الإصدارات التالية

زِد رقم الإصدار في `mobile/pubspec.yaml` قبل كل رفعة:

```yaml
version: 1.0.1+2   # versionName+versionCode — يجب أن يزيد versionCode في كل رفعة
```
