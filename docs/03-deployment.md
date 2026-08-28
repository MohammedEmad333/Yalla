# القسم 3 — تجهيز النشر (Deployment)

تُشغَّل المنظومة كاملةً عبر Docker Compose: قاعدة البيانات + الـ API + لوحة الأدمن.

> 🌐 للنشر السحابي الحالي على **Oracle Cloud** (الخادم + قاعدة البيانات معًا في
> Docker) راجع [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md).
> (الطريقة القديمة Render + Atlas في `04-cloud-deployment.md` للاطّلاع التاريخي فقط.)

## التشغيل بأمر واحد

```bash
# من جذر المشروع
docker compose up --build
```

بعدها تتوفّر الخدمات على:

| الخدمة | العنوان |
|--------|---------|
| الـ API (REST + Socket.io) | http://localhost:4000 |
| فحص الصحّة | http://localhost:4000/api/health |
| لوحة الأدمن | http://localhost:8080 |
| MongoDB | localhost:27017 |

## المكوّنات

```
docker-compose.yml
├── mongo   — MongoDB 7 مع volume دائم + healthcheck
├── api     — backend/Dockerfile (Node 20, ينتظر جاهزية mongo)
└── admin   — admin/Dockerfile (بناء Vite ثم تقديم عبر nginx)
```

## المتغيّرات المهمّة (Environment)

تُمرَّر عبر البيئة أو ملف `.env` بجانب `docker-compose.yml`:

| المتغيّر | الافتراضي | الغرض |
|---------|-----------|-------|
| `JWT_SECRET` | change_me_super_secret | **غيّره في الإنتاج** |
| `AUTO_ASSIGN` | false | إسناد تلقائي لأقرب كابتن |
| `FCM_CREDENTIALS_PATH` | (فارغ) | ملف اعتماد Firebase للإشعارات |

> ⚠️ لتفعيل إشعارات FCM في Docker: ضَع ملف الاعتماد داخل الحاوية عبر volume
> واضبط `FCM_CREDENTIALS_PATH` على مساره داخلها.

## أوّل تشغيل — إنشاء أدمن

```bash
# داخل حاوية الـ API
docker compose exec api npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

ثم ادخل لوحة الأدمن (http://localhost:8080) بنفس الهاتف وكلمة المرور.

## ملاحظات الإنتاج

- استبدل `CORS_ORIGIN='*'` بنطاق لوحة الأدمن الحقيقي.
- استخدم عنوان `VITE_API_URL` الحقيقي عند بناء صورة الأدمن (build arg).
- فعّل نسخًا احتياطيًا لـ volume قاعدة البيانات `mongo_data`.
- ضع الـ API خلف بروكسي (nginx/traefik) مع TLS، وحافظ على WebSocket upgrade.
