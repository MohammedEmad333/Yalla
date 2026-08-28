# 12 — نقل قاعدة البيانات والـ Backend إلى Oracle Cloud

توثيق عمليّة نقل منظومة Yalla من **MongoDB Atlas + Render** إلى **سيرفر Oracle Cloud (Always Free)** واحد
يشغّل قاعدة البيانات والـ Backend معًا، مع HTTPS تلقائي ونسخ احتياطي مجدول.

> هذا الملف سجلّ لما تمّ فعليًّا ومرجع لإعادة الإعداد أو استكشاف الأعطال. لا تضع فيه أي كلمات
> سرّ أو مفاتيح — استبدل القيم الحسّاسة بعناصر نائبة مثل `<PASSWORD>`.

---

## لماذا النقل؟

- **المساحة**: خطة Atlas المجانية محدودة بـ **512MB**؛ الـ ARM VM المجاني يوفّر مساحة أكبر بكثير.
- **الأداء اللحظي**: تشغيل الـ Backend والقاعدة على **نفس الجهاز** يجعل الاتصال عبر `localhost`
  بدل المرور عبر الشبكة بين مزوّدين مختلفين.
- **بدون خمول**: Render المجاني يوقف الخدمة بعد ~15 دقيقة خمول (cold start)؛ الـ VM دائم التشغيل.

**القرار**: نقل القاعدة + الـ Backend فقط. أما الواجهات (لوحة الأدمن على Vercel، تطبيق الويب على
Cloudflare) فتبقى على الـ CDN — هو المكان الأنسب لها، ولم تكن جزءًا من مشكلة المساحة.

---

## المعمارية بعد النقل

```
تطبيق الويب (Flutter)      لوحة الأدمن (React)        تطبيق الموبايل
Cloudflare Worker          Vercel                     APK/AAB
        │                        │                          │
        └────────────┬──────────┴──────────────────────────┘
                     │  HTTPS
             https://yalla-api.duckdns.org   ← DuckDNS + شهادة Let's Encrypt (Caddy)
                     │
        ┌────────────▼─────────────── Oracle ARM VM (Ubuntu 22.04) ───────────┐
        │  Caddy (80/443)  ──reverse_proxy──▶  yalla-api (Node, :4000)         │
        │                                              │                        │
        │                                     MongoDB (127.0.0.1:27017)         │
        │                                     مقفولة على localhost فقط          │
        └──────────────────────────────────────────────────────────────────────┘
```

- **السيرفر**: `VM.Standard.A1.Flex` — 2 OCPU / 12GB RAM (ضمن الـ Always Free).
- **كل المكوّنات تعمل بـ Docker** (نفس صور المشروع).
- **القاعدة غير مكشوفة للإنترنت** — مربوطة على `127.0.0.1` فقط؛ المفتوح خارجيًّا هو 80/443 فقط.

---

## الخطوات المُنفَّذة

### 1) إنشاء الـ VM
- Image: Canonical Ubuntu 22.04 · Shape: `VM.Standard.A1.Flex` (2 OCPU / 12GB).
- تفعيل **Public IPv4** + توليد مفتاح SSH وتنزيل المفتاح الخاص.

### 2) الاتصال + الجدار الناري
```bash
ssh -i <private-key>.key ubuntu@<SERVER_IP>
```
لاحقًا فُتح المنفذان 80/443 في طبقتين:
- **Oracle Security List** (Ingress: TCP 80 و 443 من `0.0.0.0/0`).
- **iptables** داخل السيرفر:
  ```bash
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```

### 3) تنصيب Docker
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # ثم إعادة تسجيل الدخول
```

### 4) تشغيل MongoDB بأمان
```bash
docker run -d --name yalla-mongo --restart unless-stopped \
  -p 127.0.0.1:27017:27017 \
  -v yalla_mongo_data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=yalla_admin \
  -e MONGO_INITDB_ROOT_PASSWORD='<PASSWORD>' \
  mongodb/mongodb-community-server:7.0-ubuntu2204
```
> `-p 127.0.0.1:27017` هو أهم سطر أمان: القاعدة تُسمَع محليًّا فقط.

### 5) نقل البيانات من Atlas
```bash
# سحب من Atlas (نُضيف IP السيرفر في Atlas → Network Access أولًا)
mkdir -p ~/backup && chmod 777 ~/backup
docker run --rm -v ~/backup:/backup mongo:7 \
  mongodump --uri='<ATLAS_CONNECTION_STRING>' --out=/backup

