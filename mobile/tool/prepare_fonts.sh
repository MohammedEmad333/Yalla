#!/usr/bin/env bash
# Prepare validated Arabic font for Flutter web, Android and tests.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT/assets/fonts/IBMPlexSansArabic-Regular.ttf"
URL="https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf"
valid() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys
try:
    p = Path(sys.argv[1])
    with p.open('rb') as f:
        signature = f.read(4)
    assert p.stat().st_size > 10000
    assert signature in (b'\x00\x01\x00\x00', b'OTTO', b'true')
except (OSError, AssertionError):
    sys.exit(1)
PY
}
if valid "$FILE"; then exit 0; fi
mkdir -p "$(dirname "$FILE")"
TMP="$(mktemp "$FILE.tmp.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
curl --fail --location --retry 3 --connect-timeout 15 --max-time 90 --output "$TMP" "$URL"
valid "$TMP" || { echo "Invalid Arabic font download" >&2; exit 1; }
mv "$TMP" "$FILE"
echo "Arabic font ready"
