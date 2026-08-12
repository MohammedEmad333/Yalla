# القسم 4 — النشر السحابي المجاني (Cloud Deployment)

هذا الدليل يشرح نشر Yalla على خدمات سحابية **مجانية** بدل Docker المحلّي، لأن
استضافة InfinityFree (نطاقات `great-site.net`) تدعم **PHP + MySQL فقط** ولا تُشغّل
Node.js أو Socket.io أو MongoDB — أي أنها غير صالحة لتشغيل خادم Yalla.

## نظرة عامة — تقسيم المنظومة

بدل خادم واحد، نوزّع المكوّنات على خدمات مجانية متخصّصة:

| المكوّن | الخدمة المقترحة | الطبقة المجانية |
|---------|------------------|------------------|
| قاعدة البيانات (MongoDB) | **MongoDB Atlas** | 512MB مجانًا (M0) |
| الـ Backend (Express + Socket.io) | **Render** | خدمة Web مجانية |
| لوحة الأدمن (React) | **Netlify** أو **Vercel** | مجانية بسخاء |
| النطاق | **InfinityFree** (`gazalook.great-site.net`) | مجاني |

```
                       ┌────────────────────────────┐
   المستخدم/الكابتن ──▶│  Netlify/Vercel (لوحة الأدمن) │
   (المتصفّح)          └──────────────┬─────────────┘
                                      │ REST + WebSocket
                                      ▼
                       ┌────────────────────────────┐
                       │   Render (yalla-api / Node)  │
                       └──────────────┬─────────────┘
                                      │ mongodb+srv://
                                      ▼
                       ┌────────────────────────────┐
                       │  MongoDB Atlas (قاعدة البيانات)│
                       └────────────────────────────┘
```

الملفّات الجاهزة في المستودع:
- `render.yaml` — إعداد نشر الـ Backend على Render (Blueprint).
- `admin/netlify.toml` — إعداد نشر لوحة الأدمن على Netlify.
- `admin/vercel.json` — إعداد نشر لوحة الأدمن على Vercel (بديل Netlify).

---

## الخطوة 1 — قاعدة البيانات على MongoDB Atlas

1. أنشئ حسابًا على <https://www.mongodb.com/cloud/atlas> واختر خطّة **M0 (Free)**.
2. اختر مزوّدًا ومنطقة قريبة (مثلًا AWS / Frankfurt).
3. من **Database Access**: أنشئ مستخدمًا (username + password) — احفظ كلمة المرور.
4. من **Network Access**: أضِف `0.0.0.0/0` (السماح من أي IP) — ضروري لأن IP خوادم
   Render متغيّر. (للإنتاج الجادّ يمكن لاحقًا تقييده.)
5. من **Connect → Drivers**: انسخ سلسلة الاتصال، بالشكل:

   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/yalla?retryWrites=true&w=majority
   ```

   > انتبه: أضِف اسم القاعدة `yalla` بعد `.net/` كما في المثال، واستبدل
   > `<user>` و`<password>` بقيمك الحقيقية.

احتفظ بهذه السلسلة — ستضعها في متغيّر `MONGO_URI` على Render.

---

## الخطوة 2 — الـ Backend على Render

يقرأ Render ملف `render.yaml` من جذر المستودع تلقائيًا (Blueprint).

1. أنشئ حسابًا على <https://render.com> واربطه بـ GitHub.
2. **New + → Blueprint** → اختر مستودع `MohammedEmad333/Yalla`.
3. سيكتشف Render خدمة `yalla-api`. اضغط **Apply**.
4. بعد الإنشاء، افتح الخدمة → **Environment**، واضبط المتغيّرين السريّين:
   - `MONGO_URI` = سلسلة اتصال Atlas من الخطوة 1.
   - `CORS_ORIGIN` = عنوان لوحة الأدمن (ستحصل عليه في الخطوة 3، مثال
     `https://gazalook-admin.netlify.app`). مبدئيًا يمكنك وضع `*` ثم تضييقه لاحقًا.
   - (`JWT_SECRET` يولّده Render تلقائيًا — لا حاجة لضبطه.)
5. احفظ — سيُعيد Render النشر. عند الانتهاء ستحصل على عنوان مثل:
   `https://yalla-api.onrender.com`
6. تحقّق من الصحّة عبر فتح: `https://yalla-api.onrender.com/api/health`
   يجب أن يُرجع `{"status":"ok","service":"yalla-api"}`.

> ⚠️ **الطبقة المجانية على Render** تُنيم الخدمة بعد ~15 دقيقة خمول، وأول طلب بعدها
> يستغرق ~30–50 ثانية للإيقاظ. مقبول للتجربة؛ للإنتاج رقِّ الخطة أو استخدم
> مُوقظًا دوريًا (cron-ping).

### إنشاء حساب أدمن (Seed)

