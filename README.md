# Yalla (يلا) 🛵 — تطبيق التوصيل اللحظي

[![CI](https://github.com/MohammedEmad333/Yalla/actions/workflows/ci.yml/badge.svg)](https://github.com/MohammedEmad333/Yalla/actions/workflows/ci.yml)

منظومة توصيل لحظية (Real-Time) تعمل بالدراجات الهوائية/النارية، تتكوّن من ثلاثة أجزاء:

1. **تطبيق المستخدم (User App)** — إنشاء طلبات التوصيل، تحديد نقاط الاستلام/التسليم، وتتبّع الطلب لحظيًا.
2. **تطبيق الكابتن (Captain App)** — تبديل الحالة (متصل/غير متصل)، استقبال الطلبات المُسندة، التنقّل، وتحديث حالة التوصيل.
3. **لوحة تحكم الأدمن (Admin Panel)** — مراقبة الطلبات النشطة، إسناد الطلبات للكباتن المتاحين، وإدارة المستخدمين.

## الحزمة التقنية (Tech Stack)

| الطبقة | التقنية |
|--------|---------|
| Backend & Real-time | Node.js + Express + **Socket.io** |
| قاعدة البيانات | MongoDB (Mongoose) — مع فهارس جغرافية `2dsphere` |
| الموبايل | Flutter (Clean Architecture) |
| لوحة الأدمن | React (Web Dashboard) |
| الخرائط | Google Maps API |

## بنية المشروع

```
Yalla/
├── backend/     # Node.js + Express + Socket.io API
├── mobile/      # شاشات Flutter المبدئية (User / Captain)
├── admin/       # لوحة تحكم React
└── docs/        # توثيق المعمارية والتدفّق اللحظي
```

## التشغيل السريع — المنظومة كاملةً (Docker)

```bash
docker compose up --build
# API: http://localhost:4000 · Admin: http://localhost:8080 · Mongo: 27017

# أوّل تشغيل: أنشئ حساب أدمن
docker compose exec api npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

## التشغيل اليدوي للـ Backend (للتطوير)

```bash
cd backend
cp .env.example .env      # عدّل المتغيّرات
npm install
npm run dev               # يعمل على http://localhost:4000
npm test                  # اختبارات الوحدة (بلا قاعدة بيانات)
npm run test:integration  # اختبارات تكامل (mongodb-memory-server أو TEST_MONGO_URI)
```

> اختبارات التكامل تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات، وتعمل كاملةً
> في CI أو محليًا. لاستخدام مونجو خاصّ:
> `TEST_MONGO_URI=mongodb://localhost:27017/yalla_test npm run test:integration`

## لوحة الأدمن (تطوير)

```bash
cd admin
cp .env.example .env
npm install
npm run dev               # يعمل على http://localhost:5173
```

## توثيق الـ API

بعد تشغيل الـ Backend:
- مواصفة OpenAPI: `http://localhost:4000/api/openapi.json` (قابلة للاستيراد في Postman/Swagger).
- صفحة توثيق تفاعلية: `http://localhost:4000/api/docs`.

راجع `docs/` لتفاصيل المعمارية، التدفّق اللحظي، والنشر.
