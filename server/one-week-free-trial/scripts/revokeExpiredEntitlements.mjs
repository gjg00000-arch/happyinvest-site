import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const SCAN_LIMIT = Math.max(1, Number(process.env.EXPIRY_SCAN_LIMIT || 1000));
const INVITE_REVOKE_URL = process.env.TRADINGVIEW_INVITE_REVOKE_URL || "";
const INVITE_REVOKE_TOKEN = process.env.TRADINGVIEW_INVITE_TOKEN || process.env.TRADINGVIEW_INVITE_REVOKE_TOKEN || "";
const INVITE_SCRIPT_ID = process.env.TRADINGVIEW_INVITE_SCRIPT_ID || "Dodam_MagicTrading_MultiChart_Fixed";
const INVITE_SCRIPT_IDS = String(process.env.TRADINGVIEW_INVITE_SCRIPT_IDS || INVITE_SCRIPT_ID)
  .split(",")
  .map((scriptId) => scriptId.trim())
  .filter(Boolean);

const USERS_COLLECTION = "users";
const SIGNAL_WEBHOOK_EVENTS_COLLECTION = "signal_webhook_events";

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(2);
}

function kstIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function tvIdFromDoc(doc = {}) {
  return (
    doc.trv_id ||
    doc.tv_id ||
    doc.tradingview_username ||
    doc.tradingviewUsername ||
    doc.profile?.tradingview_username ||
    doc.tradingview?.username ||
    doc.integrations?.tradingview_username ||
    doc.integrations?.trv_id ||
    ""
  );
}

async function postInviteRevoke(doc, reason) {
  const tvId = tvIdFromDoc(doc);
  if (!tvId) return { ok: true, skipped: true, reason: "missing_tv_id" };
  if (!INVITE_REVOKE_URL) {
    return { ok: true, dry_run: true, reason: "TRADINGVIEW_INVITE_REVOKE_URL_not_configured", tv_id: tvId };
  }
  const results = [];
  const scriptIds = INVITE_SCRIPT_IDS.length ? INVITE_SCRIPT_IDS : [INVITE_SCRIPT_ID];
  for (const scriptId of scriptIds) {
    const response = await fetch(INVITE_REVOKE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(INVITE_REVOKE_TOKEN ? { authorization: `Bearer ${INVITE_REVOKE_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        action: "delete_invite_only_access",
        script_id: scriptId,
        tv_id: tvId,
        user_id: doc._id ? String(doc._id) : "",
        reason,
      }),
    });
    const text = await response.text();
    results.push({ ok: response.ok, status: response.status, script_id: scriptId, body: text.slice(0, 2000) });
  }
  return { ok: results.every((result) => result.ok), tv_id: tvId, script_ids: scriptIds, results };
}

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

async function expirePaidUsers(db, now) {
  const rows = await db
    .collection(USERS_COLLECTION)
    .find({
      status: "active",
      permanent_access: { $ne: true },
      expires_at: { $lte: now },
    })
    .limit(SCAN_LIMIT)
    .toArray();

  let expired = 0;
  let revoked = 0;
  for (const user of rows) {
    const revoke = await postInviteRevoke(user, "user_license_expired");
    await db.collection(USERS_COLLECTION).updateOne(
      { _id: user._id, status: "active" },
      {
        $set: {
          status: "expired",
          expired_at: now,
          expired_at_kst: kstIso(now),
          invite_revoke_result: revoke,
          current_registered_tickers: [],
          updated_at: now,
        },
      }
    );
    expired += 1;
    if (revoke.ok) revoked += 1;
    await writeAudit(db, {
      event: "user_license_expired_revoked",
      blocked: true,
      reason: "user_license_expired",
      trv_id: tvIdFromDoc(user) || null,
      user_id: String(user._id),
      license_pack: user.license_pack || user.last_license_pack || null,
      expires_at: user.expires_at || null,
      invite_revoke_result: revoke,
    });
  }
  return { scanned: rows.length, expired, revoked };
}

async function revokeHaltedUsers(db, now) {
  const rows = await db
    .collection(USERS_COLLECTION)
    .find({
      status: "halted",
      permanent_access: { $ne: true },
      invite_revoke_result: { $exists: false },
    })
    .limit(SCAN_LIMIT)
    .toArray();

  let halted = 0;
  let revoked = 0;
  for (const user of rows) {
    const revoke = await postInviteRevoke(user, "paid_user_halted");
    await db.collection(USERS_COLLECTION).updateOne(
      { _id: user._id, status: "halted" },
      {
        $set: {
          invite_revoke_result: revoke,
          halted_revoke_checked_at: now,
          halted_revoke_checked_at_kst: kstIso(now),
          current_registered_tickers: [],
          updated_at: now,
        },
      }
    );
    halted += 1;
    if (revoke.ok) revoked += 1;
    await writeAudit(db, {
      event: "halted_user_invite_revoked",
      blocked: true,
      reason: "paid_user_halted",
      trv_id: tvIdFromDoc(user) || null,
      user_id: String(user._id),
      invite_revoke_result: revoke,
    });
  }
  return { scanned: rows.length, halted, revoked };
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB);
  const now = new Date();
  const paidUsers = await expirePaidUsers(db, now);
  const haltedUsers = await revokeHaltedUsers(db, now);
  console.log(JSON.stringify({ ok: true, users: paidUsers, haltedUsers }));
} finally {
  await client.close();
}
