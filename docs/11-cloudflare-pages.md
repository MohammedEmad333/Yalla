# نشر تطبيق الويب على Cloudflare Pages

تطبيق يلا الويب (PWA) موقع **ثابت** داخل مجلد [`site/`](../site) — لا يحتاج أي خطوة
بناء (build). كل المسارات نسبية والـService Worker يُسجَّل من الجذر، فيكفي أن يكون
مجلد `site/` هو **جذر النشر**.

يوجد طريقتان: عبر ربط GitHub (نشر تلقائي، مُوصى به) أو عبر سطر الأوامر.

---

## الطريقة 1 — ربط GitHub (نشر تلقائي عند كل push)

1. ادخل [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. اختر مستودع `Yalla`.
3. اضبط إعدادات البناء كالتالي:

   | الحقل | القيمة |
   |---|---|
   | **Framework preset** | `None` |
   | **Build command** | *(اتركه فارغًا)* |
   | **Build output directory** | `site` |
   | **Root directory** | `/` *(الافتراضي)* |

4. اضغط **Save and Deploy**. خلال ثوانٍ تحصل على رابط مثل
   `https://yalla-app.pages.dev`.
5. أي `git push` لاحق على الفرع الافتراضي يُعيد النشر تلقائيًا.

## الطريقة 2 — سطر الأوامر (Wrangler)

ملف [`wrangler.toml`](../wrangler.toml) في جذر المستودع مضبوط مسبقًا
(`pages_build_output_dir = "site"`)، لذا:

```bash
npx wrangler login
npx wrangler pages deploy
```

عند أول تشغيل يطلب اسم المشروع — استخدم `yalla-app`.

---

## بعد النشر — مهم ⚠️

الرابط الناتج يجب أن يُسمح له بالوصول إلى الـbackend عبر CORS:

- على **Render** (خدمة `yalla-api`) عدّل متغيّر البيئة `CORS_ORIGIN` وضع فيه رابط
  Cloudflare، مثل `https://yalla-app.pages.dev` (أو نطاقك المخصّص).
- راجع [`04-cloud-deployment.md`](04-cloud-deployment.md) لتفاصيل متغيّرات Render.

## ملاحظات PWA

- **HTTPS**: يوفّره Cloudflare Pages تلقائيًا — شرط أساسي لعمل الـService Worker وتثبيت التطبيق.
- **مسار الـSW**: بما أن `site/` هو الجذر، فإن `sw.js` يُخدَم من `/sw.js` ونطاق
  تحكّمه يشمل كل الصفحات — لا حاجة لأي تعديل.
- **التحديثات**: ملف [`site/_headers`](../site/_headers) يمنع تخزين `sw.js`
  و`manifest.webmanifest` في الكاش حتى تصل التحديثات فورًا.

## الملفات ذات الصلة

| الملف | الغرض |
|---|---|
| [`site/_headers`](../site/_headers) | ترويسات الكاش والأمان ونوع المحتوى |
| [`wrangler.toml`](../wrangler.toml) | إعداد النشر عبر Wrangler CLI |
| [`site/manifest.webmanifest`](../site/manifest.webmanifest) | بيان الـPWA |
| [`site/sw.js`](../site/sw.js) | الـService Worker |
