#!/usr/bin/env bash
set -Eeuo pipefail

# Canonical production deployment entry point for the Oracle server.
#
# Usage on Oracle:
#   cd ~/Yalla && bash deploy.sh
#
# The real deployment logic lives in tool/deploy-server.sh and uses Docker
# with ~/yalla.env, preserving the production JWT secret, MongoDB container,
# uploads volume, media directory and FCM credentials.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$ROOT_DIR/tool/deploy-server.sh"

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  echo "ERROR: deployment script not found: $DEPLOY_SCRIPT" >&2
  exit 1
fi

exec bash "$DEPLOY_SCRIPT" "$@"
