# نسخة أندرويد من لوحة الأدمن (استقبال الإشعارات) — Card 103

هذه النسخة تُغلّف لوحة الأدمن (React/Vite) داخل تطبيق أندرويد باستخدام
**Capacitor**، وتستقبل **إشعارات Push** عبر Firebase Cloud Messaging (FCM)
حتى عندما يكون التطبيق مغلقًا — ليصل الأدمن تنبيه فور وصول طلب جديد أو طلب
سحب رصيد.

> الكود جاهز: صفحة الأدمن تسجّل جهازها تلقائيًا بعد تسجيل الدخول
> (`src/push.js` + `src/auth/AuthContext.jsx`)، والخادم يرسل Push لكل المشرفين
> عند الأحداث المهمّة (`notifyAdmins` في `backend/src/services/notification.service.js`).
> يبقى فقط توليد مشروع أندرويد مرّة واحدة وربطه بمشروع Firebase.

## المتطلّبات

- Node.js 20+
- Android Studio (SDK + JDK 17)
- مشروع Firebase (مجّاني) مع تطبيق أندرويد باسم الحزمة `com.yalla.admin`

## 1) تثبيت أدوات Capacitor (مرّة واحدة)

من داخل مجلّد `admin/`:

```bash
npm install @capacitor/core @capacitor/android @capacitor/push-notifications
npm install -D @capacitor/cli
```

> ملاحظة: بناء الويب (`npm run build`) لا يعتمد على هذه الحزم — الكود يستخدم
> واجهة Capacitor العامّة (`window.Capacitor`) التي تُحقَن داخل تطبيق
> أندرويد فقط، فيبقى نشر الويب سليمًا دونها.

## 2) بناء الويب ثم توليد مشروع أندرويد

اضبط عنوان الـ API للخادم المنشور (وليس localhost، فالهاتف لن يصله):

```bash
# مثال Render:
VITE_API_URL=https://yalla-api.onrender.com npm run build

npx cap add android      # يولّد مجلّد android/ (مرّة واحدة)
npx cap sync             # ينسخ dist/ ويثبّت المكوّنات الإضافية
```

## 3) ربط Firebase (FCM)

1. في Firebase Console: أنشئ/افتح مشروعًا → أضف تطبيق **Android** باسم الحزمة
   `com.yalla.admin`.
2. نزّل `google-services.json` وضعه في `admin/android/app/google-services.json`.
3. من إعدادات المشروع → Service accounts → ولّد مفتاح خدمة (JSON)، وألصق
   محتواه في متغيّر البيئة `FCM_CREDENTIALS_JSON` على الخادم (Render) — هذا
   ما يستخدمه الخادم لإرسال الإشعارات (راجع `render.yaml`).

Capacitor يضيف إعداد `google-services` تلقائيًا لمشروع Gradle عند `cap sync`.
إن لزم، تأكّد أنّ `android/build.gradle` و`android/app/build.gradle` يحويان
إضافة `com.google.gms.google-services` (موثّق في مستندات Capacitor Push).

## 4) السماح بالوصول للخادم (CORS)

يعمل تطبيق Capacitor على الأصل `https://localhost`. أضِف هذا الأصل إلى
متغيّر `CORS_ORIGIN` على الخادم (يقبل عدّة روابط مفصولة بفواصل):

```
CORS_ORIGIN=https://<نطاق-اللوحة-على-الويب>,https://localhost
```

## 5) التشغيل والبناء

```bash
npx cap open android     # يفتح Android Studio
# شغّل على جهاز/محاكي، أو Build > Generate Signed Bundle/APK للإصدار
```

عند كلّ تعديل لاحق للوحة:

```bash
VITE_API_URL=https://yalla-api.onrender.com npm run build && npx cap sync
```

## كيف تعمل الإشعارات (نظرة عامّة)

1. الأدمن يسجّل الدخول داخل التطبيق → `enablePush()` يطلب الإذن ويسجّل الجهاز
   في FCM ويرسل الرمز إلى `POST /notifications/device-token` (يُخزَّن في
   `deviceTokens` لحساب الأدمن).
2. عند طلب جديد / طلب سحب رصيد، يستدعي الخادم `notifyAdmins(...)` فيرسل Push
   إلى كل أجهزة المشرفين + يحفظ إشعارًا داخليًا يظهر في اللوحة لحظيًا.
3. عند تسجيل الخروج → `disablePush()` يزيل رمز الجهاز.

## أيقونة التطبيق

استخدم لوجو Yalla من مجلّد `store/` أو `design/` وولّد أيقونات أندرويد
عبر Android Studio (Image Asset) أو حزمة `@capacitor/assets`.
