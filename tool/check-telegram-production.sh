#!/usr/bin/env bash
# Read-only production smoke check for Telegram 1.3 after deploying the API.
# Run from the Oracle host: bash tool/check-telegram-production.sh [expected_git_sha]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="yalla-api"
EXPECTED="$(git -C "$ROOT" rev-parse HEAD)"
if [ "$#" -gt 0 ]; then EXPECTED="$1"; fi

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

if ! [[ "$EXPECTED" =~ ^[a-f0-9]{40}$ ]]; then
  fail "Expected revision must be a 40-character Git commit SHA"
fi
command -v docker >/dev/null || fail "Docker is unavailable"
command -v curl >/dev/null || fail "curl is unavailable"

RUNNING="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)"
[ "$RUNNING" = true ] || fail "API container is not running"

DEPLOYED="$(docker exec "$CONTAINER" printenv APP_GIT_SHA 2>/dev/null || true)"
[ "$DEPLOYED" = "$EXPECTED" ] || fail "API revision mismatch: deployed=$DEPLOYED expected=$EXPECTED"
pass "API container revision matches $EXPECTED"

docker exec "$CONTAINER" sh -c   "test -f /app/src/services/telegramCaptainMetrics.service.js && grep -q '/telegram/metrics' /app/src/routes/admin.routes.js"   || fail "Telegram 1.3 backend implementation is missing"
pass "Telegram metrics service and admin route exist in the deployed image"

curl -fsS --max-time 10 http://127.0.0.1:4000/api/health >/dev/null   || fail "Local API health check failed"
pass "Local API health"
curl -fsS --max-time 10 https://api.yalladelivery.org/api/health >/dev/null   || fail "Public API health check failed"
pass "Public API health"

# This check must not authenticate as an administrator or print credentials.
# An unauthenticated request to the protected metrics endpoint must be denied.
HTTP_STATUS="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}'   'http://127.0.0.1:4000/api/admin/telegram/metrics?days=7' || true)"
case "$HTTP_STATUS" in
  401|403) pass "Unauthenticated metrics request denied (HTTP $HTTP_STATUS)" ;;
  *) fail "Metrics route did not deny anonymous access (HTTP $HTTP_STATUS)" ;;
esac

# Check existing MongoDB index metadata only; this does not create indexes.
docker exec -i "$CONTAINER" node <<'NODE'
'use strict';
const mongoose = require('mongoose');
(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MongoDB connection is not configured');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000, autoIndex: false });
  const indexes = await mongoose.connection.db.collection('telegramcaptainmetrics').listIndexes().toArray();
  const unique = indexes.some(i => i.unique === true &&
    i.key?.day === 1 && i.key?.kind === 1 && i.key?.outcome === 1);
  const ttl = indexes.some(i => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0);
  if (!unique || !ttl) throw new Error('Required Telegram metric indexes are missing');
  process.stdout.write('PASS: Telegram metrics unique and TTL indexes exist\n');
})().then(() => mongoose.disconnect()).catch(async (error) => {
  // Never print database URIs, raw driver errors, or credentials.
  process.stderr.write('FAIL: Telegram metrics indexes unavailable or MongoDB inaccessible\n');
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
NODE

# Report whether a pilot is enabled without revealing the allowlist or token.
docker exec "$CONTAINER" node <<'NODE'
'use strict';
const enabled = process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED === 'true';
const allowlist = String(process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS || '').trim();
if (allowlist === '*' || (enabled && !allowlist)) {
  process.stderr.write('FAIL: Telegram pilot allowlist must be a specific captain ID\n');
  process.exitCode = 1;
} else {
  process.stdout.write(enabled
    ? 'PASS: Telegram pilot notifications enabled for a limited allowlist\n'
    : 'PASS: Telegram pilot remains disabled (safe default)\n');
}
NODE

printf '\nTelegram 1.3 backend smoke checks passed.\n'
printf 'Manual captain notification tests and admin sign-in are still required.\n'
