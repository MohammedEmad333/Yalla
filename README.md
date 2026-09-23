# Yalla (يلا) 🛵

منظومة توصيل ومتاجر لحظية متكاملة. المستودع يحتوي على تطبيق العميل/الكابتن، تطبيق الشركاء، لوحة وتطبيق الإدارة، تطبيق الويب، الموقع، والـBackend المشترك.

## مكوّنات المنظومة

| المكوّن | التقنية | الوظيفة |
|---|---|---|
| `mobile/` | Flutter | تطبيق Yalla للزبون والكابتن: الطلب، المطاعم، المحفظة، التتبع، الإشعارات، الأرباح |
| `partner/` | Flutter | Yalla Partner: الطلبات، المنتجات، التشغيل، المخزون، الموظفون، التحليلات والمستحقات |
| `admin/` | React + Vite + Capacitor | Yalla Admin: العمليات، المستخدمون، المتاجر، المال، الجودة، التسويق وصحة النظام |
| `web-app/` | Web/PWA | نسخة الويب القابلة للتثبيت |
| `site/` | Web | صفحات الموقع العامة |
| `backend/` | Node.js + Express + Socket.io | API، الطلبات، MongoDB، المحافظ، الإشعارات والتحديث اللحظي |
| `bot/` | Node.js + Baileys + Express | بوت واتساب لخدمة العملاء، AI، Human Takeover، وروابط التطبيق |
| `docs/` | Markdown | التوثيق المعماري والتشغيلي |

## الحزمة التقنية

- **Backend:** Node.js + Express + Socket.io
- **Database:** MongoDB + Mongoose + `2dsphere`
- **Mobile/Partner:** Flutter
- **Admin:** React/Vite + Capacitor Android
- **Notifications:** Firebase Cloud Messaging + إشعارات داخل التطبيق
- **Production:** Oracle Cloud للـAPI/Mongo، Cloudflare Workers Static Assets لكل واجهات الويب

## روابط الإنتاج الرسمية

- **Yalla Delivery Website:** https://yalladelivery.org
- **Yalla Web App:** https://app.yalladelivery.org
- **Yalla Partner:** https://partner.yalladelivery.org
- **WWW:** https://www.yalladelivery.org → تحويل دائم `301` إلى `https://yalladelivery.org`
- **Production API:** https://api.yalladelivery.org
- **API Health:** https://api.yalladelivery.org/api/health
- **Yalla Admin:** https://admin.yalladelivery.org
- **Privacy Policy:** https://yalladelivery.org/privacy.html
- **Delete Account:** https://yalladelivery.org/delete-account.html
- **API Docs:** https://api.yalladelivery.org/api/docs
- **OpenAPI JSON:** https://api.yalladelivery.org/api/openapi.json

> `yalla-api.duckdns.org` يُحتفَظ به مؤقتًا كعنوان توافق للإصدارات القديمة من التطبيقات، لكنه لم يعد العنوان الأساسي للإنتاج أو للبنايات الجديدة.

## أهم المزايا الحالية

### Yalla — الزبون والكابتن

