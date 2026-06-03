import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const USERS_COLLECTION = "users";
const SIGNAL_WEBHOOK_EVENTS_COLLECTION = "signal_webhook_events";
const SCAN_LIMIT = Math.max(1, Number(process.env.MULTICHART_EXPIRY_SCAN_LIMIT || 500));
const INVITE_REVOKE_URL = process.env.TRADINGVIEW_INVITE_REVOKE_URL || "";
const INVITE_REVOKE_TOKEN = process.env.TRADINGVIEW_INVITE_REVOKE_TOKEN || "";
const INVITE_SCRIPT_ID = process.env.TRADINGVIEW_INVITE_SCRIPT_ID || "Dodam_MagicTrading_MultiChart_Fixed";

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(2);
}

function kstIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function tvIdFromUser(user = {}) {
  return (
    user.trv_id ||
    user.tv_id ||
    user.tradingview_username ||
    user.tradingviewUsername ||
    user.profile?.tradingview_username ||
    user.tradingview?.username ||
    user.integrations?.tradingview_username ||
    user.integrations?.trv_id ||
    ""
  );
}

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

async function revokeInviteOnlyAccess(user) {
  const tvId = tvIdFromUser(user);
  if (!INVITE_REVOKE_URL) {
    return {
      ok: true,
      dry_run: true,
      reason: "TRADINGVIEW_INVITE_REVOKE_URL_not_configured",
      tv_id: tvId,
    };
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
      user_id: String(user._id),
      reason: "multichart_fixed_subscription_expired",
    }),
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    tv_id: tvId,
    body: text.slice(0, 2000),
  };
}

async function revokeExpiredMultiChartUsers(db, now = new Date()) {
  const users = await db
    .collection(USERS_COLLECTION)
    .find({
      tier_type: "MultiChart_Fixed",
      status: "active",
      permanent_access: { $ne: true },
      expires_at: { $lte: now },
    })
    .limit(SCAN_LIMIT)
    .toArray();

  let expired = 0;
  let revoked = 0;

  for (const user of users) {
    const tvId = tvIdFromUser(user);
    const revokeResult = await revokeInviteOnlyAccess(user);
    await db.collection(USERS_COLLECTION).updateOne(
      { _id: user._id, status: "active" },
      {
        $set: {
          status: "expired",
          expired_at: now,
          expired_at_kst: kstIso(now),
          invite_revoke_result: revokeResult,
          current_registered_tickers: [],
          updated_at: now,
        },
      }
    );

    expired += 1;
    if (revokeResult.ok) revoked += 1;

    await writeAudit(db, {
      event: "multichart_fixed_subscription_expired_revoked",
      blocked: true,
      reason: "multichart_fixed_subscription_expired",
      subject_key: tvId ? `trv:${String(tvId).toLowerCase()}` : null,
      trv_id: tvId || null,
      user_id: String(user._id),
      expires_at: user.expires_at || null,
      invite_revoke_result: revokeResult,
    });
  }

  return { scanned: users.length, expired, revoked };
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB);
  const result = await revokeExpiredMultiChartUsers(db);
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  await client.close();
}
