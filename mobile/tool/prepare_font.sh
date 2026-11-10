#!/usr/bin/env bash
set -euo pipefail

# IBM Plex Sans Arabic is an OFL-licensed font distributed by Google Fonts.
# Download it before Flutter test/build because the binary is not checked into Git.
# Run from mobile/ or any directory.
mobile_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
font_dir="$mobile_dir/assets/fonts"
font_path="$font_dir/IBMPlexSansArabic-Regular.ttf"
font_url="https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf"

mkdir -p "$font_dir"
if [ -s "$font_path" ] && [ "$(wc -c < "$font_path")" -gt 10000 ]; then
  echo "IBM Plex Sans Arabic is already available."
  exit 0
fi

temp_path="$(mktemp "$font_dir/.ibmplex.XXXXXXXX")"
trap 'rm -f "$temp_path"' EXIT
curl --fail --location --retry 3 --connect-timeout 15 --max-time 90 \
  --output "$temp_path" "$font_url"
if [ "$(wc -c < "$temp_path")" -le 10000 ]; then
  echo "Font download is incomplete" >&2
  exit 1
fi
mv "$temp_path" "$font_path"
echo "IBM Plex Sans Arabic font prepared."
