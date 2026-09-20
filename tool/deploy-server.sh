#!/usr/bin/env bash
# نشر الباك اند على سيرفر Oracle Cloud بأمر واحد (يُشغَّل **على السيرفر**).
#
#   ssh ubuntu@<SERVER_IP>
#   cd ~/Yalla && git pull origin main && bash tool/deploy-server.sh
#
# ماذا يفعل: يسحب آخر كود، يبني صورة yalla-api جديدة، يستبدل الحاوية، ثمّ
# يفحص /api/health — وإن فشل الفحص يتراجع تلقائيًّا إلى الصورة السابقة.
# لا يلمس قاعدة البيانات ولا حاوية mongo ولا caddy.
#
# متغيّرات اختيارية:
#   BRANCH=main            الفرع الذي يُسحب
#   ENV_FILE=~/yalla.env   ملفّ متغيّرات البيئة
#   FCM_FILE=~/fcm.json    ملفّ اعتماد FCM (يُربَط للقراءة فقط إن وُجد)
#   SEED_RESTAURANTS=1     تعبئة مطاعم تجريبية بعد النشر (آمن للتكرار)
set -euo pipefail

BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-$HOME/yalla.env}"
FCM_FILE="${FCM_FILE:-$HOME/fcm.json}"
IMAGE="yalla-api"
CONTAINER="yalla-api"
HEALTH_URL="http://localhost:4000/api/health"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '\n▶ %s\n' "$1"; }
fail() { printf '\n✖ %s\n' "$1" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "ملفّ البيئة غير موجود: $ENV_FILE"

say "سحب آخر كود من الفرع $BRANCH"
cd "$ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
GIT_SHA="$(git rev-parse HEAD)"
echo "  آخر كوميت: $(git log --oneline -1)"
echo "  SHA الكامل: $GIT_SHA"

# تأكد أن نسخة المصدر التي سنبنيها تحتوي إصلاح رفع صور البانرات.
grep -q "banners/:bannerId/image" "$ROOT/backend/src/routes/admin.routes.js" \
  || fail "نسخة المصدر الحالية لا تحتوي مسار رفع صور البانرات الجديد"

say "حفظ نسخة للتراجع من الصورة الحاليّة"
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$IMAGE:latest" "$IMAGE:previous"
  echo "  تم وسم الصورة الحاليّة بـ $IMAGE:previous"
else
  echo "  لا توجد صورة سابقة (أوّل نشر)"
fi

say "بناء صورة الباك اند"
docker build --build-arg GIT_SHA="$GIT_SHA" -t "$IMAGE" "$ROOT/backend"

# تشغيل الحاوية بنفس أعلام الإنتاج (راجع docs/12-oracle-cloud-migration.md)
run_container() {
  local tag="$1"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    --network host --env-file "$ENV_FILE" \
    ${FCM_MOUNT:-} \
    -v yalla_uploads:/app/uploads \
    "$tag" >/dev/null
}

FCM_MOUNT=""
[ -f "$FCM_FILE" ] && FCM_MOUNT="-v $FCM_FILE:/app/fcm.json:ro"

say "استبدال الحاوية"
run_container "$IMAGE"

say "فحص الصحّة"
ok=""
for i in $(seq 1 20); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done

if [ -z "$ok" ]; then
  printf '\n✖ فشل فحص الصحّة — آخر سطور السجلّ:\n'
  docker logs --tail 40 "$CONTAINER" || true
  if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    say "التراجع إلى الصورة السابقة"
    run_container "$IMAGE:previous"
    curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1 \
      && echo "  ✓ عاد الخادم للنسخة السابقة" \
      || echo "  ✖ النسخة السابقة أيضًا لا تستجيب — راجع docker logs $CONTAINER"
  fi
  fail "النشر فشل (تمّ التراجع إن أمكن)"
fi

HEALTH_JSON="$(curl -fsS --max-time 5 "$HEALTH_URL")"
echo "  ✓ $HEALTH_JSON"

# لا نكتفي بصحة HTTP: نتحقق أن الحاوية نفسها تحتوي ملف الراوتر الجديد،
# وأن /health يعلن نفس SHA الذي سحبناه قبل البناء.
docker exec "$CONTAINER" sh -lc "grep -q \"banners/:bannerId/image\" /app/src/routes/admin.routes.js" \
  || fail "الحاوية تعمل بكود قديم: مسار رفع صور البانرات غير موجود داخلها"

printf '%s' "$HEALTH_JSON" | grep -q "$GIT_SHA" \
  || fail "الحاوية لا تعلن SHA المتوقع $GIT_SHA — يبدو أن نسخة قديمة ما زالت تعمل"

echo "  ✓ تم التحقق من نسخة الكود ومسار رفع صور البانرات"

# تعبئة مطاعم تجريبية عند الطلب (SEED_RESTAURANTS=1)
if [ "${SEED_RESTAURANTS:-0}" = "1" ]; then
  say "تعبئة مطاعم تجريبية"
  docker exec "$CONTAINER" npm run seed:restaurants || echo "  ⚠️ تعذّرت التعبئة (تجاهلها إن كانت المطاعم موجودة)"
fi

say "تمّ النشر بنجاح"
echo "  الحاويات:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -E 'yalla|caddy' || true
echo
echo "  فحص خارجي:  curl -s https://yalla-api.duckdns.org/api/health"
echo "  المطاعم:     curl -s https://yalla-api.duckdns.org/api/restaurants"
