#!/usr/bin/env bash
# Install a remotely-managed Cloudflare Tunnel connector on the Yalla Oracle host.
#
# Usage on the server:
#   cd ~/Yalla
#   bash tool/setup-cloudflare-tunnel.sh
#
# The script deliberately does NOT change DNS, firewall rules, Caddy, or the API
# container. Create the tunnel + published hostname in Cloudflare first, then paste
# its tunnel token when prompted. Keeping cutover separate prevents accidental downtime.
set -euo pipefail

API_LOCAL_URL="${API_LOCAL_URL:-http://127.0.0.1:4000/api/health}"
PUBLIC_TEST_URL="${PUBLIC_TEST_URL:-}"

say() { printf '\n▶ %s\n' "$1"; }
fail() { printf '\n✖ %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl غير مثبت"
command -v sudo >/dev/null 2>&1 || fail "sudo غير متاح"

say "فحص الـ API محليًا قبل تركيب Tunnel"
curl -fsS --max-time 5 "$API_LOCAL_URL" >/dev/null   || fail "الـ API لا يستجيب على $API_LOCAL_URL — أصلح الخدمة قبل تركيب Tunnel"
echo "  ✓ $API_LOCAL_URL"

if ! command -v cloudflared >/dev/null 2>&1; then
  say "تثبيت cloudflared من مستودع Cloudflare الرسمي"
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg     | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main"     | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
else
  say "cloudflared مثبت مسبقًا"
  cloudflared --version
fi

# Never silently replace another connector. That could disconnect an existing tunnel.
if systemctl cat cloudflared.service >/dev/null 2>&1; then
  say "تم العثور على خدمة cloudflared موجودة"
  sudo systemctl --no-pager --full status cloudflared.service || true
  echo
  echo "لن يتم استبدال خدمة موجودة تلقائيًا."
  echo "إذا كانت هذه خدمة Yalla المطلوبة، اتركها كما هي وافحص الـ route من Cloudflare."
  exit 0
fi

TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  printf '\nألصق Tunnel token (لن يظهر على الشاشة): '
  IFS= read -r -s TOKEN
  printf '\n'
fi
[ -n "$TOKEN" ] || fail "Tunnel token فارغ"

say "تثبيت Tunnel كخدمة systemd"
sudo cloudflared service install "$TOKEN"
unset TOKEN CLOUDFLARE_TUNNEL_TOKEN || true
sudo systemctl enable cloudflared.service >/dev/null 2>&1 || true
sudo systemctl restart cloudflared.service

say "فحص حالة Tunnel"
sudo systemctl --no-pager --full status cloudflared.service || true
sudo systemctl is-active --quiet cloudflared.service   || fail "خدمة cloudflared ليست active"

say "إعادة فحص الـ API المحلي"
curl -fsS --max-time 5 "$API_LOCAL_URL"
echo

if [ -n "$PUBLIC_TEST_URL" ]; then
  say "فحص عنوان Tunnel العام"
  curl -fsS --max-time 10 "$PUBLIC_TEST_URL"
  echo
else
  echo
  echo "✓ الموصل يعمل. الخطوة التالية من Cloudflare:"
  echo "  Published application -> hostname تجريبي مثل api-tunnel.yalladelivery.org"
  echo "  Service URL -> http://localhost:4000"
  echo
  echo "بعد إضافته افحص:"
  echo "  curl -fsS https://api-tunnel.yalladelivery.org/api/health"
fi
