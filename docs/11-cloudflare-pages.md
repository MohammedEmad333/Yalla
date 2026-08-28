# نشر تطبيق الويب على Cloudflare (Flutter Web)

الرابط على Cloudflare يفتح **تطبيق يلا نفسه كنسخة ويب** — ناتج بناء Flutter
(`flutter build web`) لتطبيق `mobile/`. يُنشر كـ **Worker يخدم ملفات ثابتة
(Static Assets)** من مجلد [`web-app/`](../web-app).

> ملاحظة: مجلد [`site/`](../site) القديم كان مجرد صفحة هبوط/تعريف (زر Google Play +
> سياسة خصوصية)، ولم يعد هو جذر النشر. يبقى في المستودع كمرجع لسياسة الخصوصية.

---

## كيف يعمل

1. `web-app/` يحتوي ناتج بناء Flutter للويب (مُلتزَم في Git).
2. [`wrangler.toml`](../wrangler.toml) يوجّه Cloudflare لخدمة `web-app/`:

   ```toml
   name = "yalla"
   compatibility_date = "2026-08-20"

   [assets]
   directory = "./web-app"
   not_found_handling = "single-page-application"
   ```

3. عند كل `git push`، مشروع Cloudflare المربوط بـ GitHub ينفّذ `npx wrangler deploy`
   فيرفع محتوى `web-app/` — **بدون الحاجة لتثبيت Flutter على Cloudflare**، لأن
   البناء يتم مسبقًا ويُلتزَم في المستودع.

عنوان الـ backend يُثبَّت وقت البناء عبر `--dart-define=API_ORIGIN=...` ويشير إلى
خادم Oracle (`https://yalla-api.duckdns.org`).

---

## إعادة البناء بعد أي تعديل على التطبيق

أي تغيير في كود `mobile/` يتطلّب إعادة بناء الويب والتزام الناتج:

```bash
tool/build-web.sh            # يبني وينسخ إلى web-app/
git add web-app && git commit -m "rebuild web" && git push
```

Cloudflare ينشر تلقائيًا بعد الـ push.

> يحتاج الجهاز الذي يبني إلى Flutter SDK مثبّتًا. لتثبيت عنوان backend مختلف:
> `API_ORIGIN=https://my-api.example tool/build-web.sh`.

---

## بعد النشر — مهم ⚠️

رابط Cloudflare (مثل `https://yalla.<account>.workers.dev`) يجب أن يُسمح له بالوصول
إلى الـ backend عبر CORS:

- على **خادم Oracle** أضِف رابط Cloudflare إلى `CORS_ORIGIN` مع رابط
  لوحة الأدمن، مفصولين بفاصلة (الـ backend يدعم عدّة روابط الآن). مثال:

  ```
  https://gazalook-admin.netlify.app,https://yalla.<account>.workers.dev
  ```

- راجع [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md) لتفاصيل متغيّرات الخادم.

بدون هذا، سيفشل تسجيل الدخول واتصال Socket من نسخة الويب.

---

## الملفات ذات الصلة

| الملف | الغرض |
|---|---|
| [`web-app/`](../web-app) | ناتج بناء Flutter للويب (يُنشر كما هو) |
| [`web-app/_headers`](../web-app/_headers) | ترويسات الكاش/الأمان على Cloudflare |
| [`wrangler.toml`](../wrangler.toml) | إعداد النشر (Workers + Static Assets) |
| [`tool/build-web.sh`](../tool/build-web.sh) | إعادة بناء الويب ونسخه إلى `web-app/` |
| [`mobile/web/`](../mobile/web) | ملفات منصّة الويب المصدرية (index/manifest/أيقونات) |
| [`mobile/lib/core/config/app_config.dart`](../mobile/lib/core/config/app_config.dart) | مصدر عنوان الـ API (`API_ORIGIN`) |
