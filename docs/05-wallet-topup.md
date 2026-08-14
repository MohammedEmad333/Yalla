# 05 — محفظة المستخدم وشحن الرصيد (Wallet & Top-up)

نظام رصيد رقمي داخل تطبيق يلا. مصمَّم على **مرحلتين** دون إعادة كتابة:

- **المرحلة 1 (الحالية):** المستخدم يحوّل المبلغ خارج التطبيق (بنك فلسطين /
  جوال باي / بال باي)، ثم يرفع صورة الإيصال ورقم العملية. الأدمن يراجع الطلب
  من لوحة التحكّم ويقبله فيُضاف الرصيد تلقائيًّا.
- **المرحلة 2 (لاحقًا):** ربط بوابات الدفع الرسمية (API/SDK) بحيث يُدفع
  ويُحدَّث الرصيد فوريًّا دون تدخّل بشري.

الانتقال بين المرحلتين لا يمسّ منطق المحفظة — بفضل **نمط الاستراتيجية**.

---

## 1) هيكل قاعدة البيانات (Schema)

المشروع يستخدم **MongoDB/Mongoose**. الجداول (Collections):

### `wallets` — محفظة واحدة لكل مستخدم
| الحقل | النوع | الوصف |
|------|------|------|
| `user` | ObjectId → User (unique) | مالك المحفظة |
| `balance` | Number (≥ 0) | الرصيد الحالي بالشيكل (أعداد صحيحة) |
| `currency` | String | العملة (ILS افتراضيًّا) |

`balance` هو "مصدر الحقيقة" السريع؛ وكل تغيّر عليه له سجلّ في `wallet_transactions`.

### `wallet_transactions` — دفتر أستاذ (Ledger) يخدم المرحلتين
| الحقل | النوع | يخدم |
|------|------|------|
| `user`, `wallet` | ObjectId | العلاقات |
| `type` | enum: `topup` \| `order_payment` \| `refund` \| `adjustment` | نوع الحركة |
| `direction` | enum: `credit` \| `debit` | اتجاه التأثير على الرصيد |
| `amount` | Number (> 0) | المبلغ |
| `method` | enum: `bank_of_palestine` \| `jawwal_pay` \| `palpay` | يختار الاستراتيجية |
| `status` | enum: `pending` \| `approved` \| `rejected` | **المعلّق/المكتمل/المرفوض** |
| `proof.imageUrl` | String | **المرحلة 1**: صورة الإيصال |
| `proof.referenceNumber` | String | **المرحلة 1**: رقم العملية |
| `proof.senderName`, `proof.paidAt` | String/Date | بيانات التحويل الاختيارية |
| `gatewayResponse` | Mixed | **المرحلة 2**: استجابة البوابة الرسمية |
| `balanceAfter` | Number | الرصيد بعد التطبيق (عند القبول) — للتدقيق |
| `review.by/at/note`, `rejectionReason` | — | مراجعة الأدمن |
| `idempotencyKey` | String (partial-unique) | منع تكرار الطلب |

> **لماذا جدول واحد للمرحلتين؟** `status` يغطّي المعلّق والمكتمل، `proof` يغطّي
> المرحلة 1، و`gatewayResponse` يغطّي المرحلة 2 — تمامًا كما هو مطلوب. لا حاجة
> لتغيير المخطّط عند تفعيل البوابات.

الفهارس: `{user, createdAt}` لجلب الحركات، و`{user, idempotencyKey}` (partial)
لمنع التكرار، و`{status}` لتصفية المعلّقة في لوحة الأدمن.

---

## 2) هيكلية الواجهة الخلفية — نمط الاستراتيجية (Strategy Pattern)

```
services/payment/
├── PaymentStrategy.js            ← الواجهة الأساسية (العقد)
├── ManualReceiptUploadStrategy.js← المرحلة 1: رفع إيصال (المستخدمة حاليًا)
├── gateways/
│   ├── JawwalPayStrategy.js      ← المرحلة 2 (هيكل جاهز)
│   └── BankOfPalestineStrategy.js← المرحلة 2 (هيكل جاهز)
└── index.js                      ← PaymentService + السجلّ (registry)
```

