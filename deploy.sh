#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PM2_APP="${PM2_APP:-yalla-api}"

log() {
  printf '\n==> %s\n' "$1"
}

log "Updating Yalla from GitHub"
cd "$ROOT_DIR"
git fetch origin main
git pull --ff-only origin main

log "Installing backend production dependencies"
cd "$BACKEND_DIR"
npm ci --omit=dev

log "Checking backend entry point"
node --check src/server.js

log "Restarting backend with PM2"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start npm --name "$PM2_APP" -- start
fi

pm2 save

log "Deployment finished"
pm2 status "$PM2_APP"
