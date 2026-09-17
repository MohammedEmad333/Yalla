#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PM2_APP="${PM2_APP:-yalla-api}"
API_PORT="${PORT:-4000}"
MIN_NODE_MAJOR=22

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

log "Checking runtime"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  fail "Node.js ${MIN_NODE_MAJOR}+ is required (current: $(node -v))"
fi
printf 'Node: %s\n' "$(node -v)"

# File-mode-only changes (for example chmod +x deploy.sh) should not block pulls.
git -C "$ROOT_DIR" config core.fileMode false

log "Updating Yalla from GitHub"
cd "$ROOT_DIR"
if [ -n "$(git status --porcelain)" ]; then
  printf '%s\n' "Local repository changes detected:" >&2
  git status --short >&2
  fail "Commit, stash, or restore local tracked changes before deployment"
fi
git fetch origin main
git pull --ff-only origin main

# The API is intentionally managed by PM2 on this server. An old Docker API
# container would compete for port 4000 and cause EADDRINUSE restart loops.
if command -v docker >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "$PM2_APP"; then
    log "Removing old Docker API container ($PM2_APP) to avoid a port conflict"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -Fxq "$PM2_APP"; then
      docker stop "$PM2_APP"
    fi
    docker rm "$PM2_APP"
  elif command -v sudo >/dev/null 2>&1 && sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "$PM2_APP"; then
    log "Removing old Docker API container ($PM2_APP) to avoid a port conflict"
    if sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -Fxq "$PM2_APP"; then
      sudo docker stop "$PM2_APP"
    fi
    sudo docker rm "$PM2_APP"
  fi
fi

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

# If PM2 does not already own the API, refuse to steal a port from another
# service. Existing PM2 deployments may legitimately already be listening.
if ! pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -Eq "[:.]${API_PORT}[[:space:]]"; then
    fail "Port ${API_PORT} is already in use by another process"
  fi
fi

log "Restarting backend with PM2"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start npm --name "$PM2_APP" -- start
fi

pm2 save

log "Verifying backend"
sleep 3
PM2_STATUS="$(pm2 jlist | node -e '
let data="";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  const name = process.argv[1];
  const list = JSON.parse(data || "[]");
  const app = list.find((item) => item.name === name);
  process.stdout.write(app?.pm2_env?.status || "missing");
});
' "$PM2_APP")"

if [ "$PM2_STATUS" != "online" ]; then
  pm2 logs "$PM2_APP" --lines 40 --nostream || true
  fail "PM2 application is not online (status: $PM2_STATUS)"
fi

pm2 status "$PM2_APP"
printf '\nDeployment finished successfully. API port: %s\n' "$API_PORT"
