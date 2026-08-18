# إجابات نموذج Data Safety — Google Play (تطبيق Yalla)

جاهزة للنسخ في **Play Console → App content → Data safety**. الأسماء بالإنجليزية كما
تظهر في النموذج. مبنيّة على ما يجمعه التطبيق فعليًا (موقع، اسم/هاتف، صور إيصالات،
محفظة، رمز إشعارات FCM).

> ملاحظة عن «المشاركة» (Sharing): Google تَعُدّ «المشاركة» نقلَ البيانات إلى **طرف
> ثالث**. مزوّدونا (Firebase/Google، Render، MongoDB Atlas) يُعالجون البيانات
> **نيابةً عنّا كمزوّدي خدمة** فقط، ولا يُعدّ ذلك «مشاركة» لدى Google. وفتح خرائط
> Google للملاحة يتمّ على جهاز المستخدم بمبادرته. لذلك **Shared = No** لكل الأنواع.

---

## 1) الأسئلة التمهيدية (Overview)

| السؤال | الإجابة |
|--------|---------|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** |

---

## 2) أنواع البيانات (Data types)

لكل نوع: **Collected = Yes**, **Shared = No**, **Processed ephemerally = No**
(مخزَّنة)، ما لم يُذكر غير ذلك.

### Location — Precise location
- Collected: **Yes** · Shared: **No**
- Required or optional: **Required**
- Purposes: **App functionality**، و**Fraud prevention, security, and compliance**
- (السبب: تحديد نقاط الاستلام/التسليم وتتبّع الكابتن لحظيًا. لا يُجمع الموقع في الخلفية.)

### Personal info — Name
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**، **Account management**

### Personal info — Phone number
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**، **Account management**
- (يُعرض رقم الطرف الآخر للمستخدم/الكابتن أثناء الطلب لإتمام التوصيل فقط.)

### Personal info — Address
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**
- (عناوين الاستلام/التسليم الخاصّة بالطلب.)

### Personal info — User IDs
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**، **Account management**
- (مُعرّف الحساب داخل النظام.)

### Financial info — Purchase history / Other financial info
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**
- (رصيد المحفظة، المعاملات، وأرباح الكابتن — دفع داخلي، بلا معالجة بطاقات داخل التطبيق.)

### Photos and videos — Photos
- Collected: **Yes** · Shared: **No** · **Optional**
- Purposes: **App functionality**
- (صور إيصالات شحن الرصيد — يرفعها المستخدم اختياريًا للتحقّق.)

### Device or other IDs — Device or other IDs
- Collected: **Yes** · Shared: **No** · Required
- Purposes: **App functionality**
- (رمز جهاز Firebase (FCM token) لإرسال إشعارات الطلبات.)

---

## 3) أنواع لا نجمعها — اترك خانتها Not collected

- Approximate location · Email address · Race/ethnicity · Political/religious beliefs
  · Sexual orientation · Other personal info
- Health and fitness · Messages (SMS/email/in-app content) · Audio · Music
- Files and docs · Calendar · Contacts · Web browsing history
- Payment info / Credit score (لا تُجمع بيانات بطاقات داخل التطبيق)

> **App info and performance → Crash logs / Diagnostics:** اتركها **Not collected**
> إلّا إذا أضفت لاحقًا أداة تقارير أعطال (مثل Firebase Crashlytics) تُرسل السجلّات
> إلى خادم — عندها ضعها **Yes / App functionality (أو Analytics)**.

---

## 4) ممارسات الأمان (Security practices)
- Data is encrypted in transit: **Yes** (كل الاتصال عبر HTTPS).
- Users can request that data be deleted: **Yes** — عبر البريد
  mohammedelrefy28@gmail.com (كما في سياسة الخصوصية).
- Committed to follow the Play Families Policy? **No** (التطبيق غير موجَّه للأطفال).

---

## 5) رابط سياسة الخصوصية (App content → Privacy policy)
```
https://mohammedemad333.github.io/Yalla/
```

> راجِع هذه الإجابات إن أضفت ميزات تجمع بيانات جديدة (تحليلات، إعلانات، تقارير أعطال).
