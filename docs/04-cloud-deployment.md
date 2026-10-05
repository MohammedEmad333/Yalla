# 04 — سجل النشر السحابي القديم

آخر مراجعة: 2026-10-05

> **مرجع تاريخي فقط — لا تستخدمه لنشر الإنتاج الحالي.**

كانت مراحل قديمة من Yalla تعتمد خدمات مثل Render وMongoDB Atlas وVercel/Netlify وعنوان DuckDNS. هذه ليست بنية الإنتاج الأساسية الحالية.

## البنية الحالية

- Backend + MongoDB: Oracle Cloud.
- API الرسمي: `https://api.yalladelivery.org`.
- DNS/TLS: Cloudflare.
- الموقع العام: Cloudflare Workers Static Assets.
- Yalla Web: Cloudflare Workers Static Assets.
- Yalla Admin: Cloudflare Workers Static Assets.
- Yalla Partner: Cloudflare Workers Static Assets.
- وسائط عامة: قرص Oracle الدائم (`/home/ubuntu/yalla-media` → `/app/media`).

`yalla-api.duckdns.org` قد يبقى فقط للتوافق مع إصدارات قديمة، ولا يجب استخدامه في builds أو إعدادات إنتاج جديدة.

## مصادر الحقيقة الحالية

- [`../README.md`](../README.md) — نظرة عامة وروابط الإنتاج.
- [`03-deployment.md`](03-deployment.md) — التشغيل والنشر.
- [`11-cloudflare-pages.md`](11-cloudflare-pages.md) — واجهات Cloudflare.
- [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md) — Oracle والتشغيل الحالي.
- [`15-oracle-media-storage.md`](15-oracle-media-storage.md) — الوسائط.

إذا ظهر في وثيقة أو إعداد جديد أي اعتماد إنتاجي على Render/Atlas/Vercel/Netlify/DuckDNS، تحقق من الكود والـworkflows قبل اعتماده؛ غالبًا هو أثر تاريخي يجب إزالته أو وسمه كتوافق قديم.
