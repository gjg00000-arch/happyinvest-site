#!/usr/bin/env bash
# API VPS(/var/www/happyinvests/api)에서 실행 — 본부장 role 승격 + admin JWT 차단 버그 패치
#
# 사용 (SSH 접속 후):
#   cd /var/www/happyinvests/api
#   bash -s -- geo590603@gmail.com admin < /path/to/vps-promote-user-role.sh
#
# 또는 happyinvest-site 클론 경로에서:
#   API_DIR=/var/www/happyinvests/api bash scripts/vps-promote-user-role.sh geo590603@gmail.com admin
set -euo pipefail

TARGET_EMAIL="${1:-geo590603@gmail.com}"
ROLE="${2:-admin}"
API_DIR="${API_DIR:-/var/www/happyinvests/api}"
DB_NAME="${MONGODB_DB:-magic_indicator}"

if [[ ! -d "$API_DIR" ]]; then
  echo "[error] API_DIR not found: $API_DIR" >&2
  exit 1
fi

cd "$API_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "[error] MONGODB_URI not set (check $API_DIR/.env)" >&2
  exit 1
fi

echo "[1/3] MongoDB role update: $TARGET_EMAIL -> $ROLE"
node - "$TARGET_EMAIL" "$ROLE" <<'NODE'
const { MongoClient } = require("mongodb");
const email = process.argv[1].trim().toLowerCase();
const role = process.argv[2].trim().toLowerCase();
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "magic_indicator";
(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const res = await db.collection("users").updateOne(
    { email },
    { $set: { role, status: "active", updated_at: new Date() } }
  );
  if (res.matchedCount === 0) {
    console.error("[error] users document not found:", email);
    process.exit(2);
  }
  const u = await db.collection("users").findOne({ email }, { projection: { email: 1, role: 1, status: 1 } });
  console.log(JSON.stringify({ ok: true, user: u }, null, 2));
  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

UA_FILE="$API_DIR/src/user-attach.js"
if [[ -f "$UA_FILE" ]] && ! grep -q 'isAdminApiPath' "$UA_FILE"; then
  echo "[2/3] Patching user-attach.js (skip /api/admin for member JWT middleware)"
  python3 - <<'PY'
from pathlib import Path
import os
p = Path(os.environ["UA_FILE"])
text = p.read_text(encoding="utf-8")
needle = "export function createUserAttachMiddleware"
if "isAdminApiPath" in text:
    print("already patched")
else:
    insert = '''function isAdminApiPath(req) {
  const raw = String(req.originalUrl || req.url || req.path || "");
  const pathOnly = raw.split("?")[0];
  return pathOnly.startsWith("/api/admin");
}

'''
    text = text.replace(needle, insert + needle, 1)
    text = text.replace(
        "    if (!uri) return next();\n    try {",
        "    if (!uri) return next();\n    if (isAdminApiPath(req)) return next();\n    try {",
        1,
    )
    p.write_text(text, encoding="utf-8")
    print("patched", p)
PY
  export UA_FILE
else
  echo "[2/3] user-attach.js already patched or missing — skip"
fi

echo "[3/3] Restart API (pm2)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload all || pm2 restart all
  pm2 save || true
else
  echo "[warn] pm2 not found — restart API process manually (systemctl/pm2)"
fi

echo "[done] $TARGET_EMAIL role=$ROLE. Ask user to log out and log in again (Google) for new JWT."
