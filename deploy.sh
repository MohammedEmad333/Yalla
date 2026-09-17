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

if ! command -v pm2 >/dev/null 2>&1; then
  log "PM2 not found — installing it globally"
  if command -v sudo >/dev/null 2>&1; then
    sudo npm install -g pm2
  else
    npm install -g pm2
  fi
fi

log "Restarting backend with PM2"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start npm --name "$PM2_APP" -- start
fi

pm2 save

log "Deployment finished"
pm2 status "$PM2_APP"
