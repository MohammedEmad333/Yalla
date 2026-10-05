# 12 — Oracle Cloud: سجل الهجرة وتشغيل الإنتاج

آخر مراجعة: 2026-10-05

بدأ هذا الملف كسجل لهجرة Yalla من Render + MongoDB Atlas إلى Oracle Cloud. الهجرة **مكتملة**؛ الجزء المهم الآن هو تشغيل وصيانة الإنتاج الحالي، وليس إعادة تنفيذ خطوات النقل القديمة.

## المعمارية الحالية

```text
Cloudflare Workers Static Assets
  ├─ yalladelivery.org
  ├─ app.yalladelivery.org
  ├─ admin.yalladelivery.org
  └─ partner.yalladelivery.org
                │
                │ HTTPS
                ▼
       api.yalladelivery.org
          Cloudflare + Caddy
                │
                ▼
        yalla-api (Oracle)
          ├─ MongoDB
          ├─ private uploads
          └─ /app/media
```

- API الرسمي: `https://api.yalladelivery.org`.
- Health: `https://api.yalladelivery.org/api/health`.
- MongoDB غير مخصص للوصول العام من الإنترنت.
- Caddy يقدّم HTTPS/reverse proxy أمام الـAPI.
- ملفات الوسائط العامة على host: `/home/ubuntu/yalla-media`، داخل الحاوية: `/app/media`.
- `yalla-api.duckdns.org` توافق قديم فقط.

## الوصول إلى المستودع الخاص

المستودع أصبح private. على خادم Oracle استخدم deploy key/SSH مخصصًا. مثال alias مستخدم للخادم:

```sshconfig
Host github-yalla
  HostName github.com
  User git
  IdentityFile ~/.ssh/yalla_deploy
  IdentitiesOnly yes
```

تحقق قبل النشر:

```bash
ssh -T git@github-yalla
cd ~/Yalla
git fetch origin
git status
```

لا تضع private key أو tokens داخل المستودع.

## تحديث Backend

المسار الموصى به:

```bash
cd ~/Yalla
git fetch origin
git pull --ff-only origin main
bash tool/deploy-server.sh
```

`tool/deploy-server.sh` هو المصدر التشغيلي للحقيقة. وظيفته تشمل بناء صورة الـBackend، استبدال الحاوية مع mounts المطلوبة، فحص الصحة، والتحقق من النسخة المنشورة والتراجع عند الفشل.

لا تشغّل `docker compose up` على خادم الإنتاج كبديل سريع إلا إذا تم تغيير بنية الإنتاج رسميًا؛ Compose يبقى أساسًا للتطوير المحلي.

## فحص بعد النشر

```bash
curl -fsS https://api.yalladelivery.org/api/health
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 100 yalla-api
```

الاستجابة الصحية المتوقعة:

```json
{"status":"ok","service":"yalla-api"}
```

لفحص mount الوسائط:

```bash
docker inspect yalla-api --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' | grep /app/media
docker exec yalla-api sh -lc 'echo "$MEDIA_ROOT"; ls -lah /app/media'
```

## MongoDB

قواعد التشغيل:

- تخزين دائم للبيانات.
- لا تعرّض `27017` للعامة.
- بيانات الاتصال وكلمات المرور في environment خارج Git.
- خذ نسخة MongoDB دورية واختبر الاستعادة دوريًا.

لا تعتمد على أرقام قديمة لعدد المستندات أو حجم القاعدة كمؤشر صحة؛ استخدم القياسات الحالية وقت الفحص.

## الوسائط والنسخ الاحتياطي

MongoDB لم تعد نسخة كاملة من الصور العامة. يجب نسخ مجلد الوسائط أيضًا:

```bash
bash ~/Yalla/tool/backup-media.sh
```

راجع [`15-oracle-media-storage.md`](15-oracle-media-storage.md) للهجرة، التوافق مع `/files/<id>` والنسخ الاحتياطي.

## Caddy وCloudflare

الدومين الأساسي للـAPI هو `api.yalladelivery.org`. يجب أن يظل إعداد Caddy وDNS/Cloudflare متوافقًا معه. عند تعديل Caddy:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

ثم اختبر الـAPI خارجيًا، وليس من localhost فقط.

## FCM وملفات الاعتماد

اعتماد Firebase وأي secrets أخرى تبقى على الخادم أو في GitHub Secrets حسب الاستخدام، ولا تُرفع إلى المستودع. عند تغيير مسار ملف اعتماد FCM، طابق القيمة مع الـmount ومتغير البيئة المستخدمين فعليًا في سكربت النشر.

## ما تم إيقافه/تجاوزه

العناصر التالية تاريخية وليست مسار الإنتاج الافتراضي:

- Render للـBackend.
- MongoDB Atlas كقاعدة الإنتاج الأساسية.
- Vercel/Netlify لواجهات الإنتاج الحالية.
- DuckDNS كعنوان API أساسي.
- تخزين الصور العامة الجديدة كـbinary داخل MongoDB.

## استكشاف أعطال سريع

```bash
# API
curl -i https://api.yalladelivery.org/api/health

# containers
docker ps -a

# backend logs
docker logs --tail 200 yalla-api

# caddy logs
docker logs --tail 200 caddy

# disk
df -h
du -sh ~/yalla-media
```

إذا فشل نشر جديد، لا تحذف volumes أو مجلد الوسائط أثناء الاستكشاف. ابدأ من logs وhealth ثم استخدم آلية rollback في سكربت النشر.

## مراجع

- [`03-deployment.md`](03-deployment.md)
- [`11-cloudflare-pages.md`](11-cloudflare-pages.md)
- [`14-cloudflare-security.md`](14-cloudflare-security.md)
- [`15-oracle-media-storage.md`](15-oracle-media-storage.md)