الطبقة المجانية لا تتيح Shell دائمًا. أسهل طريقة: افتح **Shell** من لوحة Render (إن
توفّرت) ونفّذ:

```bash
npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

بديل بدون Shell: شغّل السكربت محليًا مع توجيهه لقاعدة Atlas نفسها:

```bash
cd backend
MONGO_URI="mongodb+srv://...atlas..." npm run seed:admin "المدير" 0100000000 "StrongPass123"
```

---

## الخطوة 3 — لوحة الأدمن على Netlify (أو Vercel)

لوحة الأدمن هي React/Vite تُبنى إلى ملفّات ثابتة — تُستضاف مجانًا. الكود في مجلد
`admin/`، والإعدادات جاهزة (`admin/netlify.toml` و`admin/vercel.json`).

### خيار أ — Netlify (مُوصى به)

1. أنشئ حسابًا على <https://netlify.com> واربطه بـ GitHub.
2. **Add new site → Import an existing project** → اختر مستودع Yalla.
3. اضبط:
   - **Base directory:** `admin`
   - (الأمر ومجلّد النشر مضبوطان في `netlify.toml`: `npm run build` → `dist`)
4. قبل النشر، من **Site settings → Environment variables** أضِف:
   - `VITE_API_URL` = `https://yalla-api.onrender.com` (عنوان Render من الخطوة 2)

   > يُقرأ هذا المتغيّر **وقت البناء**، فأي تغيير له يتطلّب **Redeploy**.
5. انشر. ستحصل على عنوان مثل `https://gazalook-admin.netlify.app`.
6. ارجع إلى Render واضبط `CORS_ORIGIN` على هذا العنوان بالضبط (بدون `/` في النهاية).

### خيار ب — Vercel

1. <https://vercel.com> → **Add New → Project** → استورد مستودع Yalla.
2. اضبط **Root Directory** = `admin` (مهم — التطبيق في مجلّد فرعي).
3. أضِف متغيّر البيئة `VITE_API_URL` = عنوان Render.
4. انشر، ثم اضبط `CORS_ORIGIN` على Render لعنوان Vercel الناتج.

---

## الخطوة 4 — ربط نطاق InfinityFree

النطاق `gazalook.great-site.net` من InfinityFree يمكن توجيهه إلى لوحة الأدمن (Netlify/
Vercel) عبر DNS. الطريقة تعتمد على ما يسمح به InfinityFree:

- **الأفضل (نطاق فرعي عبر CNAME):** من لوحة InfinityFree (قسم CNAME Records) أنشئ
  سجلًّا مثل `admin` يشير إلى عنوان Netlify (`gazalook-admin.netlify.app`)، ثم في
  Netlify: **Domain settings → Add custom domain** أدخل `admin.gazalook.great-site.net`.
- **بديل (Netlify DNS):** إن سمح InfinityFree بتعديل خوادم الأسماء (Nameservers)،
  وجّهها لخوادم Netlify واتركه يدير كل شيء.

> ملاحظة: النطاقات المجانية من InfinityFree أحيانًا تقيّد سجلّات DNS المتقدّمة. إن
> واجهت قيودًا، أبسط حلّ هو استخدام النطاق الفرعي المجاني من Netlify/Vercel مباشرة
> (مثل `gazalook-admin.netlify.app`) — يعمل فورًا وبشهادة HTTPS تلقائية.

الـ **Backend** يبقى على عنوان Render (`onrender.com`) — لا حاجة لربطه بنطاق InfinityFree،
ولوحة الأدمن تتصل به عبر `VITE_API_URL`.

---

## قائمة تحقّق نهائية

- [ ] Atlas يعمل و`MONGO_URI` مضبوط على Render.
- [ ] `https://yalla-api.onrender.com/api/health` يُرجع `status: ok`.
- [ ] حساب أدمن مُنشأ عبر `seed:admin`.
- [ ] لوحة الأدمن منشورة و`VITE_API_URL` يشير لعنوان Render.
- [ ] `CORS_ORIGIN` على Render = عنوان لوحة الأدمن بالضبط.
- [ ] تسجيل الدخول للوحة يعمل، والتتبّع اللحظي (Socket.io) يتّصل بلا أخطاء CORS.

## استكشاف الأخطاء

| العرض | السبب المرجّح | الحل |
|-------|----------------|------|
| فشل CORS في المتصفّح | `CORS_ORIGIN` ≠ عنوان اللوحة | طابِق العنوان تمامًا (بدون `/` أخير) وأعِد النشر |
| اللوحة تتصل بـ localhost | `VITE_API_URL` غير مضبوط وقت البناء | اضبطه ثم **Redeploy** |
| أول طلب بطيء جدًّا | نوم الطبقة المجانية على Render | طبيعي؛ رقِّ الخطة أو استخدم ping دوري |
| فشل اتصال Mongo | Network Access في Atlas | أضِف `0.0.0.0/0` |