- طلبات توصيل عادية وطلبات مباشرة من المتاجر والمطاعم.
- محفظة، شحن رصيد، سحب، استرداد وتسوية مالية عند التسليم.
- تتبع لحظي، إسناد تلقائي/يدوي، رفض وإعادة إسناد ومهلة قبول.
- تقييم الكابتن والمتجر، دردشة، دعم وإشعارات FCM.
- طلبات مجدولة وحماية من التكرار بواسطة `Idempotency-Key`.
- **سلة متجر محفوظة** تستمر بعد إغلاق التطبيق وتُراجع مقابل القائمة الحالية عند الاستعادة.
- **عناوين محفوظة** واستخدامها مباشرة أثناء إتمام الطلب.
- **متاجر مفضلة** وإدارة المفضلة من التطبيق.
- **إعادة الطلب** من طلب متجر سابق مع إعادة التحقق من الأسعار والتوفر والمخزون.
- **بحث موحد** بالمتجر أو اسم الصنف أو الوصف أو القسم.
- **Variants + إضافات وخيارات** يتم تسعيرها والتحقق منها من الخادم.
- **كوبونات** ثابتة أو نسبية، مع حدود وصلاحية واستخدام لمتجر محدد أو المنصة.
- **عروض الشريك** مع خصم تلقائي واختيار أفضل خصم بين العرض والكوبون.
- **بانرات عروض ديناميكية** من الإدارة بدون إصدار تطبيق جديد.
- **الطلب لشخص آخر** مع اسم ورقم المستلم.
- **جدولة طلب المطعم** حتى 14 يومًا مع التحقق من ساعات اليوم المختار.
- **نقاط Yalla ودعوات** مع رمز دعوة لكل مستخدم.
- **مركز مشاكل واسترداد** مرتبط بالطلبات السابقة.

### Yalla Partner

- حساب مالك متجر مرتبط بالمتجر نفسه، مع حسابات موظفين `Owner / Manager / Cashier`.
- إدارة المنتجات والصور والتوفر والأحجام والإضافات والخيارات.
- دورة طلب المتجر: `new → accepted → preparing → ready`.
- فتح/إغلاق المتجر يدويًا.
- **جدول أسبوعي** مختلف لكل يوم.
- **Busy Mode** لمدة مؤقتة مع إضافة دقائق تحضير إلى ETA.
- **عروض خاصة بالمتجر** بنسبة خصم وحد أدنى للطلب.
- **مخزون بسيط**: كمية، حد تنبيه، نفاد تلقائي، وتعديل سريع +/-.
- حماية من طلب كمية أكبر من المخزون الموجود.
- Dashboard للمبيعات والطلبات ومتوسط الطلب والأصناف الأكثر مبيعًا.
- مستحقات المتجر، سجل التسويات، وطلب سحب المستحقات.
- إدارة موظفي المتجر وتفعيل/إيقاف الحسابات وتغيير كلمات السر.

### Yalla Admin

- لوحة لحظية للطلبات والكباتن وإدارة المستخدمين والمتاجر والحسابات.
- بحث وفلترة وتصدير CSV وإحصائيات.
- محفظة الإدارة، شحنات، سحوبات وتسويات.
- **مركز العمليات والمال** لتنبيهات عدم الإسناد، تأخر قبول المتجر، تأخير الطلبات والملخص المالي.
- **تسويات الشركاء** ومراجعة طلبات السحب.
- **إدارة الكوبونات**.
- **مركز التسويق والعروض** لإنشاء بانرات وربطها بمتجر أو كوبون وتحديد فترة ظهورها وترتيبها.
- **Merchandising للمتاجر**: Featured / Popular / New.
- **مركز الجودة** للشكاوى والاستردادات ومراجعتها واعتماد المبلغ أو رفضها.
- **Audit Log** للإجراءات الجديدة الحساسة.
- **System Health** لحالة API وMongo والذاكرة والـuptime وأعداد الكيانات الرئيسية.
- تطبيق Android للإدارة مع Push Notifications.

## API للميزات الموسعة

