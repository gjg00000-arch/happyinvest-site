import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const SCAN_LIMIT = Math.max(1, Number(process.env.EXPIRY_SCAN_LIMIT || 1000));
const INVITE_REVOKE_URL = process.env.TRADINGVIEW_INVITE_REVOKE_URL || "";
const INVITE_REVOKE_TOKEN = process.env.TRADINGVIEW_INVITE_TOKEN || process.env.TRADINGVIEW_INVITE_REVOKE_TOKEN || "";
const INVITE_SCRIPT_ID = process.env.TRADINGVIEW_INVITE_SCRIPT_ID || "Dodam_MagicTrading_MultiChart_Fixed";

const USERS_COLLECTION = "users";
const FREE_TRIAL_ACCESSES_COLLECTION = "free_trial_accesses";
const ONE_WEEK_FREE_COLLECTION = "one_week_free_trials";
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
  const response = await fetch(INVITE_REVOKE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(INVITE_REVOKE_TOKEN ? { authorization: `Bearer ${INVITE_REVOKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      action: "delete_invite_only_access",
      script_id: INVITE_SCRIPT_ID,
      tv_id: tvId,
      user_id: doc._id ? String(doc._id) : "",
      reason,
    }),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, tv_id: tvId, body: text.slice(0, 2000) };
}

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

async function expireFreeTrials(db, collectionName, now) {
  const rows = await db
    .collection(collectionName)
    .find({
      status: "active",
      $or: [{ expire_at: { $lte: now } }, { expires_at: { $lte: now } }],
    })
    .limit(SCAN_LIMIT)
    .toArray();

  let expired = 0;
  let revoked = 0;
  for (const row of rows) {
    const revoke = await postInviteRevoke(row, `${collectionName}_expired`);
    await db.collection(collectionName).updateOne(
      { _id: row._id, status: "active" },
      {
        $set: {
          status: "expired",
          expired_at: now,
          expired_at_kst: kstIso(now),
          invite_revoke_result: revoke,
          updated_at: now,
        },
      }
    );
    expired += 1;
    if (revoke.ok) revoked += 1;
    await writeAudit(db, {
      event: `${collectionName}_expired_revoked`,
      blocked: true,
      reason: `${collectionName}_expired`,
      subject_key: row.subject_key || null,
      trv_id: tvIdFromDoc(row) || null,
      expires_at: row.expires_at || row.expire_at || null,
      invite_revoke_result: revoke,
    });
  }
  return { scanned: rows.length, expired, revoked };
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
    const revoke = await postInviteRevoke(user, "paid_subscription_expired");
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
      event: "paid_user_expired_revoked",
      blocked: true,
      reason: "paid_subscription_expired",
      trv_id: tvIdFromDoc(user) || null,
      user_id: String(user._id),
      expires_at: user.expires_at || null,
      invite_revoke_result: revoke,
    });
  }
  return { scanned: rows.length, expired, revoked };
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB);
  const now = new Date();
  const freeTrialAccesses = await expireFreeTrials(db, FREE_TRIAL_ACCESSES_COLLECTION, now);
  const oneWeekMirror = await expireFreeTrials(db, ONE_WEEK_FREE_COLLECTION, now);
  const paidUsers = await expirePaidUsers(db, now);
  console.log(JSON.stringify({ ok: true, freeTrialAccesses, oneWeekMirror, paidUsers }));
} finally {
  await client.close();
}
