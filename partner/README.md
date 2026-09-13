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
