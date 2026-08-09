# القسم 2 — المنطق اللحظي وتدفّق البيانات (Real-Time Flow)

نستخدم **Socket.io** فوق نفس خادم Express. الفكرة الأساسية: **الغرف (Rooms)**.
كل عميل ينضمّ لغرفة حسب دوره، فنبثّ الأحداث للطرف المعني فقط بدل البثّ للجميع.

## الغرف (Rooms)

| الغرفة | من ينضمّ إليها | الغرض |
|--------|----------------|-------|
| `admins` | كل الأدمن | استقبال كل الطلبات الجديدة وتحديثاتها |
| `captain:<id>` | كابتن محدّد | استقبال الطلب المُسنَد إليه |
| `user:<id>` | مستخدم محدّد | متابعة حالة طلبه |
| `order:<id>` | من يتابع طلبًا | بثّ موقع الكابتن لحظيًا |

## عقد الأحداث (Events Contract)

مُعرَّف مركزيًا في `utils/constants.js` (EVENTS) ليتشارك الخادم والعملاء نفس الأسماء.

**خادم → عميل:** `order:created`, `order:assigned`, `order:status_updated`, `captain:location`, `captain:status_changed`
**عميل → خادم:** `captain:toggle_status`, `captain:update_location`, `order:update_status`

## التدفّق 1 — إنشاء طلب

```
User App                Backend (REST + Socket)              Admin Panel
   │  POST /api/orders        │                                   │
   ├─────────────────────────►│                                   │
   │                          │ 1. حفظ Order (status=pending)     │
   │                          │ 2. كتابة Log(ORDER_CREATED)       │
   │                          │ 3. emit → room "admins"           │
   │                          ├──────────── order:created ───────►│ (يظهر فورًا)
   │ ◄── 201 + order ─────────┤                                   │
   │  socket: order:join       │                                   │
```

## التدفّق 2 — الإسناد اليدوي من الأدمن

```
Admin Panel             Backend                     Captain App        User App
   │ PATCH /orders/:id/assign  │                        │                 │
   ├──────────────────────────►│                        │                 │
   │                           │ Order.status=assigned  │                 │
   │                           │ Captain.status=busy    │                 │
   │                           │ Log(ORDER_ASSIGNED)    │                 │
   │                           ├── order:assigned ─────►│ (إشعار + رنين)   │
   │                           ├── order:status_updated ─────────────────►│
   │ ◄── order (populated) ────┤                        │                 │
```

## التدفّق 3 — تحديث الكابتن للحالة

```
Captain App              Backend                          User + Admin
   │ socket.emit('order:update_status',                        │
   │   {orderId, status: 'picked_up'})   │                     │
   ├────────────────────────────────────►│                     │
   │                                     │ التحقّق من صحّة الانتقال │
   │                                     │ (ALLOWED_TRANSITIONS) │
   │                                     │ حفظ + Log             │
   │                                     ├── order:status_updated ─────►│
   │ ◄── ack({ok:true, order}) ──────────┤ (user + admins + order room) │
   │                                                             │
   │  عند 'delivered': Captain.status=online (يتحرّر للطلب التالي)  │
```

## بثّ موقع الكابتن (Live Tracking)

الكابتن يرسل موقعه دوريًا (يُنصح بـ throttle كل 3–5 ثوانٍ) عبر `captain:update_location`،
والخادم يبثّه لغرفة `order:<id>` (يتابعها المستخدم) وغرفة `admins`.

## لماذا هذا التصميم؟

- **REST للأفعال الحاسمة** (إنشاء/إسناد/تحديث) → موثوقية + تحقّق + سجلّ.
- **Socket للبثّ الفوري** → إشعارات لحظية بلا استطلاع (polling).
- **الغرف** → عزل وكفاءة: لا نُغرق كل العملاء بأحداث لا تخصّهم.
- **طبقة Service موحّدة** → نفس منطق العمل يُستدعى من REST ومن Socket دون تكرار.

## بديل Firebase (اختياري)

لو فُضّل Firebase بدل Node: استخدم **Firestore** بنفس المجموعات أعلاه، مع
`onSnapshot` بدل غرف السوكت، و **Cloud Functions** (trigger على تغيّر `status`)
لإرسال إشعارات FCM للكابتن/المستخدم. المخطّط نفسه ينطبق دون تغيير يُذكر.