- **`PaymentService` (index.js)** يحتفظ بسجلّ `method → strategy`، ويوزّع
  `requestTopUp()` على الاستراتيجية المناسبة بعد التحقّق من المبلغ والطريقة.
- **`wallet.service.js`** يحتوي منطق الرصيد فقط (إضافة/خصم ذرّي، موافقة/رفض).
  لا يعرف شيئًا عن طرق الدفع.

### كيف نضيف بوابة في المرحلة 2؟
في `services/payment/index.js` فقط، نستبدل سطر التسجيل:
```js
// بدل: register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.JAWWAL_PAY));
const JawwalPayStrategy = require('./gateways/JawwalPayStrategy');
register(new JawwalPayStrategy());
```
دون تعديل `wallet.service` أو المتحكّمات أو المسارات أو الموبايل. البوابة تملأ
`gatewayResponse` وتستدعي المحفظة لإضافة الرصيد تلقائيًّا عبر Webhook.

### الأمان المالي
- **الموافقة ذرّية وآمنة ضدّ التكرار:** نطالب أوّلًا بتحويل الحالة
  `pending → approved` عبر `findOneAndUpdate` مشروط؛ لا يُضاف الرصيد إلّا بعد
  نجاح المطالبة، فلا مضاعفة للرصيد تحت التزامن.
- **الخصم لا ينزل تحت الصفر:** شرط `balance ≥ amount` داخل التحديث الذرّي.

---

## 3) تدفّق واجهة المستخدم (Flutter)

```
[المحفظة] عرض الرصيد + سجلّ الحركات
   └─ زرّ "شحن الرصيد"
        └─ [شاشة الشحن]
             1) اختيار الطريقة (رقاقة) → تظهر بيانات الحساب + التعليمات
             2) إدخال المبلغ + رقم العملية
             3) رفع صورة الإيصال (image_picker)
             4) إرسال (multipart) → "قيد المراجعة"
   └─ عند موافقة الأدمن: يصل حدث wallet:updated لحظيًا فيتحدّث الرصيد
```

الملفّات: `features/wallet/presentation/wallet_screen.dart` و`topup_screen.dart`
و`features/wallet/data/wallet_repository.dart`. تبويب "المحفظة" مضاف إلى
`user_home.dart`.

---

## 4) منطق لوحة الإدارة

| Endpoint | الغرض |
|---------|------|
| `GET /admin/wallet/topups?status=pending` | عرض الطلبات (حسب الحالة) |
| `POST /admin/wallet/topups/:txId/approve` | قبول → **يضيف الرصيد تلقائيًّا** |
| `POST /admin/wallet/topups/:txId/reject` | رفض (بلا رصيد) + سبب |
| `GET /admin/users/:userId/wallet` | محفظة مستخدم + حركاته |

الصفحة: `admin/src/pages/WalletTopups.jsx` — جدول بالطلبات، معاينة صورة الإيصال،
وأزرار موافقة/رفض. القبول يستدعي `walletService.approveTopup` الذي يضيف الرصيد
ويُشعر المستخدم ويبثّ `wallet:updated`.

---

## واجهات المستخدم (User API)
| Endpoint | الغرض |
|---------|------|
| `GET /wallet` | الرصيد الحالي |
| `GET /wallet/methods` | طرق الشحن + بيانات الحساب والتعليمات |
| `GET /wallet/transactions` | سجلّ الحركات |
| `POST /wallet/topup` | طلب شحن (multipart: `receipt` + الحقول) |

صور الإيصالات تُحفظ في `backend/uploads/receipts/` وتُخدَم على `/uploads/...`
(المجلّد مُتجاهَل في git). في الإنتاج يُفضّل نقلها إلى تخزين سحابي (S3) بتغيير
`upload.middleware.js` فقط.
