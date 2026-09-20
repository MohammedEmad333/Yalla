# نشر واجهات Yalla على Cloudflare Workers

جميع واجهات الويب الإنتاجية في Yalla تُنشر الآن على **Cloudflare Workers Static Assets**،
بينما يبقى الـBackend وقاعدة البيانات على Oracle Cloud.

## خريطة الإنتاج

| الواجهة | Worker | الدومين | ملف الإعداد |
|---|---|---|---|
| الموقع العام | `yalla-site` | `yalladelivery.org` | `wrangler-site.toml` |
| تطبيق Yalla Web | `yalla-app` | `app.yalladelivery.org` | `wrangler-app.toml` |
| لوحة الإدارة | `yalla-admin` | `admin.yalladelivery.org` | `wrangler-admin.toml` |
| Yalla Partner | `yalla-partner` | `partner.yalladelivery.org` | `wrangler-partner.toml` |

الـAPI الرسمي لجميع البنايات الجديدة:

```text
https://api.yalladelivery.org
```

ويُحتفَظ بـ `yalla-api.duckdns.org` للتوافق مع الإصدارات القديمة فقط.

## GitHub Actions

- `.github/workflows/site-web.yml` ينشر الموقع العام.
- `.github/workflows/web-app.yml` يبني Flutter Web وينشر تطبيق العميل.
- `.github/workflows/admin-web.yml` يبني React/Vite وينشر لوحة الإدارة.
- `.github/workflows/partner-web.yml` يبني Flutter Web وينشر Partner.

تحتاج عمليات النشر إلى الأسرار التالية في GitHub Actions:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

## تطبيق العميل

يُبنى من `mobile/` ويُنسخ الناتج إلى `web-app/`:

```bash
API_ORIGIN=https://api.yalladelivery.org tool/build-web.sh
```

ثم يستخدم Workflow ملف `wrangler-app.toml` لنشر الملفات الثابتة.

## لوحة الإدارة

Workflow الأدمن يبني Vite مع:

```text
VITE_API_URL=https://api.yalladelivery.org
```

ثم ينشر `admin/dist` باستخدام `wrangler-admin.toml`.

## Partner

يُبنى Flutter Web بعنوان API الرسمي، ثم يُنشر `partner/build/web` باستخدام
`wrangler-partner.toml`.

## الموقع العام

مجلد `site/` هو الموقع الرسمي على `yalladelivery.org` ويُنشر باستخدام
`wrangler-site.toml`.

## CORS

الـBackend يسمح بنطاقات Yalla الرسمية:

```text
https://yalladelivery.org
https://www.yalladelivery.org
https://app.yalladelivery.org
https://admin.yalladelivery.org
https://partner.yalladelivery.org
```

لذلك لا ينبغي استخدام نطاقات Preview كعناوين إنتاجية.

## ملاحظة عن `wrangler.toml`

يوجد ملف `wrangler.toml` قديم في جذر المستودع للتوافق المؤقت مع Cloudflare Git
integration السابق. لا تعتمد عليه في النشر الجديد؛ ملفات `wrangler-*.toml` أعلاه
هي المصدر الرسمي. بعد فصل التكامل القديم يمكن حذف الملف بأمان.
