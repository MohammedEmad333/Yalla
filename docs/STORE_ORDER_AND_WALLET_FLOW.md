# Store Order, Payment & Settlement Flow

آخر مراجعة: 2026-10-05

يوثّق هذا الملف تدفق طلبات المتاجر/المطاعم الحالي على مستوى عالٍ. كان الإصدار السابق يصف حجز المبلغ داخل `WalletHold` كمسار دفع أساسي؛ تدفق إنشاء طلب المتجر الحالي يبدأ **Jawwal Pay direct payment** ويجب الرجوع للكود عند أي اختلاف.

## التدفق الحالي

```text
Customer creates store/restaurant order
        ↓
Server validates store/menu/options/prices/stock/discounts
        ↓
Order is created with payment required
        ↓
Jawwal Pay payment session starts
        ↓
OTP sent to the wallet phone
        ↓
Customer confirms OTP
        ↓
Backend verifies payment with provider
        ↓
Paid order is activated
        ↓
Merchant receives / accepts / prepares / marks ready
        ↓
Captain assignment and pickup flow
        ↓
Delivery confirmation
        ↓
Financial settlement / earnings / refunds as applicable
```

## إنشاء الطلب

الـBackend هو مصدر الحقيقة للأسعار. لا يعتمد على totals مرسلة من العميل دون إعادة حساب/تحقق.

`backend/src/routes/commerce.routes.js`:

- يتطلب مستخدمًا مصادقًا.
- يطبّق `blockOrderCreationDuringMaintenance`.
- يدعم `Idempotency-Key`.
- ينشئ `restaurant-order` أو `reorder` مع `paymentRequired: true`.
- يبدأ جلسة الدفع عبر `directPayment.startOrderPayment()`.
- إذا فشل بدء الدفع، يحاول إلغاء العملية بدل ترك الطلب فعالًا بدون دفعة.

## Jawwal Pay

الملفات الأساسية:

```text
backend/src/services/directPayment.service.js
backend/src/services/jawwalPayClient.js
backend/src/models/OrderPayment.js
```

المبلغ المدفوع يُحسب في الخادم من قيمة الأصناف + التوصيل - الخصومات/المكافآت المطبقة وفق منطق الطلب الحالي.

يُستخدم مفتاح idempotency مرتبط بالطلب لمنع إنشاء دفعات مكررة مستقلة للطلب نفسه.

## انتظار الدفع وتفعيل الطلب

الطلب الذي يحتاج دفعًا لا يجب معاملته كطلب نشط قابل للتنفيذ قبل نجاح الدفع. بعد تأكيد Jawwal Pay:

1. تُعلّم `OrderPayment` كمدفوعة.
2. تُحفظ مراجع المزود المتاحة.
3. يستدعي الخادم تفعيل الطلب المدفوع بشكل idempotent.

إعادة استدعاء التأكيد لدفعة مسجلة كـ`paid` لا ينبغي أن ينتج عنه خصم ثانٍ.

## إلغاء الدفع

إذا لم تكتمل الدفعة، يمكن لمسار الإلغاء:

- إلغاء العملية لدى المزود عندما يوجد provider reference.
- تعليم عملية الدفع محليًا كملغاة.
- إلغاء الطلب إذا كان لا يزال بانتظار الدفع.
- تحرير المخزون/النقاط المحجوزة حسب implementation الحالي.

الدفعة المكتملة لا تعامل كإلغاء عادي؛ الاسترداد له خدمة مستقلة.

## الاسترداد

مرجع Jawwal Pay للاسترداد:

```text
backend/src/services/jawwalRefund.service.js
backend/src/routes/jawwalRefund.routes.js
```

يجب أن تكون عمليات refund محمية بالصلاحيات وidempotency والتدقيق المالي.

## Merchant Flow

تفاصيل حالات التاجر والانتقالات يجب أخذها من model/service الحاليين. القاعدة التشغيلية المهمة:

- لا يبدأ تنفيذ الطلب التجاري الفعلي قبل تفعيل الطلب المدفوع.
- قبول/تحضير/جاهزية الطلب يجب أن تبقى متناسقة مع حالة الطلب العامة.
- الكابتن لا ينبغي أن يتجاوز متطلبات جاهزية/استلام الطلب التي يفرضها backend.

لا تضف حالة جديدة في UI فقط؛ أضفها إلى state machine والخادم والاختبارات والتوثيق معًا.

## Captain Flow وأكواد التحقق

تدفق التسليم/الاستلام يستخدم أكواد تحقق حيث يفرضها implementation الحالي. الأكواد تُولد وتُتحقق في الخادم، ولا يجب أن يسمح العميل بتجاوزها محليًا.

الأدمن يستطيع استخدام الواجهات المصرح بها للمراقبة والدعم، لكن لا تعرض الأكواد الحساسة في logs عامة أو analytics.

## المخزون

المخزون يُتحقق منه في الخادم. عند إنشاء طلب ثم فشل/إلغاء الدفع يجب ألا تبقى كميات محجوزة بشكل دائم. استخدم خدمات inventory/release الموجودة بدل تعديل الكمية مباشرة من route جديد.

## الخصومات والمكافآت

الكوبونات والعروض ونقاط المكافآت تدخل في حساب الخادم. عند إلغاء الطلب قبل التفعيل/التسوية يجب تحرير أي حجز قابل للإرجاع وفق الخدمات الحالية وبشكل idempotent.

## التوزيع المالي

Yalla تفصل بين:

- قيمة الأصناف/مستحقات المتجر.
- أجرة التوصيل/مستحقات الكابتن.
- عمولة/حصة الإدارة والتسويات.

لا تعيد حساب هذه القيم في التطبيق. خدمات الـBackend وسجلات المعاملات/الأرباح هي مصدر الحقيقة المالي.

## المحفظة الداخلية مقابل الدفع المباشر

توجد محافظ داخلية وخدمات تسوية للمستخدم/الكابتن/الإدارة، لكن هذا لا يعني أن إنشاء طلب متجر حاليًا يعتمد `WalletHold` كطريقة دفع العميل. Jawwal Pay direct payment هو المسار الذي تبدأه `commerce.routes.js` حاليًا.

راجع [`05-wallet-topup.md`](05-wallet-topup.md) للتفريق بينهما.

## ملفات Backend مهمة

```text
backend/src/models/Order.js
backend/src/models/OrderPayment.js
backend/src/services/commerce.service.js
backend/src/services/directPayment.service.js
backend/src/services/jawwalPayClient.js
backend/src/services/order.service.js
backend/src/services/merchant.service.js
backend/src/services/inventory.service.js
backend/src/services/rewards.service.js
```

## الصيانة

عندما يكون وضع إيقاف إنشاء الطلبات مفعّلًا، `blockOrderCreationDuringMaintenance` يمنع إنشاء طلب متجر جديد من هذا المسار. لا تعتمد على إخفاء زر الطلب في العميل كحماية وحيدة.

## الاختبارات المطلوبة

أي تغيير في هذا التدفق يجب أن يغطي على الأقل:

- إعادة حساب الأسعار في الخادم.
- idempotent order creation.
- بدء Jawwal Pay وفشل بدء الجلسة.
- OTP صحيح/خاطئ وإعادة المحاولة.
- عدم تفعيل الطلب قبل الدفع.
- تحرير المخزون/المكافآت عند الإلغاء.
- merchant/captain state transitions.
- التسوية والاسترداد دون ازدواج مالي.

## النشر

بعد دمج تغيير Backend إلى `main`:

```bash
cd ~/Yalla
git fetch origin
git pull --ff-only origin main
bash tool/deploy-server.sh
```

ثم:

```bash
curl -fsS https://api.yalladelivery.org/api/health
docker logs --tail 100 yalla-api
```

لا تستخدم `deploy.sh` القديم؛ سكربت الإنتاج الحالي هو `tool/deploy-server.sh`.
