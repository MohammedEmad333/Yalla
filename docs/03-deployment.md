# 03 — التشغيل والنشر

آخر مراجعة: 2026-10-05

يوثّق هذا الملف الفرق بين **التطوير المحلي** و**نشر الإنتاج**. لا تستخدم خطوات التطوير المحلي كبديل لسكربت الإنتاج.

## التطوير المحلي

من جذر المشروع:

```bash
docker compose up --build
```

الخدمات المحلية المعتادة:

| الخدمة | العنوان |
|---|---|
| API + Socket.io | `http://localhost:4000` |
| Health | `http://localhost:4000/api/health` |
| Admin | حسب port المعرّف في `docker-compose.yml` |
| MongoDB | محلي داخل Docker |

اعتبر `docker-compose.yml` المصدر النهائي لأسماء الخدمات والمنافذ المحلية؛ لا تنسخ قيمًا قديمة من جلسات سابقة.

## Backend محليًا بدون Docker

```bash
cd backend
cp .env.example .env
npm install
npm run dev
npm test
npm run test:integration
```

لا تضع secrets حقيقية في `.env.example` أو ملفات التوثيق.

## الإنتاج

الحالة الحالية:

- Backend + MongoDB على Oracle Cloud.
- API الرسمي: `https://api.yalladelivery.org`.
- Caddy أمام الـAPI للـHTTPS والـreverse proxy.
- واجهات الويب على Cloudflare Workers Static Assets.
- الوسائط العامة محفوظة على قرص Oracle الدائم، host `/home/ubuntu/yalla-media` → container `/app/media`.

### تحديث Backend

```bash
cd ~/Yalla
git fetch origin
git pull --ff-only origin main
bash tool/deploy-server.sh
```

لأن المستودع خاص، يجب أن يكون deploy key/SSH الخاص بالخادم صالحًا قبل `git pull`.

لا تستخدم `docker compose up` على خادم الإنتاج ما لم يتم تحويل بنية الإنتاج رسميًا إلى Compose؛ سكربت `tool/deploy-server.sh` هو مسار تحديث الـAPI الحالي.

### فحص ما بعد النشر

```bash
curl -fsS https://api.yalladelivery.org/api/health
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 100 yalla-api
```

الاستجابة المتوقعة للصحة:

```json
{"status":"ok","service":"yalla-api"}
```

## متغيرات البيئة

القيم الفعلية تُدار خارج Git. راجع `backend/.env.example` والكود وworkflow ذي الصلة قبل إضافة أو حذف أي متغير.

قواعد الإنتاج:

- استخدم secret قويًا لـJWT.
- لا تستخدم `CORS_ORIGIN=*` في الإنتاج.
- لا تكشف MongoDB للإنترنت.
- ملف اعتماد Firebase وأي مفاتيح مزوّدات خارجية تبقى خارج المستودع.
- عناوين API الجديدة تستخدم `https://api.yalladelivery.org`.

## إنشاء أدمن محلي/بيئة جديدة

استخدم script المشروع فقط في بيئة مصرح بها:

```bash
docker compose exec api npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

غيّر بيانات المثال فورًا ولا توثق أي بيانات دخول حقيقية.

## مراجع

- [فهرس التوثيق](README.md)
- [Oracle Cloud والتشغيل](12-oracle-cloud-migration.md)
- [Cloudflare](11-cloudflare-pages.md)
- [تخزين الوسائط](15-oracle-media-storage.md)
- [أمان Cloudflare](14-cloudflare-security.md)
