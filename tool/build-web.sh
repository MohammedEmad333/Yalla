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
flutter build web --release --no-web-resources-cdn --no-tree-shake-icons --pwa-strategy=none --dart-define=API_ORIGIN="$API_ORIGIN"

echo "▶ نسخ الناتج إلى web-app/"
rm -rf "$ROOT/web-app"
mkdir -p "$ROOT/web-app"
cp -a "$ROOT/mobile/build/web/." "$ROOT/web-app/"

# Kill-switch لمسجّل Flutter Service Worker القديم. بعض المتصفحات التي فتحت
# التطبيق قبل تعطيل PWA تبقى تحت سيطرته وتعرض main.dart.js قديمًا. إبقاء ملف
# بنفس المسار يجعل Chrome يحدّث التسجيل ثم يلغي نفسه ويمسح كاش Flutter.
cat > "$ROOT/web-app/flutter_service_worker.js" <<'EOF'
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
    try {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach(function (client) {
        client.postMessage({ type: 'YALLA_SW_REMOVED' });
      });
    } catch (_) {}
  }()));
});
EOF

# صفحة تنظيف يدوية وفورية للحالات التي يبقى فيها Service Worker القديم نشطًا.
# هذا المسار غير موجود في RESOURCES الخاصة بـ Flutter SW القديم، لذلك يمر للشبكة.
cat > "$ROOT/web-app/reset-cache.html" <<'EOF'
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store">
  <title>تحديث Yalla</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}
    .card{width:min(88vw,420px);padding:28px;border-radius:24px;background:#fff;box-shadow:0 10px 30px #00000014;text-align:center}
    .logo{font-size:34px;font-weight:900;color:#ff6b00;margin-bottom:10px}
    .spinner{width:34px;height:34px;margin:20px auto;border:4px solid #ffe0c7;border-top-color:#ff6b00;border-radius:50%;animation:s .8s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Yalla</div>
    <div>جاري تحديث التطبيق وتنظيف النسخة القديمة…</div>
    <div class="spinner"></div>
  </div>
  <script>
    (async function () {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function (reg) { return reg.unregister(); }));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }
        try {
          localStorage.removeItem('flutter_service_worker_version');
        } catch (_) {}
      } catch (_) {}
      window.setTimeout(function () {
        window.location.replace('/?cache-reset=' + Date.now());
      }, 500);
    }());
  </script>
</body>
</html>
EOF

# نسخ ملف ترويسات Cloudflare (البناء لا ينتجه)
cp "$ROOT/tool/web-app-headers" "$ROOT/web-app/_headers"

echo "✓ تم. راجع web-app/ ثم: git add web-app && git commit && git push"
