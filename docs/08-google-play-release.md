# 08 — إصدار Yalla على Google Play

آخر مراجعة: 2026-10-05

هذا الدليل يوضح بناء APK/AAB الموقّع ومتطلبات الإصدار. الحالة الحالية في `mobile/pubspec.yaml` وقت المراجعة:

```text
version: 1.0.11+12
```

قبل أي إصدار جديد يجب زيادة `versionCode`، وتحديث `versionName` عندما يلزم.

## التوقيع

مفتاح التوقيع **لا يُحفظ في المستودع**. Workflow البناء يقرأ بياناته من GitHub Actions Secrets ويحقنها أثناء البناء.

الأسرار المستخدمة يجب مطابقتها مع workflow الحالي قبل التغيير؛ الأسماء المتوقعة تاريخيًا تشمل:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

GitHub لا يعرض قيمة secret بعد حفظها؛ تعديل secret يستبدل القيمة السابقة.

## إنشاء keystore — مرة واحدة فقط

```bash
keytool -genkey -v -keystore yalla-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

احتفظ بنسخة آمنة خارج المستودع. Play App Signing موصى به لتقليل مخاطر فقد مفتاح الرفع.

## البناء

استخدم workflow الإصدار الموجود في `.github/workflows/` لتطبيق Yalla. الناتج المتوقع للإصدار الموقّع:

- `.aab` للرفع إلى Google Play.
- `.apk` للاختبار المباشر عندما ينتجه workflow.

لا تعتبر APK debug إصدارًا صالحًا للمتجر.

## API الإنتاجي

البناء الإنتاجي يجب أن يستخدم:

```text
https://api.yalladelivery.org
```

لا تستخدم DuckDNS أو عنوان localhost في build المتجر.

## روابط Play Console الرسمية

- سياسة الخصوصية: `https://yalladelivery.org/privacy.html`
- حذف الحساب: `https://yalladelivery.org/delete-account.html`

لم يعد GitHub Pages هو رابط سياسة الخصوصية المعتمد للمشروع.

## قائمة تحقق قبل الرفع

- [ ] CI/build ناجح على commit الإصدار.
- [ ] `versionCode` أكبر من آخر إصدار مرفوع.
- [ ] AAB موقّع بمفتاح الرفع الصحيح.
- [ ] API origin هو `https://api.yalladelivery.org`.
- [ ] سياسة الخصوصية وصفحة حذف الحساب تعملان عبر HTTPS.
- [ ] Data Safety يطابق التطبيق الحالي فعليًا.
- [ ] صلاحيات Android الحالية مبررة ومتوافقة مع وظائف التطبيق.
- [ ] لقطات الشاشة والوصف وبيانات الدعم محدثة.
- [ ] Content rating مكتمل.
- [ ] targetSdk يحقق متطلبات Google Play الحالية وقت الإصدار.
- [ ] تم اختبار login، إنشاء الطلب، الدفع، الإشعارات والتحديث الإجباري/الاختياري إن كان مفعّلًا.

## Data Safety

لا تنسخ إجابات قديمة بشكل آلي. راجع [`09-data-safety.md`](09-data-safety.md) ثم طابقها مع:

- `mobile/pubspec.yaml`.
- Android manifest المولّد/المخصص.
- SDKs الحالية.
- API الفعلية وممارسات التخزين/الحذف.

## إصدار جديد

مثال فقط:

```yaml
version: 1.0.12+13
```

القاعدة المهمة هي أن الرقم بعد `+` يزيد عن كل build سبق رفعه إلى Play Console.

بعد تعديل النسخة:

1. شغّل CI.
2. شغّل workflow الإصدار.
3. اختبر artifact المناسب.
4. ارفع AAB إلى المسار المطلوب في Play Console (اختبار/إنتاج).
5. استخدم ملاحظات إصدار محددة لما تغير في النسخة، لا قائمة ميزات عامة.

## أمان الأسرار

لا تطبع keystore base64 أو كلمات المرور في logs. إذا كُشف secret، استبدله واتبع إجراءات تدوير المفتاح الممكنة في Play Console/GitHub حسب نوع السر.
