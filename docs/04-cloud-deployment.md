# القسم 4 — النشر السحابي القديم

> **مهجور — مرجع تاريخي فقط.**

لم تعد Yalla تستخدم Render أو MongoDB Atlas أو Vercel أو Netlify في مسار الإنتاج الحالي.

الوضع الحالي:

- Backend + MongoDB: Oracle Cloud.
- API الرسمي: `https://api.yalladelivery.org`.
- الموقع العام: Cloudflare Workers Static Assets.
- Yalla Web: Cloudflare Workers Static Assets.
- Yalla Admin: Cloudflare Workers Static Assets.
- Yalla Partner: Cloudflare Workers Static Assets.
- DNS وTLS: Cloudflare.

للتفاصيل الحالية راجع:

- `docs/11-cloudflare-pages.md`
- `docs/12-oracle-cloud-migration.md`
- `README.md`

لا تستخدم إعدادات Vercel/Netlify/Render القديمة عند نشر إصدار جديد.
