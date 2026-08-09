# Yalla (يلا) 🛵 — تطبيق التوصيل اللحظي

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

## التشغيل السريع للـ Backend

```bash
cd backend
cp .env.example .env      # عدّل المتغيّرات
npm install
npm run dev               # يعمل على http://localhost:4000
```

راجع `docs/` لتفاصيل المعمارية وتدفّق البيانات اللحظي.