# استعادة على السيرفر (نستخدم flags بدل URI لتجنّب ترميز الرموز في كلمة السر)
docker run --rm --network host -v ~/backup:/backup mongo:7 \
  mongorestore --host=127.0.0.1:27017 --username=yalla_admin \
  --password='<PASSWORD>' --authenticationDatabase=admin /backup
```
نُقل **564 مستندًا** عبر كل الـ collections، وأُعيد بناء فهارس `2dsphere` تلقائيًّا.

### 6) تشغيل الـ Backend على نفس السيرفر
ملف بيئة `~/yalla.env` (بدون أسرار هنا):
```
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb://yalla_admin:<ENCODED_PASSWORD>@127.0.0.1:27017/yalla?authSource=admin
JWT_SECRET=<نفس قيمة Render — حتى لا تنتهي جلسات المستخدمين>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://yalla-five-wheat.vercel.app,https://yalla.mohammedelrefy28.workers.dev
AUTO_ASSIGN=false
COMMISSION_RATE=0.2
ACCEPT_TIMEOUT_SECONDS=60
FCM_CREDENTIALS_PATH=/app/fcm.json
```
> **ترميز كلمة السر في `MONGO_URI`**: بدّل `/`→`%2F` و`+`→`%2B` و`=`→`%3D`.

```bash
cd ~/Yalla/backend && docker build -t yalla-api .
docker run -d --name yalla-api --restart unless-stopped \
  --network host --env-file ~/yalla.env \
  -v ~/fcm.json:/app/fcm.json:ro \
  yalla-api
# فحص:  curl http://localhost:4000/api/health  →  {"status":"ok","service":"yalla-api"}
```

### 7) HTTPS تلقائي (DuckDNS + Caddy)
- ساب-دومين مجاني على [duckdns.org](https://www.duckdns.org): `yalla-api.duckdns.org` → يشير لـ `<SERVER_IP>`.
- `~/caddy/Caddyfile`:
  ```
  yalla-api.duckdns.org {
      reverse_proxy localhost:4000
  }
  ```
- التشغيل:
  ```bash
  docker run -d --name caddy --restart unless-stopped \
    --network host \
    -v ~/caddy/Caddyfile:/etc/caddy/Caddyfile \
    -v caddy_data:/data \
    caddy:2
  # Caddy يجلب شهادة Let's Encrypt تلقائيًّا
  # فحص:  curl https://yalla-api.duckdns.org/api/health
  ```

### 8) الإشعارات (FCM)
- مفتاح Service Account من Firebase → `~/fcm.json` (`chmod 600`).
- يُمرَّر للحاوية عبر `-v ~/fcm.json:/app/fcm.json:ro` مع `FCM_CREDENTIALS_PATH=/app/fcm.json`.
- عند النجاح: `✅ FCM مُهيّأ — الإشعارات مفعّلة`.

### 9) نسخ احتياطي يومي
`~/backup-mongo.sh`:
```bash
#!/bin/bash
STAMP=$(date +%F-%H%M)
mkdir -p ~/backups
chmod 777 ~/backups
docker run --rm --network host -v ~/backups:/b mongo:7 \
  mongodump --host=127.0.0.1:27017 --username=yalla_admin \
  --password='<PASSWORD>' --authenticationDatabase=admin \
  --archive=/b/yalla-$STAMP.gz --gzip
find ~/backups -name '*.gz' -mtime +14 -delete   # الاحتفاظ بـ 14 يومًا
echo "Backup done: yalla-$STAMP.gz"
```
الجدولة عبر `crontab -e`:
```
0 3 * * * /home/ubuntu/backup-mongo.sh >> /home/ubuntu/backups/cron.log 2>&1
```

---

## تغييرات المستودع (المصاحبة للنقل)

حُدِّث العنوان الافتراضي للـ Backend من Render إلى Oracle في:
- `.github/workflows/web-app.yml` و `.github/workflows/mobile-apk.yml` (قيمة `API_ORIGIN`).
- `tool/build-web.sh` (القيمة الاحتياطية).
- `admin/netlify.toml` و `mobile/lib/core/config/app_config.dart` و `docs/04`, `docs/11` (أمثلة/توثيق).

خارج المستودع (لوحات التحكم):
- **Vercel** (لوحة الأدمن): `VITE_API_URL = https://yalla-api.duckdns.org` ثم Redeploy.
- **Cloudflare** (تطبيق الويب): يُعاد البناء عبر workflow «Build & Deploy Web App» فيُحقَن العنوان الجديد.

