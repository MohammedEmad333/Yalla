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
