# Yalla (يلا) 🛵

منظومة توصيل ومتاجر لحظية متكاملة، وليست تطبيقًا واحدًا فقط. المستودع يحتوي على تطبيق العميل/الكابتن، تطبيق الشركاء، لوحة وتطبيق الإدارة، تطبيق الويب، الموقع، والـBackend المشترك.

## مكوّنات المنظومة

| المكوّن | التقنية | الوظيفة |
|---|---|---|
| `mobile/` | Flutter | تطبيق Yalla للزبون والكابتن: الطلب، المطاعم، المحفظة، التتبع، الإشعارات، الأرباح |
| `partner/` | Flutter | Yalla Partner لأصحاب المطاعم والمتاجر: الطلبات، المنتجات، التشغيل، التحليلات والمستحقات |
| `admin/` | React + Vite + Capacitor | Yalla Admin: العمليات، المستخدمون، الكباتن، المتاجر، المحافظ، الإحصائيات والمال |
| `web-app/` | Web/PWA | نسخة الويب القابلة للتثبيت |
| `site/` | Web | صفحات الموقع العامة |
| `backend/` | Node.js + Express + Socket.io | API، منطق الطلبات، MongoDB، الإشعارات والتحديث اللحظي |
| `docs/` | Markdown | التوثيق المعماري والتشغيلي |

## الحزمة التقنية

- **Backend:** Node.js + Express + Socket.io
- **Database:** MongoDB + Mongoose + `2dsphere`
- **Mobile/Partner:** Flutter
- **Admin:** React/Vite، مع تغليف Android بواسطة Capacitor
- **Maps/Location:** Google Maps عند توفر المفاتيح + بيانات المدن والأحياء من الخادم
- **Notifications:** Firebase Cloud Messaging + إشعارات داخل التطبيق
- **Production:** Oracle Cloud للـAPI/Mongo، Vercel/Cloudflare للواجهات

## أهم المزايا الحالية

### Yalla — الزبون والكابتن

- إنشاء طلبات توصيل وتسعيرها من الخادم.
- الطلب المباشر من المطاعم والمتاجر وقائمة منتجات حقيقية.
- محفظة الزبون، شحن الرصيد، السحب والاسترداد.
- تتبع الطلب لحظيًا عبر Socket.io.
- إسناد تلقائي/يدوي للكباتن، رفض وإعادة إسناد ومهلة قبول.
- تقييم الكابتن والمتجر، دردشة ودعم وإشعارات FCM.
- طلبات مجدولة وحماية من التكرار بواسطة `Idempotency-Key`.
- **عناوين محفوظة** عبر `/api/features/addresses`.
- **متاجر مفضلة** عبر `/api/features/favorites`.
- **إعادة الطلب** عبر `/api/features/reorder/:orderId`.
- **كوبونات وعروض** عامة أو مخصصة لمتجر، مع خصم ثابت أو نسبة وحد أدنى وحد أقصى للخصم.

### Yalla Partner

- حساب شريك مرتبط بمتجر واحد مع تحقق ملكية على كل عملية.
- إدارة المتجر والمنتجات والصور والتوفر.
- دورة طلب المتجر: `new → accepted → preparing → ready`.
- فتح/إغلاق المتجر مؤقتًا من التطبيق مع استمرار ساعات العمل المجدولة.
- أحجام/Variants، و**مجموعات خيارات وإضافات** للصنف مع تسعير من الخادم.
- إشعارات وطلبات مخصصة للشريك.
- لوحة Partner جديدة: مبيعات اليوم والأسبوع، متوسط الطلب، الأكثر مبيعًا.
- حساب مستحقات المتجر، سجل التسويات، وطلب سحب المستحقات.

### Yalla Admin

- لوحة لحظية للطلبات والكباتن، إدارة المستخدمين والمتاجر والحسابات.
- بحث وفلترة وتصدير CSV وإحصائيات.
- محفظة الإدارة، شحنات وسحوبات وتسويات.
- **مركز العمليات والمال**: تنبيه طلب بلا كابتن، متجر لم يقبل، طلب متأخر، وملخص مالي موحد.
- تسويات الشركاء: مراجعة طلبات السحب وتعليمها كمدفوعة أو مرفوضة.
- API لإدارة الكوبونات والعروض.
- تطبيق Android للإدارة مع Push Notifications.

## API للميزات الجديدة

```text
GET    /api/features/addresses
POST   /api/features/addresses
PATCH  /api/features/addresses/:addressId
DELETE /api/features/addresses/:addressId

GET    /api/features/favorites
POST   /api/features/favorites/:restaurantId/toggle
POST   /api/features/reorder/:orderId

GET    /api/features/coupons?restaurantId=...
POST   /api/features/coupons/validate

GET    /api/features/merchant/analytics
GET    /api/features/merchant/finance
PATCH  /api/features/merchant/open
POST   /api/features/merchant/settlements

GET    /api/features/admin/operations-alerts
GET    /api/features/admin/finance
GET    /api/features/admin/coupons
POST   /api/features/admin/coupons
PATCH  /api/features/admin/coupons/:id
GET    /api/features/admin/merchant-settlements
PATCH  /api/features/admin/merchant-settlements/:id
```

## تشغيل المنظومة محليًا

```bash
docker compose up --build
```

- API: `http://localhost:4000`
- Admin: راجع منفذ `docker-compose.yml` الحالي
- MongoDB: داخل Docker

إنشاء أدمن لأول مرة:

```bash
docker compose exec api npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

تشغيل Backend مباشرة:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
npm test
npm run test:integration
```

تشغيل Partner:

```bash
cd partner
flutter pub get
flutter run --dart-define=API_ORIGIN=http://10.0.2.2:4000
```

## CI / Builds

GitHub Actions يشمل حاليًا مسارات للبناء والاختبار، منها:

- `ci.yml` — اختبارات Backend + build للإدارة.
- `mobile-apk.yml` — Android لتطبيق Yalla.
- `partner-apk.yml` — APK/AAB لـYalla Partner.
- `build-admin-apk.yml` — تطبيق Yalla Admin Android.
- `web-app.yml` — تطبيق الويب.

## النشر الحالي

الإنتاج يعمل على Oracle Cloud لخدمة الـBackend وقاعدة البيانات. تحديث الخادم:

```bash
cd ~/Yalla
git pull origin main
bash tool/deploy-server.sh
```

السكربت يبني صورة الـBackend، يعيد إنشاء الحاوية، يفحص `/api/health` ويتراجع تلقائيًا عند فشل التحديث. لا تستخدم `docker compose up` على خادم الإنتاج إذا كان التشغيل الحالي يعتمد الحاويات اليدوية الموضحة في `docs/12-oracle-cloud-migration.md`.

## توثيق API

بعد تشغيل الخادم:

- OpenAPI JSON: `http://localhost:4000/api/openapi.json`
- واجهة التوثيق: `http://localhost:4000/api/docs`

راجع `docs/` و`HANDOFF.md` للتفاصيل التشغيلية، ملاحظات بيئة التطوير، وأحدث حالة للمشروع.
