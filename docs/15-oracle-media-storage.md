# 15 — تخزين صور Yalla على قرص Oracle

## الهدف

الصور العامة الجديدة لا تُخزَّن كـ binary داخل MongoDB. تُحفظ على قرص Oracle الدائم، بينما تحتفظ قاعدة البيانات فقط بروابط الصور داخل سجلات المتجر/الصنف/المستخدم/البانر.

المسار الافتراضي على الخادم:

```text
/home/ubuntu/yalla-media
```

ويربطه `tool/deploy-server.sh` داخل الحاوية إلى:

```text
/app/media
```

الصور الجديدة تُعاد بروابط فريدة من الشكل:

```text
/media/restaurant/<uuid>.jpg
/media/menu-item/<uuid>.webp
/media/promotion-banner/<uuid>.png
/media/avatar/<uuid>.jpg
```

ويخدمها Express كملفات static مع:

```text
Cache-Control: public, max-age=31536000, immutable
CDN-Cache-Control: public, max-age=31536000, immutable
```

لذلك يستطيع Cloudflare تخزينها على الـ edge بعد أول طلب.

## توافق الصور القديمة

روابط `/files/<ObjectId>` القديمة لا تتغيّر ولا تنكسر. في البداية تُقرأ من `FileAsset.data` في MongoDB. بعد تشغيل migration تُنسخ الصورة إلى `/app/media/legacy` ويُزال الـ binary من MongoDB، بينما يبقى سجل metadata الصغير فقط حتى يستمر الرابط القديم.

## النشر

بعد دمج التغيير:

```bash
cd ~/Yalla
git pull origin main
bash tool/deploy-server.sh
```

السكربت ينشئ `~/yalla-media` تلقائيًا ويربطه بالحاوية في كل نشر وتراجع.

تحقق:

```bash
docker inspect yalla-api --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' | grep /app/media
ls -lah ~/yalla-media
docker exec yalla-api sh -lc 'echo "$MEDIA_ROOT"; ls -lah /app/media'
```

## هجرة FileAsset القديمة تدريجيًا

ابدأ بفحص فقط:

```bash
docker exec yalla-api npm run migrate:media -- --dry-run
```

ثم انقل دفعة صغيرة:

```bash
docker exec yalla-api npm run migrate:media -- --limit=25
```

بعد التأكد أن الصور القديمة ما زالت تفتح، انقل دفعات أكبر:

```bash
docker exec yalla-api npm run migrate:media -- --limit=100
```

كرّر حتى يظهر:

```text
"migrated": 0
```

العملية آمنة لإعادة التشغيل: اسم ملف الصورة القديمة مشتق من ObjectId نفسه، ولا يُزال `data` من MongoDB إلا بعد كتابة الملف والتحقق من حجمه.

لنسخ الملفات إلى القرص من دون إزالة binary مؤقتًا:

```bash
docker exec yalla-api npm run migrate:media -- --limit=25 --keep-data
```

## النسخ الاحتياطي

بعد هذا التغيير، نسخة MongoDB وحدها لا تحتوي الصور الجديدة. خذ نسخة من مجلد الصور أيضًا:

```bash
bash ~/Yalla/tool/backup-media.sh
```

يمكن جدولة نسخة يومية:

```cron
30 3 * * * /bin/bash /home/ubuntu/Yalla/tool/backup-media.sh >> /home/ubuntu/backups/media-cron.log 2>&1
```

النسخة المحلية مفيدة ضد الحذف العرضي، لكنها ليست بديلًا عن نسخة خارج السيرفر. يفضّل لاحقًا مزامنة النسخ إلى R2 أو Object Storage آخر.

## الملفات الحساسة

مستندات توثيق الكباتن وصور الهوية لا تنتقل إلى المسار العام `/media`. تبقى ضمن مسار المرفوعات الخاص الحالي ولا يجب تعريضها كصور عامة.
