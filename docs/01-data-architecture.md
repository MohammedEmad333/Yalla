# القسم 1 — معمارية البيانات ومخطّط قاعدة البيانات

نعتمد **MongoDB** (Document DB) لمرونتها مع البيانات اللحظية والفهارس الجغرافية `2dsphere`.
فيما يلي الكيانات (Collections) الأساسية وحقولها والعلاقات بينها.

## نظرة علائقية (ERD)

```
User (1) ───< Order >─── (1) Captain
                │
                └───< Log (سجل الأحداث)

Location = قيمة مضمّنة (Embedded GeoJSON) داخل Order (pickup / dropoff)
           وداخل Captain (currentLocation) وUser (savedAddresses)
```

## 1) Users — المستخدمون (العملاء)

| الحقل | النوع | ملاحظات |
|------|------|---------|
| `_id` | ObjectId | مفتاح أساسي |
| `name` | String | required |
| `phone` | String | required, **unique** |
| `email` | String | unique/sparse |
| `passwordHash` | String | مشفّرة bcrypt، `select:false` |
| `role` | Enum(`user`,`admin`) | افتراضي `user` |
| `savedAddresses[]` | Array<{label, address, location:Point}> | عناوين محفوظة |
| `isActive` | Boolean | تعطيل الحساب |
| `createdAt/updatedAt` | Date | تلقائي |

## 2) Captains — الكباتن (السائقون)

| الحقل | النوع | ملاحظات |
|------|------|---------|
| `_id` | ObjectId | مفتاح أساسي |
| `name`,`phone`,`passwordHash` | String | phone **unique** |
| `vehicleType` | Enum(`bicycle`,`motorcycle`) | |
| `vehiclePlate` | String | رقم اللوحة |
| `status` | Enum(`online`,`offline`,`busy`) | **مفهرس** |
| `currentLocation` | GeoJSON Point `[lng,lat]` | فهرس `2dsphere` |
| `activeOrder` | Ref→Order | الطلب الجاري |
| `rating` | Number | متوسّط 0–5 (متوسّط متحرّك) |
| `ratingsCount` | Number | عدد التقييمات (لحساب المتوسّط) |
| `isApproved` | Boolean | موافقة الأدمن |

## 3) Orders — الطلبات (الكيان المحوري)

| الحقل | النوع | ملاحظات |
|------|------|---------|
| `_id` | ObjectId | |
| `user` | Ref→User | **مفهرس** (required) |
| `captain` | Ref→Captain | **مفهرس** (يُملأ عند الإسناد) |
| `pickup` | Location | نقطة الاستلام |
| `dropoff` | Location | نقطة التسليم |
| `packageNote` | String | وصف الشحنة |
| `price` | Number | قيمة التوصيل |
| `distanceKm` | Number | المسافة التقديرية |
| `status` | Enum | **مفهرس** — دورة الحياة أدناه |
| `timeline` | Object | طوابع كل مرحلة (assigned/accepted/pickedUp/delivered/cancelled) |
| `cancelReason` | String | |
| `rating` | Object`{stars,comment,ratedAt}` | تقييم المستخدم للكابتن بعد التسليم |

### دورة حياة الطلب (Status Machine)

```
pending ──(admin assigns)──> assigned ──(captain accepts)──> accepted
   │                            │                                │
   └──> cancelled               └──> cancelled          (captain picks up)
                                                                 ▼
                                                            picked_up
                                                                 │
                                                       (captain delivers)
                                                                 ▼
                                                            delivered
```

الانتقالات المسموحة مفروضة في `order.service.js` عبر `ALLOWED_TRANSITIONS`.

## 4) Location — الموقع (كائن مضمّن)

يُخزَّن كـ **GeoJSON Point** لتمكين الاستعلامات الجغرافية:

```json
{
  "address": "شارع التحرير، وسط البلد",
  "contactName": "أحمد",
  "contactPhone": "0100...",
  "location": { "type": "Point", "coordinates": [31.2357, 30.0444] }
}
```
> ⚠️ ترتيب الإحداثيات في GeoJSON هو **[longitude, latitude]** وليس العكس.

## 5) Logs — سجل الأحداث (Audit Trail)

| الحقل | النوع | ملاحظات |
|------|------|---------|
| `order` | Ref→Order | **مفهرس** |
| `actorId` | ObjectId | من نفّذ الفعل |
| `actorRole` | String | user/captain/admin/system |
| `action` | String | ORDER_CREATED, ORDER_ASSIGNED, STATUS_CHANGED... |
| `fromStatus`,`toStatus` | String | لتتبّع الانتقالات |
| `meta` | Mixed | بيانات إضافية (موقع، captainId...) |
| `createdAt` | Date | وقت الحدث |

## الفهارس المهمّة (Indexes)

- `Users.phone` (unique), `Captains.phone` (unique)
- `Captains.status` + `Captains.currentLocation (2dsphere)` → للبحث عن "أقرب كابتن متاح"
- `Orders.status`, `Orders.user`, `Orders.captain` → لاستعلامات اللوحة السريعة
- `Logs.order` → لجلب تاريخ طلب معيّن
