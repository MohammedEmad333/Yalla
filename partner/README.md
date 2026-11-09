# Yalla Partner

تطبيق Flutter مستقل لأصحاب المطاعم والمحلات، ويستخدم نفس Backend وقاعدة بيانات Yalla.

## إنشاء حساب متجر

1. افتح لوحة الأدمن ثم صفحة **المطاعم**.
2. أنشئ المطعم أو افتح مطعمًا موجودًا.
3. من بطاقة **حساب صاحب المتجر** أدخل الاسم ورقم الجوال وكلمة السر.
4. يستطيع صاحب المتجر تسجيل الدخول بهذه البيانات في Yalla Partner.

كل حساب مرتبط بمطعم واحد، والـ API يتحقق من الملكية في كل عملية على المنتجات والطلبات.

## التشغيل محليًا

```bash
flutter pub get
flutter run --dart-define=API_ORIGIN=http://10.0.2.2:4000
```

## APK وAAB

يشغّل GitHub Actions ملف `partner-apk.yml` تلقائيًا عند تعديل `partner/` على `main`.
ينتج `yalla-partner-apk`، وينتج `yalla-partner-aab` أيضًا عند وجود أسرار توقيع Android الحالية في المستودع.

معرّف تطبيق Android هو `com.mohammedemad333.yallapartner`.


## Web / PWA للتجار

يمكن تشغيل Yalla Partner كتطبيق ويب قابل للتثبيت، بحيث يصل التاجر إليه مباشرة من المتصفح بدون انتظار Google Play.

### بناء محلي

```bash
cd partner
flutter create --platforms=web --project-name yalla_partner .
flutter pub get
flutter build web --release \
  --pwa-strategy=offline-first \
  --dart-define=API_ORIGIN=https://api.yalladelivery.org
```

### النشر التلقائي

Workflow: `.github/workflows/partner-web.yml`

- يبني Flutter Web.
- يجهز Manifest كتطبيق PWA باسم **Yalla Partner**.
- يرفع `yalla-partner-web` كـ GitHub Actions artifact.
- إذا كانت أسرار Cloudflare موجودة، ينشر Worker باسم `yalla-partner`.

الأسرار المطلوبة للنشر التلقائي:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

بعد أول نشر، اربط Custom Domain التالي بالـ Worker من Cloudflare:

```text
partner.yalladelivery.org
```

إذا كان `CORS_ORIGIN` في الـ Backend ليس `*`، أضف:

```text
https://partner.yalladelivery.org
```

إلى قائمة الأصول المسموحة، مع الإبقاء على الأصول الحالية.

## Google Play Partner readiness

- Partner applicationId: `com.mohammedemad333.yallapartner`.
- Android compileSdk and targetSdk are pinned to API 36.
- Production API defaults to `https://api.yalladelivery.org`.
- Account creation is supported. The approved store screen and pending/rejected application screen now link to the official account-deletion request instructions: `https://yalladelivery.org/delete-account.html#section-2`. This is a request process, not automatic deletion.
- Android PR workflow builds a test APK and runs Flutter analysis/tests. Signed APK/AAB builds are reserved for main/manual releases when all release signing secrets are present.
- Before uploading an AAB, verify its versionCode is higher than all builds uploaded in Play Console, and confirm the upload-signing certificate matches the existing app. The repository currently declares `1.0.0+1`; do not increase it blindly before checking Play Console.
- Google Play production access application answers must reflect real closed-test participants and observed feedback, not the source code alone.
