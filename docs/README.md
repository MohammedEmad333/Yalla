# Yalla Documentation

آخر مراجعة: 2026-10-05

هذا المجلد هو مرجع التوثيق الفني والتشغيلي لمشروع Yalla. عند تعارض وثيقة قديمة مع الكود أو workflow فعلي، يكون **الكود + إعدادات النشر الحالية** هما مصدر الحقيقة، ثم يجب تحديث الوثيقة في نفس التغيير.

## ابدأ من هنا

| الملف | الغرض | الحالة |
|---|---|---|
| [`../README.md`](../README.md) | نظرة عامة، المكوّنات، روابط الإنتاج | حالي |
| [`../HANDOFF.md`](../HANDOFF.md) | ملخص تشغيلي سريع للجلسات/المساهمين | حالي |
| [`03-deployment.md`](03-deployment.md) | تطوير محلي ونشر Backend | حالي |
| [`11-cloudflare-pages.md`](11-cloudflare-pages.md) | نشر واجهات الويب على Cloudflare Workers | حالي؛ اسم الملف تاريخي |
| [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md) | Oracle: سجل الهجرة + تشغيل الإنتاج | حالي |
| [`14-cloudflare-security.md`](14-cloudflare-security.md) | إعدادات أمان Cloudflare | تشغيلي |
| [`15-oracle-media-storage.md`](15-oracle-media-storage.md) | تخزين الوسائط وهجرة FileAsset | حالي |

## المعمارية والمنتج

- [`01-data-architecture.md`](01-data-architecture.md) — نماذج البيانات وعلاقاتها.
- [`02-realtime-flow.md`](02-realtime-flow.md) — Socket.io والتحديثات اللحظية.
- [`05-wallet-topup.md`](05-wallet-topup.md) — المحفظة وشحن الرصيد.
- [`13-restaurants.md`](13-restaurants.md) — المطاعم/المتاجر وتدفقات الطلب ذات الصلة.
- [`STORE_ORDER_AND_WALLET_FLOW.md`](STORE_ORDER_AND_WALLET_FLOW.md) — تدفق طلب المتجر والمحافظ والتسويات.

## التشغيل والخدمات الخارجية

- [`07-firebase-fcm.md`](07-firebase-fcm.md) — Firebase Cloud Messaging.
- [`14-cloudflare-security.md`](14-cloudflare-security.md) — Cloudflare/TLS والحماية.
- [`15-oracle-media-storage.md`](15-oracle-media-storage.md) — التخزين والنسخ الاحتياطي للوسائط.

## Google Play والسياسات

- [`08-google-play-release.md`](08-google-play-release.md) — إصدار Android على Google Play.
- [`09-data-safety.md`](09-data-safety.md) — Data Safety.
- [`10-store-listing.md`](10-store-listing.md) — Store Listing.
- [`privacy-policy.md`](privacy-policy.md) — سياسة الخصوصية النصية.

> قبل كل إصدار متجر، راجع هذه الملفات مقابل السلوك الفعلي للتطبيق والصلاحيات/SDKs الحالية. لا تنسخ إجابات قديمة إلى Play Console إذا تغير جمع البيانات أو مزود خارجي.

## ملفات تاريخية/تخطيطية

- [`04-cloud-deployment.md`](04-cloud-deployment.md) — سجل بنية النشر القديمة؛ ليس تعليمات نشر حالية.
- [`06-board-cards.md`](06-board-cards.md) — بطاقات/خطة عمل تاريخية؛ لا تعتبر البنود غير المنجزة دليلًا على حالة المنتج الحالية دون التحقق من الكود.

## روابط الإنتاج الرسمية

```text
Website: https://yalladelivery.org
Web App: https://app.yalladelivery.org
Partner: https://partner.yalladelivery.org
Admin:   https://admin.yalladelivery.org
API:     https://api.yalladelivery.org
Health:  https://api.yalladelivery.org/api/health
Docs:    https://api.yalladelivery.org/api/docs
```

## قواعد صيانة التوثيق

1. لا تضع passwords أو tokens أو private keys أو بيانات حسابات حقيقية في Markdown.
2. لا تستخدم Render/Vercel/Atlas/DuckDNS كمسار إنتاج حالي إلا إذا أعيد اعتمادها فعليًا.
3. واجهات الويب الحالية: Cloudflare Workers Static Assets؛ Backend/Mongo: Oracle Cloud.
4. أي تغيير في domain أو port أو container mount أو secret name أو workflow يحتاج تحديث الوثيقة المرتبطة في نفس PR.
5. اجعل أمثلة أوامر الإنتاج آمنة: لا تستخدم أوامر حذف واسعة للـvolumes أو الوسائط.
6. ملفات Google Play والسياسة يجب أن تتبع السلوك الفعلي للتطبيق، لا الافتراضات.
7. `README.md` و`HANDOFF.md` يجب أن يبقيا مختصرين؛ التفاصيل التشغيلية الطويلة مكانها `docs/`.
