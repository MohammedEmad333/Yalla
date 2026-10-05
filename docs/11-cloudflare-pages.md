# 11 — نشر واجهات Yalla على Cloudflare Workers

آخر مراجعة: 2026-10-05

> اسم الملف `11-cloudflare-pages.md` تاريخي. النشر الحالي للواجهات يعتمد **Cloudflare Workers Static Assets** وليس Cloudflare Pages التقليدي.

جميع واجهات الويب الإنتاجية في Yalla تُنشر على Cloudflare، بينما يبقى الـBackend وقاعدة البيانات على Oracle Cloud.

## خريطة الإنتاج

| الواجهة | Worker | الدومين | ملف الإعداد |
|---|---|---|---|
| الموقع العام | `yalla-site` | `yalladelivery.org` | `wrangler-site.toml` |
| تطبيق Yalla Web | `yalla-app` | `app.yalladelivery.org` | `wrangler-app.toml` |
| لوحة الإدارة | `yalla-admin` | `admin.yalladelivery.org` | `wrangler-admin.toml` |
| Yalla Partner | `yalla-partner` | `partner.yalladelivery.org` | `wrangler-partner.toml` |

الـAPI الرسمي للبنايات الجديدة:

```text
https://api.yalladelivery.org
```

لا تستخدم `yalla-api.duckdns.org` في builds جديدة؛ إن بقي فهو للتوافق مع إصدارات قديمة فقط.

## GitHub Actions

الـworkflows ذات الصلة داخل `.github/workflows/` هي المصدر النهائي لأوامر البناء والنشر. المسارات الحالية تشمل:

- `site-web.yml` — الموقع العام.
- `web-app.yml` — تطبيق العميل Web.
- `admin-web.yml` — لوحة الإدارة.
- `partner-web.yml` — Partner Web.

النشر إلى Cloudflare يحتاج عادةً أسرار الحساب/token المعرفة في workflows، مثل:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

لا تضع قيم هذه الأسرار في التوثيق أو في ملفات `wrangler-*.toml`.

## تطبيق العميل

يُبنى من Flutter Web باستخدام عنوان API الرسمي. عند استخدام سكربت المشروع:

```bash
API_ORIGIN=https://api.yalladelivery.org tool/build-web.sh
```

طابق أي تغيير في output directory مع `web-app.yml` و`wrangler-app.toml`.

## لوحة الإدارة

البناء الإنتاجي يستخدم:

```text
VITE_API_URL=https://api.yalladelivery.org
```

ثم تُنشر ملفات البناء وفق `admin-web.yml` و`wrangler-admin.toml`.

## Partner

Partner Flutter Web يجب أن يُبنى بعنوان API الرسمي ثم يُنشر وفق workflow و`wrangler-partner.toml` الحاليين.

## الموقع العام

`site/` هو المصدر للموقع الرسمي على `yalladelivery.org` ويُنشر عبر `wrangler-site.toml`.

## CORS

الـBackend يجب أن يسمح فقط بالأصول المطلوبة فعليًا، ومنها نطاقات Yalla الرسمية:

```text
https://yalladelivery.org
https://www.yalladelivery.org
https://app.yalladelivery.org
https://admin.yalladelivery.org
https://partner.yalladelivery.org
```

لا تضف `*` في الإنتاج ولا تعتمد preview domains دائمًا دون حاجة.

## التحقق بعد النشر

تحقق من الواجهات ومن اتصالها بالـAPI، وليس نجاح workflow فقط:

```bash
curl -I https://yalladelivery.org
curl -I https://app.yalladelivery.org
curl -I https://admin.yalladelivery.org
curl -I https://partner.yalladelivery.org
curl -fsS https://api.yalladelivery.org/api/health
```

`www.yalladelivery.org` يجب أن يبقى متوافقًا مع سياسة التحويل المحددة حاليًا للموقع.

## ملفات Wrangler

ملفات `wrangler-*.toml` الخاصة بكل واجهة هي الإعداد المقصود للنشر الحالي. إذا بقي `wrangler.toml` عام/قديم في الجذر، فلا تفترض أنه مصدر الحقيقة قبل مقارنة workflow الذي يستدعيه.

## مراجع

- [`03-deployment.md`](03-deployment.md)
- [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md)
- [`14-cloudflare-security.md`](14-cloudflare-security.md)
