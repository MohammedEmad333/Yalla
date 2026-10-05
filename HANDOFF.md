# Yalla (يلا) — Project Handoff

آخر مراجعة: 2026-10-05

هذا الملف هو ملخّص تشغيلي سريع للحالة الحالية. التفاصيل المتخصصة موجودة في `docs/README.md` والملفات المرتبطة منه.

## المستودع والمكوّنات

المستودع: `MohammedEmad333/Yalla`.

- `backend/`: Node.js + Express + Socket.io + MongoDB/Mongoose.
- `mobile/`: تطبيق Flutter للزبون والكابتن.
- `partner/`: تطبيق/واجهة الشريك.
- `admin/`: React + Vite + Capacitor للوحة وتطبيق الإدارة.
- `web-app/`: نسخة الويب/PWA.
- `site/`: الموقع العام.
- `bot/`: بوت WhatsApp مبني على Baileys.
- `docs/`: التوثيق المعماري والتشغيلي.

## الإنتاج الحالي

| الخدمة | العنوان/المكان |
|---|---|
| الموقع العام | `https://yalladelivery.org` |
| تطبيق الويب | `https://app.yalladelivery.org` |
| Partner | `https://partner.yalladelivery.org` |
| Admin | `https://admin.yalladelivery.org` |
| API | `https://api.yalladelivery.org` |
| API health | `https://api.yalladelivery.org/api/health` |
| API docs | `https://api.yalladelivery.org/api/docs` |

الـBackend وMongoDB يعملان على Oracle Cloud. واجهات الويب تُنشر عبر Cloudflare Workers Static Assets. DNS/TLS أمام الخدمات العامة مُدار عبر Cloudflare، وCaddy هو reverse proxy أمام الـAPI على الخادم.

`yalla-api.duckdns.org` عنوان توافق قديم فقط، وليس عنوان الإنتاج الافتراضي للبنايات الجديدة.

## تخزين البيانات والوسائط

- MongoDB داخل حاوية `yalla-mongo` مع تخزين دائم وغير مكشوف مباشرة للإنترنت.
- ملفات الوسائط العامة على المضيف في `/home/ubuntu/yalla-media` ومربوطة داخل API إلى `/app/media`.
- لا تعتمد على `FileAsset` binary داخل MongoDB للصور الجديدة.
- روابط `/files/<id>` القديمة محفوظة للتوافق مع الوسائط القديمة التي تم ترحيلها.
- مستندات الهوية والمرفوعات الحساسة لا تُخدم من `/media` العام.

راجع `docs/15-oracle-media-storage.md`.

## تحديث Backend في الإنتاج

المستودع خاص، والخادم يستخدم deploy key/SSH للوصول إلى GitHub. بعد التأكد أن `origin` يعمل:

```bash
cd ~/Yalla
git fetch origin
git pull --ff-only origin main
bash tool/deploy-server.sh
```

السكربت يعيد بناء واستبدال `yalla-api`، يحافظ على mounts الإنتاج، يفحص `/api/health` ويتراجع عند فشل النسخة الجديدة. لا تستبدله عشوائيًا بـ`docker compose up` على خادم الإنتاج إذا كان التشغيل الحالي يعتمد الحاويات المُدارة بواسطة سكربت النشر.

فحوص سريعة بعد النشر:

```bash
curl -fsS https://api.yalladelivery.org/api/health
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 100 yalla-api
```

## التطوير المحلي

```bash
docker compose up --build
```

Backend مباشرة:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
npm test
npm run test:integration
```

لا تضع بيانات دخول حقيقية أو مفاتيح أو حسابات اختبار شخصية داخل ملفات التوثيق.

## CI والنشر

الـworkflows داخل `.github/workflows/` هي المصدر الفعلي للبناء والنشر. أهم المسارات:

- CI واختبارات المشروع.
- Android builds لتطبيق Yalla وPartner وAdmin.
- نشر `site`, `web-app`, `admin`, و`partner` إلى Cloudflare.

قبل تغيير اسم secret أو متغير نشر، طابقه مع workflow الفعلي وملفات `wrangler-*.toml`.

## قواعد التوثيق

1. `README.md` هو نظرة عامة على المنتج والمكوّنات والروابط الرسمية.
2. `HANDOFF.md` للحالة التشغيلية الحالية فقط؛ لا تُخزّن فيه إعدادات جهاز مطوّر شخصية أو حسابات/كلمات مرور.
3. `docs/README.md` هو فهرس التوثيق ومصدر معرفة أي ملف يجب قراءته.
4. ملفات الهجرة القديمة تُحفظ كسجل تاريخي، لكن يجب تمييز الخطوات المنتهية بوضوح وعدم تقديم Vercel/Render/Atlas/DuckDNS كمسار نشر حالي.
5. أي تغيير في domains أو mounts أو workflows أو متغيرات البيئة يجب أن يتبعه تحديث التوثيق في نفس PR.
