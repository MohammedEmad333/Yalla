#!/usr/bin/env bash
# بناء نسخة الويب من تطبيق يلا (Flutter) ونسخ الناتج إلى web-app/ للنشر على Cloudflare.
#
# الاستخدام:
#   tool/build-web.sh
#
# بعد التشغيل: git add web-app && git commit && git push  →  ينشر Cloudflare تلقائيًا.
set -euo pipefail

# عنوان الـ backend على Render (نفس ما يستخدمه الأدمن).
API_ORIGIN="${API_ORIGIN:-https://yalla-api.duckdns.org}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

echo "▶ بناء Flutter web بعنوان: $API_ORIGIN"
# --no-web-resources-cdn: خدمة canvaskit/محرّك الويب محليًّا بدل CDN خارجي (gstatic)
flutter build web --release --no-web-resources-cdn --dart-define=API_ORIGIN="$API_ORIGIN"

echo "▶ نسخ الناتج إلى web-app/"
rm -rf "$ROOT/web-app"
mkdir -p "$ROOT/web-app"
cp -a "$ROOT/mobile/build/web/." "$ROOT/web-app/"

# نسخ ملف ترويسات Cloudflare (البناء لا ينتجه)
cp "$ROOT/tool/web-app-headers" "$ROOT/web-app/_headers"

echo "✓ تم. راجع web-app/ ثم: git add web-app && git commit && git push"
