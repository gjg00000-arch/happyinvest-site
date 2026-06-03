#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="${SERVICE_NAME:-magic-one-week-free-trial-webhook}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-}"
DEPLOY_PATH="${DEPLOY_PATH:-}"
PM2_APP_NAME="${PM2_APP_NAME:-$SERVICE_NAME}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-}"

cd "$APP_DIR"

echo "[deploy] local syntax check"
npm run check

if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_PATH" ]]; then
  echo "[deploy] DEPLOY_HOST/DEPLOY_PATH not set. Local validation completed; remote deploy skipped."
  echo "[deploy] Set DEPLOY_HOST, DEPLOY_USER(optional), DEPLOY_PATH, and PM2_APP_NAME or SYSTEMD_SERVICE for production deploy."
  exit 0
fi

REMOTE="${DEPLOY_HOST}"
if [[ -n "$DEPLOY_USER" ]]; then
  REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
fi

echo "[deploy] syncing files to ${REMOTE}:${DEPLOY_PATH}"
rsync -az --delete \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude "*.log" \
  "$APP_DIR/" "${REMOTE}:${DEPLOY_PATH}/"

echo "[deploy] installing production dependencies and checking syntax"
ssh "$REMOTE" "cd '${DEPLOY_PATH}' && npm ci --omit=dev && npm run check"

if [[ -n "$SYSTEMD_SERVICE" ]]; then
  echo "[deploy] reloading systemd service: ${SYSTEMD_SERVICE}"
  ssh "$REMOTE" "sudo systemctl restart '${SYSTEMD_SERVICE}' && sudo systemctl status '${SYSTEMD_SERVICE}' --no-pager -l | sed -n '1,20p'"
else
  echo "[deploy] reloading pm2 app: ${PM2_APP_NAME}"
  ssh "$REMOTE" "cd '${DEPLOY_PATH}' && (pm2 reload '${PM2_APP_NAME}' --update-env || pm2 start server.mjs --name '${PM2_APP_NAME}' --update-env) && pm2 save"
fi

echo "[deploy] production deploy completed"