---

## أوامر التشغيل والصيانة

```bash
docker ps                     # حالة الحاويات (yalla-mongo · yalla-api · caddy)
docker logs -f yalla-api      # سجلّ الـ Backend
docker logs caddy             # حالة الشهادة
~/backup-mongo.sh             # نسخة احتياطية يدويّة
```

**تحديث الـ Backend بعد سحب كود جديد:**
```bash
cd ~/Yalla && git checkout main && git pull origin main
docker tag yalla-api yalla-api:backup            # نسخة للتراجع عند الحاجة
docker build -t yalla-api ./backend
docker stop yalla-api && docker rm yalla-api
docker run -d --name yalla-api --restart unless-stopped \
  --network host --env-file ~/yalla.env \
  -v ~/fcm.json:/app/fcm.json:ro \
  -v yalla_uploads:/app/uploads \
  yalla-api
# فحص:  docker logs --tail 30 yalla-api ; curl -s http://localhost:4000/api/health
# تراجع عند فشل:  docker rm -f yalla-api ; docker run ... yalla-api:backup (بنفس الأعلام)
```
> **مهم (Card 102):** الحاوية تربط الآن **`-v yalla_uploads:/app/uploads`** — تخزين دائم
> للإيصالات ومستندات توثيق الكباتن حتى لا تُمحى عند إعادة إنشاء الحاوية. أمّا الصورة
> الشخصية فتُخزَّن في قاعدة البيانات مباشرة (`FileAsset`)، فتبقى دائمًا.
>
> **تطبيق أندرويد للأدمن (Card 103):** أضِف `https://localhost` إلى `CORS_ORIGIN` في
> `~/yalla.env` حتى يصل تطبيق أندرويد (أصل Capacitor) إلى الـ API.

---

## تحديثات لاحقة على السيرفر (Card 102/103)

بعد النقل، نُشِرت هذه التغييرات على نفس السيرفر (إعادة بناء `yalla-api` بالأمر أعلاه):

- **تخزين دائم للمرفوعات:** أُضيف `-v yalla_uploads:/app/uploads` لحاوية الـ API.
- **الصورة الشخصية في قاعدة البيانات (#102):** موديل `FileAsset` + مسار `/files/<id>`
  بدل تخزينها على قرص الحاوية المؤقّت — فلا تختفي بعد إعادة التشغيل.
- **إشعارات الأدمن (#103):** الخادم يرسل Push لأجهزة المشرفين عند طلب جديد/سحب رصيد
  (`notifyAdmins`). و`CORS_ORIGIN` يشمل `https://localhost` لتطبيق أندرويد.
- **إزالة Render/Atlas من المستودع:** حُذف `render.yaml` وحُدِّثت الوثائق.

## مهامّ متابعة (اختيارية)

- [x] **إيقاف Render + Atlas** — تمّ؛ المنظومة كاملةً على Oracle الآن.
- [ ] **نسخ احتياطي خارج السيرفر** — نقل `~/backups` دوريًّا إلى تخزين خارجي (Object Storage / Drive).
- [ ] **مراقبة DuckDNS** — تأكيد بقاء الـ IP محدَّثًا (ثابت غالبًا).

---

## استكشاف الأعطال

| العَرَض | السبب المرجّح | الحل |
|--------|----------------|------|
| `permission denied` عند mongodump/restore محليًّا | مجلّد الإخراج غير قابل للكتابة من الحاوية | `chmod 777 ~/backup` (أو `~/backups`) |
| `unescaped slash in password` | رمز خاص في كلمة السر داخل الـ URI | استخدم flags منفصلة، أو رمِّز `/`→`%2F` |
| `FCM غير مُهيّأ` | مسار/محتوى مفتاح الخدمة غير صحيح | تحقّق من `~/fcm.json` و `FCM_CREDENTIALS_PATH` |
| المتصفّح لا يصل للـ API | HTTPS/CORS | تأكّد من شهادة Caddy ووجود نطاق الواجهة في `CORS_ORIGIN` |
| تعذّر SSH: `UNPROTECTED PRIVATE KEY` | صلاحيات المفتاح مفتوحة (ويندوز) | `icacls` لإزالة صلاحيات المستخدمين الآخرين |
