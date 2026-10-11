#!/usr/bin/env bash
# Read-only Yalla production smoke check. Run on the Oracle host from any directory.
set -uo pipefail
failures=0
fail() { printf 'FAIL: %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'PASS: %s\n' "$1"; }

check_http() {
  local label="$1" url="$2" expected="$3" actual
  actual="$(curl -sS -L --max-time 12 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)" || actual="000"
  if [[ "$actual" == "$expected" ]]; then pass "$label (HTTP $actual)"; else fail "$label (expected $expected, got $actual)"; fi
}
check_http 'Public API health' 'https://api.yalladelivery.org/api/health' 200
check_http 'Website' 'https://yalladelivery.org' 200
check_http 'Customer web' 'https://app.yalladelivery.org' 200
check_http 'Partner web' 'https://partner.yalladelivery.org' 200
# Admin is gated by Cloudflare Access; a redirected 200 is NOT proof of admin app availability.
if command -v docker >/dev/null 2>&1; then
  for container in yalla-api yalla-mongo yalla-redis; do
    status="$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)"
    if [[ "$status" == true ]]; then pass "$container running"; else fail "$container not running"; fi
  done
  if [[ "$(docker exec yalla-redis redis-cli ping 2>/dev/null)" == PONG ]]; then pass 'Redis ping'; else fail 'Redis ping'; fi
  if [[ "$(docker exec yalla-mongo mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null)" == 1 ]]; then pass 'MongoDB ping'; else fail 'MongoDB ping'; fi
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if git -C "$root" rev-parse HEAD >/dev/null 2>&1; then
    source_sha="$(git -C "$root" rev-parse HEAD)"
    deployed_sha="$(docker exec yalla-api printenv APP_GIT_SHA 2>/dev/null || true)"
    if [[ "$source_sha" == "$deployed_sha" ]]; then pass 'Deployed revision matches checkout'; else fail 'Deployed revision differs from checkout'; fi
  fi
else
  fail 'Docker command unavailable'
fi
printf '\nResult: %d failure(s)\n' "$failures"
[[ "$failures" -eq 0 ]]
