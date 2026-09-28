#!/usr/bin/env bash
# نسخة محلية مضغوطة من صور Yalla المخزّنة على قرص Oracle.
# الافتراضي: ~/yalla-media -> ~/backups/media، والاحتفاظ 14 يومًا.
set -euo pipefail

MEDIA_HOST_DIR="${MEDIA_HOST_DIR:-$HOME/yalla-media}"
BACKUP_DIR="${MEDIA_BACKUP_DIR:-$HOME/backups/media}"
RETENTION_DAYS="${MEDIA_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%F-%H%M%S)"

[ -d "$MEDIA_HOST_DIR" ] || { echo "Media directory not found: $MEDIA_HOST_DIR" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

ARCHIVE="$BACKUP_DIR/yalla-media-$STAMP.tar.gz"
tar -C "$(dirname "$MEDIA_HOST_DIR")" -czf "$ARCHIVE" "$(basename "$MEDIA_HOST_DIR")"
find "$BACKUP_DIR" -type f -name 'yalla-media-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Media backup created: $ARCHIVE"
