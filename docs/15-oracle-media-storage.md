# 15 — تخزين صور Yalla على قرص Oracle

آخر مراجعة: 2026-10-05

## الحالة الحالية

الصور العامة الجديدة لا تُخزَّن كـbinary داخل MongoDB. تُحفظ على قرص Oracle الدائم، بينما تحتفظ قاعدة البيانات بالروابط والـmetadata اللازمة.

مسار المضيف:

```text
/home/ubuntu/yalla-media
```

المسار داخل `yalla-api`:

```text
/app/media
```

متغير البيئة المستخدم داخل الحاوية:

```text
MEDIA_ROOT=/app/media
```

## أنواع الوسائط العامة

أمثلة للمسارات:

```text
/media/restaurant/<uuid>.<ext>
/media/menu-item/<uuid>.<ext>
/media/promotion-banner/<uuid>.<ext>
/media/avatar/<uuid>.<ext>
```

الاسم الفعلي والامتداد يحددهما كود الرفع الحالي؛ لا تبنِ منطق العميل على افتراض امتداد ثابت.

## توافق `/files/<id>` القديم

الهجرة من `FileAsset` binary إلى القرص نُفذت، وآخر فحص تشغيلي أظهر:

```text
Legacy FileAsset remaining: 0
```

الملفات القديمة المنقولة موجودة تحت مساحة `legacy` على القرص، مع إبقاء مسار `/files/<id>` متوافقًا حتى لا تنكسر روابط الإصدارات القديمة.

لا تعِد ملء MongoDB بالـbinary بعد اكتمال الهجرة.

## التحقق بعد النشر

```bash
docker inspect yalla-api --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' | grep /app/media
ls -lah ~/yalla-media
docker exec yalla-api sh -lc 'echo "$MEDIA_ROOT"; ls -lah /app/media'
```

فحص الهجرة الآمن:

```bash
docker exec yalla-api npm run migrate:media -- --dry-run
```

في الحالة الحالية يجب ألا توجد أصول binary قديمة متبقية للنقل. إذا ظهر عدد غير صفري مستقبلًا، افهم سبب عودة بيانات legacy قبل تنفيذ migration كتابةً.

## اختبار روابط legacy

يمكن أخذ عينات من الملفات المحلية وفحص أن endpoint القديم ما زال يعمل:

```bash
for f in $(find ~/yalla-media/legacy -type f | tail -3); do
  id=$(basename "$f" | cut -d. -f1)
  curl -fsS -o /dev/null \
    -w "$id -> HTTP %{http_code} | %{content_type} | %{size_download} bytes\n" \
    "https://api.yalladelivery.org/files/$id"
done
```

## النسخ الاحتياطي

نسخة MongoDB وحدها **لا تكفي** لاستعادة الصور العامة. خذ نسخة من الوسائط أيضًا:

```bash
bash ~/Yalla/tool/backup-media.sh
```

تحقق دوريًا من:

```bash
du -sh ~/yalla-media
find ~/yalla-media -type f | wc -l
```

النسخة الموجودة على نفس الخادم تحمي من بعض الأخطاء التشغيلية لكنها لا تعوض نسخة خارجية. يفضّل مزامنة نسخة دورية إلى Object Storage منفصل عندما يكون ذلك مهيأً.

## الملفات الحساسة

صور الهوية ووثائق التحقق والمرفوعات الخاصة **ليست** وسائط عامة ولا يجب نقلها إلى `/media` أو تقديمها عبر static middleware عام. حافظ على مسارها الخاص وضوابط التفويض الحالية.

## قواعد النشر

- `tool/deploy-server.sh` يجب أن يحافظ على mount `/home/ubuntu/yalla-media:/app/media` في النشر وفي rollback.
- لا تحذف `/home/ubuntu/yalla-media` أثناء تنظيف Docker.
- لا تستخدم `docker system prune --volumes` أو أوامر حذف واسعة على الإنتاج دون مراجعة ما ستزيله.
- بعد أي تعديل في upload/storage نفّذ health check واختبار رفع/قراءة لصورة غير حساسة.

## مراجع

- [`03-deployment.md`](03-deployment.md)
- [`12-oracle-cloud-migration.md`](12-oracle-cloud-migration.md)
