# نسخة أندرويد من لوحة الأدمن (استقبال الإشعارات) — Card 103

هذه النسخة تُغلّف لوحة الأدمن (React/Vite) داخل تطبيق أندرويد باستخدام
**Capacitor**، وتستقبل **إشعارات Push** عبر Firebase Cloud Messaging (FCM)
حتى عندما يكون التطبيق مغلقًا — ليصل الأدمن تنبيه فور وصول طلب جديد أو طلب
سحب رصيد.

> الكود جاهز: صفحة الأدمن تسجّل جهازها تلقائيًا بعد تسجيل الدخول
> (`src/push.js` + `src/auth/AuthContext.jsx`)، والخادم يرسل Push لكل المشرفين
> عند الأحداث المهمّة (`notifyAdmins` في `backend/src/services/notification.service.js`).
> ومشروع أندرويد (Capacitor) **مُولَّد ومحفوظ في `admin/android/`**.

---

## الطريقة الأسهل: بناء APK تلقائيًا عبر GitHub Actions (موصى بها)

لا حاجة لتثبيت أي أدوات على جهازك — GitHub يبني الـ APK نيابةً عنك:

1. اضبط الأسرار في: **Settings → Secrets and variables → Actions**
   - `ADMIN_API_URL` (مطلوب): رابط الخادم المنشور، مثل `https://<عنوان-خادمك-على-Oracle>`
   - `GOOGLE_SERVICES_JSON_BASE64` (اختياري، لتفعيل الإشعارات): نفّذ محليًا
     `base64 -w0 google-services.json` وألصق الناتج.
2. من تبويب **Actions** → اختر **Build Admin APK** → **Run workflow**.
3. بعد انتهاء البناء، نزّل الـ APK من قسم **Artifacts** (`yalla-admin-apk`) وثبّته على الهاتف.

> بلا `GOOGLE_SERVICES_JSON_BASE64` يُبنى التطبيق ويعمل بالكامل لكن **بلا إشعارات
> Push** (تُفعَّل لاحقًا بمجرّد إضافة السرّ وإعادة التشغيل). ولا تنسَ إضافة
> `https://localhost` إلى `CORS_ORIGIN` على الخادم (انظر القسم 4 أدناه).

---

## الطريقة اليدوية (Android Studio)

المشروع مولَّد مسبقًا في `admin/android/`، لذا تخطّى `npx cap add android`.

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
# مثال (خادمك على Oracle):
VITE_API_URL=https://<عنوان-خادمك-على-Oracle> npm run build

npx cap sync android     # ينسخ dist/ ويحدّث المكوّنات الإضافية (المشروع مولَّد مسبقًا)
```

## 3) ربط Firebase (FCM)

1. في Firebase Console: أنشئ/افتح مشروعًا → أضف تطبيق **Android** باسم الحزمة
   `com.yalla.admin`.
2. نزّل `google-services.json` وضعه في `admin/android/app/google-services.json`.
3. من إعدادات المشروع → Service accounts → ولّد مفتاح خدمة (JSON)، وألصق
   محتواه في متغيّر البيئة `FCM_CREDENTIALS_JSON` على الخادم (Oracle) — هذا
   ما يستخدمه الخادم لإرسال الإشعارات.

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
VITE_API_URL=https://<عنوان-خادمك-على-Oracle> npm run build && npx cap sync
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
