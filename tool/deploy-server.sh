#!/usr/bin/env bash
# نشر الباك اند على سيرفر Oracle Cloud بأمر واحد (يُشغَّل **على السيرفر**).
#
# الأمر الموصى به من جذر المستودع:
#   cd ~/Yalla && bash deploy.sh
#
# ماذا يفعل: يسحب آخر كود، يضمن تشغيل Redis محلي غير مكشوف، يبني صورة yalla-api،
# يستبدل الحاوية، ثم يفحص /api/health. وإن فشل الفحص يتراجع للصورة السابقة.
set -euo pipefail

BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-$HOME/yalla.env}"
FCM_FILE="${FCM_FILE:-$HOME/fcm.json}"
MEDIA_HOST_DIR="${MEDIA_HOST_DIR:-$HOME/yalla-media}"
IMAGE="yalla-api"
CONTAINER="yalla-api"
REDIS_CONTAINER="yalla-redis"
HEALTH_URL="http://localhost:4000/api/health"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '\n▶ %s\n' "$1"; }
fail() { printf '\n✖ %s\n' "$1" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "ملفّ البيئة غير موجود: $ENV_FILE"

if command -v pm2 >/dev/null 2>&1 && pm2 describe "$CONTAINER" >/dev/null 2>&1; then
  say "إزالة تشغيل PM2 القديم لـ $CONTAINER"
  pm2 delete "$CONTAINER" >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
fi

mkdir -p "$MEDIA_HOST_DIR"
[ -d "$MEDIA_HOST_DIR" ] || fail "تعذّر إنشاء مجلّد الصور: $MEDIA_HOST_DIR"

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

JWT_VALUE="$(env_value JWT_SECRET)"
[ -n "$JWT_VALUE" ] || fail "JWT_SECRET غير مضبوط في $ENV_FILE"
[ "$JWT_VALUE" != "change_me_super_secret" ] || fail "JWT_SECRET ما زال على القيمة الافتراضية غير الآمنة"
[ "${#JWT_VALUE}" -ge 32 ] || fail "JWT_SECRET يجب أن يكون 32 محرفًا على الأقل"

CORS_VALUE="$(env_value CORS_ORIGIN)"
[ -n "$CORS_VALUE" ] || fail "CORS_ORIGIN غير مضبوط في $ENV_FILE"
[ "$CORS_VALUE" != "*" ] || fail "CORS_ORIGIN=* غير مسموح في الإنتاج؛ حدّد نطاقات Yalla الموثوقة"

BIND_VALUE="$(env_value API_BIND_HOST)"
[ "$BIND_VALUE" = "127.0.0.1" ] || fail "API_BIND_HOST يجب أن يكون 127.0.0.1 في Oracle production حتى لا ينكشف المنفذ 4000 مباشرة"

REDIS_VALUE="$(env_value REDIS_URL)"
[ -n "$REDIS_VALUE" ] || fail "REDIS_URL غير مضبوط في $ENV_FILE"
case "$REDIS_VALUE" in
  redis://127.0.0.1:6379|redis://127.0.0.1:6379/|redis://127.0.0.1:6379/0|redis://localhost:6379|redis://localhost:6379/|redis://localhost:6379/0) ;;
  *) fail "في Oracle production اضبط REDIS_URL=redis://127.0.0.1:6379/0 حتى يبقى Redis محليًا وغير مكشوف" ;;
esac

say "ضمان تشغيل Redis محلي"
if ! docker inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$REDIS_CONTAINER" --restart unless-stopped \
    -p 127.0.0.1:6379:6379 \
    redis:7.4-alpine redis-server --appendonly no --save '' >/dev/null
elif [ "$(docker inspect -f '{{.State.Running}}' "$REDIS_CONTAINER")" != "true" ]; then
  docker start "$REDIS_CONTAINER" >/dev/null
fi

REDIS_OK=""
for i in $(seq 1 15); do
  if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q '^PONG$'; then REDIS_OK=1; break; fi
  sleep 1
done
[ -n "$REDIS_OK" ] || fail "Redis لم يصبح جاهزًا"
PUBLISHED_REDIS="$(docker port "$REDIS_CONTAINER" 6379/tcp 2>/dev/null || true)"
case "$PUBLISHED_REDIS" in
  127.0.0.1:6379) ;;
  *) fail "Redis يجب أن يكون مربوطًا فقط على 127.0.0.1:6379؛ الحالي: ${PUBLISHED_REDIS:-غير معروف}" ;;
esac
echo "  ✓ Redis جاهز ومتاح محليًا فقط"

say "سحب آخر كود من الفرع $BRANCH"
cd "$ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
GIT_SHA="$(git rev-parse HEAD)"
echo "  آخر كوميت: $(git log --oneline -1)"
echo "  SHA الكامل: $GIT_SHA"

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

run_container() {
  local tag="$1"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    --network host --env-file "$ENV_FILE" \
    -e MEDIA_ROOT=/app/media \
    ${FCM_MOUNT:-} \
    -v yalla_uploads:/app/uploads \
    -v "$MEDIA_HOST_DIR:/app/media" \
    "$tag" >/dev/null
}

# APP_GIT_SHA is baked into each image at build time. Do not override it
# when restoring :previous, otherwise rollback reports the failed new SHA.

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

docker exec "$CONTAINER" sh -lc "grep -q \"banners/:bannerId/image\" /app/src/routes/admin.routes.js" \
  || fail "الحاوية تعمل بكود قديم: مسار رفع صور البانرات غير موجود داخلها"

CONTAINER_GIT_SHA="$(docker exec "$CONTAINER" sh -lc 'printf %s "${APP_GIT_SHA:-}"')"
[ "$CONTAINER_GIT_SHA" = "$GIT_SHA" ] \
  || fail "SHA الداخلي للحاوية لا يطابق المتوقع: expected=$GIT_SHA actual=${CONTAINER_GIT_SHA:-missing}"

echo "  ✓ تم التحقق من نسخة الكود ومسار رفع صور البانرات"

if [ "${SEED_RESTAURANTS:-0}" = "1" ]; then
  say "تعبئة مطاعم تجريبية"
  docker exec "$CONTAINER" npm run seed:restaurants || echo "  ⚠️ تعذّرت التعبئة (تجاهلها إن كانت المطاعم موجودة)"
fi

say "تمّ النشر بنجاح"
echo "  الحاويات:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep -E 'yalla|caddy' || true
echo
echo "  فحص خارجي:  curl -s https://api.yalladelivery.org/api/health"
echo "  المطاعم:     curl -s https://api.yalladelivery.org/api/restaurants"
echo "  Redis:       127.0.0.1:6379 (localhost only)"
echo "  الصور:        $MEDIA_HOST_DIR -> /app/media"
