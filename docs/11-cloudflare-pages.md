# نشر تطبيق الويب على Cloudflare (Workers + Static Assets)

تطبيق يلا الويب (PWA) موقع **ثابت** داخل مجلد [`site/`](../site) — لا يحتاج أي خطوة
بناء (build). كل المسارات نسبية والـService Worker يُسجَّل من الجذر.

كلاودفلير دمجت Pages داخل Workers، والطريقة الحديثة هي **Worker يخدم ملفات ثابتة
(Static Assets)**. ملف [`wrangler.toml`](../wrangler.toml) في جذر المستودع مضبوط لذلك:

```toml
name = "yalla"
compatibility_date = "2026-08-20"

[assets]
directory = "./site"
```

يوجد طريقتان: عبر ربط GitHub (نشر تلقائي، مُوصى به) أو عبر سطر الأوامر.

---

## الطريقة 1 — ربط GitHub (نشر تلقائي عند كل push)

1. ادخل [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Import a repository** → اختر مستودع `Yalla`.
2. في شاشة **Set up your application** اضبط:

   | الحقل | القيمة |
   |---|---|
   | **Project name** | `yalla` |
   | **Build command** | *(اتركه فارغًا)* |
   | **Deploy command** | `npx wrangler deploy` |

3. اضغط **Deploy**. خلال ثوانٍ تحصل على رابط مثل
   `https://yalla.<account>.workers.dev`.
4. أي `git push` لاحق على الفرع الافتراضي يُعيد النشر تلقائيًا.

> **مهم:** اسم المشروع في اللوحة يجب أن يطابق `name = "yalla"` في `wrangler.toml`،
> وإلا سيفشل أمر النشر أو يُنشئ Worker باسم مختلف.

## الطريقة 2 — سطر الأوامر (Wrangler)

```bash
npx wrangler login
npx wrangler deploy
```

يقرأ `wrangler.toml` تلقائيًا ويخدم محتوى `site/` كأصول ثابتة.

---

## بعد النشر — مهم ⚠️

الرابط الناتج يجب أن يُسمح له بالوصول إلى الـbackend عبر CORS:

- على **Render** (خدمة `yalla-api`) عدّل متغيّر البيئة `CORS_ORIGIN` وضع فيه رابط
  كلاودفلير، مثل `https://yalla.<account>.workers.dev` (أو نطاقك المخصّص).
- راجع [`04-cloud-deployment.md`](04-cloud-deployment.md) لتفاصيل متغيّرات Render.

## ملاحظات PWA

- **HTTPS**: يوفّره كلاودفلير تلقائيًا — شرط أساسي لعمل الـService Worker وتثبيت التطبيق.
- **مسار الـSW**: بما أن محتوى `site/` يُخدَم من الجذر، فإن `sw.js` يُخدَم من `/sw.js`
  ونطاق تحكّمه يشمل كل الصفحات — لا حاجة لأي تعديل.
- **الترويسات**: ملف [`site/_headers`](../site/_headers) مدعوم في Workers Static Assets،
  ويمنع تخزين `sw.js` و`manifest.webmanifest` في الكاش حتى تصل التحديثات فورًا.

## الملفات ذات الصلة

| الملف | الغرض |
|---|---|
| [`site/_headers`](../site/_headers) | ترويسات الكاش والأمان ونوع المحتوى |
| [`wrangler.toml`](../wrangler.toml) | إعداد النشر (Workers + Static Assets) |
| [`site/manifest.webmanifest`](../site/manifest.webmanifest) | بيان الـPWA |
| [`site/sw.js`](../site/sw.js) | الـService Worker |