```text
# المستخدم
GET    /api/features/addresses
POST   /api/features/addresses
PATCH  /api/features/addresses/:addressId
DELETE /api/features/addresses/:addressId
GET    /api/features/favorites
POST   /api/features/favorites/:restaurantId/toggle
POST   /api/features/reorder/:orderId
GET    /api/features/coupons?restaurantId=...
POST   /api/features/coupons/validate
POST   /api/commerce/restaurant-order
GET    /api/expansion/search?q=...
GET    /api/expansion/banners
GET    /api/expansion/rewards
POST   /api/expansion/referrals/apply
GET    /api/expansion/issues
POST   /api/expansion/issues

# Partner
GET    /api/features/merchant/analytics
GET    /api/features/merchant/finance
POST   /api/features/merchant/settlements
GET    /api/merchant/inventory
PATCH  /api/merchant/inventory/:itemId
POST   /api/merchant-staff/login
GET    /api/merchant-staff
POST   /api/merchant-staff
PATCH  /api/merchant-staff/:staffId
DELETE /api/merchant-staff/:staffId

# Admin
GET    /api/features/admin/operations-alerts
GET    /api/features/admin/finance
GET    /api/features/admin/coupons
POST   /api/features/admin/coupons
GET    /api/features/admin/merchant-settlements
GET    /api/expansion/admin/issues
PATCH  /api/expansion/admin/issues/:issueId
GET    /api/expansion/admin/audit
GET    /api/expansion/admin/system-health
PATCH  /api/expansion/admin/restaurants/:restaurantId/merchandising
GET    /api/expansion/admin/banners
POST   /api/expansion/admin/banners
PATCH  /api/expansion/admin/banners/:bannerId
DELETE /api/expansion/admin/banners/:bannerId
```

## تشغيل المنظومة محليًا

```bash
docker compose up --build
```

إنشاء أدمن لأول مرة:

```bash
docker compose exec api npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

تشغيل Backend مباشرة:

```bash
cd backend
cp .env.example .env
# يتطلب Node.js 22+
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

- `ci.yml` — اختبارات Backend + build للإدارة + Flutter checks + فحص واختبارات Yalla Bot.
- `mobile-apk.yml` — Android لتطبيق Yalla، ويستخدم افتراضيًا `https://api.yalladelivery.org`.
- `partner-apk.yml` — APK/AAB لـYalla Partner، ويستخدم افتراضيًا `https://api.yalladelivery.org`.
- `build-admin-apk.yml` — تطبيق Yalla Admin Android.
- `web-app.yml` — تطبيق الويب، ويستخدم افتراضيًا `https://api.yalladelivery.org`.
- `admin-web.yml` — يبني وينشر لوحة الإدارة على Cloudflare (`yalla-admin`).
- `partner-web.yml` — يبني وينشر Yalla Partner على Cloudflare (`yalla-partner`).
- `site-web.yml` — ينشر الموقع العام على Cloudflare (`yalla-site`).

## النشر الحالي

الإنتاج يعمل على Oracle Cloud لخدمة الـBackend وقاعدة البيانات، مع `api.yalladelivery.org` كعنوان API الرسمي. جميع واجهات الويب تُنشر على Cloudflare Workers Static Assets: الموقع العام على `yalladelivery.org`، تطبيق Yalla Web على `app.yalladelivery.org`، Yalla Partner على `partner.yalladelivery.org`، ولوحة الإدارة على `admin.yalladelivery.org`.

تحديث الخادم:

```bash
cd ~/Yalla
git pull origin main
bash tool/deploy-server.sh
```

السكربت يبني صورة الـBackend، يعيد إنشاء الحاوية، يفحص `/api/health` ويتراجع تلقائيًا عند فشل التحديث. لا تستخدم `docker compose up` على خادم الإنتاج إذا كان التشغيل الحالي يعتمد الحاويات اليدوية الموضحة في `docs/12-oracle-cloud-migration.md`.

## توثيق API

- OpenAPI JSON: `https://api.yalladelivery.org/api/openapi.json`
- واجهة التوثيق: `https://api.yalladelivery.org/api/docs`

راجع `docs/` و`HANDOFF.md` للتفاصيل التشغيلية وأحدث حالة للمشروع.

## Yalla Bot

بوت واتساب موجود الآن داخل `bot/` كجزء من نفس المستودع، وليس Submodule منفصلًا.

تشغيله محليًا:

```bash
cd bot
cp .env.example .env
npm ci
npm test
npm start
```

دليل النشر الكامل: `bot/DEPLOY-ORACLE.md`.
