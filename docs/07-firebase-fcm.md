# 07 — Firebase Cloud Messaging (FCM)

آخر مراجعة: 2026-10-05

FCM جزء من منظومة الإشعارات الحالية في Yalla. لا تتعامل مع هذا الملف كخطة “إضافة Firebase لاحقًا”؛ الخادم وتطبيقات الإصدار تستخدم إعدادات FCM حسب build والـsecrets المتوفرة.

## الفكرة

```text
حدث في Yalla backend
      ↓
notification service
      ↓
Firebase Cloud Messaging
      ↓
Android/iOS device
```

Socket.io مناسب للتحديث اللحظي أثناء الاتصال، بينما push notifications تغطي الحالات التي يكون فيها التطبيق بالخلفية/مغلقًا وفق قيود نظام التشغيل.

## Backend

خدمة الإشعارات موجودة في backend وتقرأ اعتماد Firebase من البيئة/ملف mounted خارج المستودع. أحد الإعدادات المستخدمة في التشغيل:

```text
FCM_CREDENTIALS_PATH=/app/fcm.json
```

في Oracle يجب أن يتطابق هذا المسار مع mount الفعلي الذي ينشئه سكربت النشر.

لا ترفع Service Account JSON إلى Git.

## Device tokens

الخادم يحتوي API لتسجيل/إلغاء FCM device token للمستخدم المصادق. يجب:

- تسجيل token بعد تسجيل الدخول/تهيئة push.
- تحديثه عندما يدوره Firebase.
- إزالته/تعطيله عند تسجيل الخروج حسب implementation الحالي.
- حذف tokens غير الصالحة عندما يرجع FCM خطأً دائمًا.

لا تستخدم token كهوية مستخدم أو secret للمصادقة.

## تطبيق Flutter

الإعدادات الدقيقة تعتمد على الملفات التي يولدها workflow/FlutterFire. لا تشغّل `flutterfire configure` ثم تلتزم بملفات أو أسرار عشوائيًا دون مطابقة آلية CI الحالية.

تحقق من:

```text
mobile/pubspec.yaml
mobile/lib/core/push/
mobile/lib/main.dart
.github/workflows/mobile-apk.yml
```

وأي ملفات Android يتم توليدها أثناء البناء.

## Android

لـAndroid الحديث:

- إذن notifications يجب أن يُطلب عندما يتطلب النظام ذلك.
- channel IDs يجب أن تتطابق بين backend والعميل.
- foreground notification presentation يختلف عن background delivery؛ اختبر الحالتين.

لا تعتمد على emulator فقط لاختبار push النهائي.

## Admin وPartner

Yalla يحتوي أكثر من عميل. عند تعديل notification payload أو routing، اختبر العملاء المعنيين بدل افتراض أن تطبيق Yalla وحده يستهلكه. تطبيق الإدارة Android يدعم Push Notifications أيضًا وفق إعدادات build الخاصة به.

## أسرار CI

ملفات مثل `google-services.json` أو service account قد تُحقن من GitHub Secrets حسب workflow. GitHub لا يعرض قيمة secret بعد حفظها.

قواعد:

- لا تطبع secret/base64 في logs.
- لا تحفظ JSON الحساس داخل docs أو issues.
- إذا كُشف المفتاح، دوّره في Firebase واستبدل secret المستخدم في CI/الخادم.

## اختبار تشغيل الإنتاج

بعد نشر backend:

```bash
curl -fsS https://api.yalladelivery.org/api/health
docker logs --tail 200 yalla-api
```

ثم اختبر على حساب وجهاز اختبار:

1. تسجيل الدخول.
2. التأكد من تسجيل device token بالخادم بطريقة غير مكشوفة للمستخدمين الآخرين.
3. إرسال حدث فعلي يولد إشعارًا.
4. الاختبار والتطبيق مفتوح.
5. الاختبار في الخلفية.
6. الاختبار بعد إغلاق التطبيق.
7. تسجيل الخروج ثم التأكد من عدم استمرار إشعارات حساب سابق بشكل غير صحيح.

## عند فشل الإشعارات

افحص بالترتيب:

- هل FCM credentials محملة في `yalla-api`؟
- هل token مسجل للحساب الصحيح؟
- هل package/application ID يطابق Firebase app؟
- هل المستخدم منح إذن الإشعارات؟
- هل payload/channel صالح؟
- هل Firebase أعاد token-invalid/unregistered؟
- هل build الحالي يحتوي إعدادات Google Services الصحيحة؟

## ملاحظة أمان

Push payload قد يظهر على شاشة القفل. لا ترسل OTP للدفع، كلمات مرور، مستندات هوية أو تفاصيل مالية حساسة في نص notification.
