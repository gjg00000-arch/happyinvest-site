import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const USERS_COLLECTION = "users";
const LEGACY_FREE_COLLECTIONS = ["free_trial_accesses", "one_week_free_trials"];
const SCAN_LIMIT = Math.max(1, Number(process.env.FREE_TRIAL_MIGRATION_LIMIT || 5000));

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(2);
}

function kstIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function tvIdFromDoc(doc = {}) {
  return doc.tv_id || doc.trv_id || doc.tradingview_username || doc.tradingviewUsername || "";
}

function coerceDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function licensePackFromDoc(doc = {}) {
  const raw = doc.license_pack || doc.last_license_pack || doc.free_trial_license_pack || "";
  const normalized = String(raw).trim();
  if (normalized === "DMT_Free_1Week" || normalized === "DMT_Free_3Month") return normalized;
  return String(doc.trial_plan_label || "").includes("1주") ? "DMT_Free_1Week" : "DMT_Free_3Month";
}

async function migrateCollection(db, collectionName) {
  const rows = await db.collection(collectionName).find({}).limit(SCAN_LIMIT).toArray();
  const now = new Date();
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const tvId = tvIdFromDoc(row);
    if (!tvId) {
      skipped += 1;
      continue;
    }

    const licensePack = licensePackFromDoc(row);
    const expiresAt = coerceDate(row.expires_at || row.expire_at);
    const startedAt = coerceDate(row.trial_started_at || row.started_at || row.first_seen_at || row.created_at) || now;
    const status = ["active", "halted", "expired", "cancelled"].includes(String(row.status || "").toLowerCase())
      ? String(row.status).toLowerCase()
      : expiresAt && expiresAt.getTime() <= now.getTime()
        ? "expired"
        : "active";

    await db.collection(USERS_COLLECTION).updateOne(
      {
        $or: [{ tv_id: tvId }, { trv_id: tvId }, { tradingview_username: tvId }, { subject_key: row.subject_key || `trv:${tvId}` }],
      },
      {
        $set: {
          username: row.username || tvId,
          subject_key: row.subject_key || `trv:${tvId}`,
          tv_id: tvId,
          trv_id: tvId,
          tradingview_username: tvId,
          license_pack: licensePack,
          last_license_pack: licensePack,
          plan_code: licensePack,
          plan_sku: licensePack,
          status,
          membership_type: "associate",
          tier_type: "FreeTrialAssociate",
          expires_at: expiresAt,
          expire_at: expiresAt,
          started_at: startedAt,
          trial_started_at: startedAt,
          paypal_subscription_id: row.paypal_subscription_id || row.subscription_id || null,
          backendRegularPrepaidConfirmed: row.backendRegularPrepaidConfirmed === true,
          backend_regular_prepaid_confirmed: row.backend_regular_prepaid_confirmed === true,
          migrated_from_legacy_free_collection: collectionName,
          migrated_at: now,
          migrated_at_kst: kstIso(now),
          updated_at: now,
        },
        $setOnInsert: {
          created_at: row.created_at || now,
        },
      },
      { upsert: true, collation: { locale: "en", strength: 2 } }
    );
    migrated += 1;
  }

  return { collection: collectionName, scanned: rows.length, migrated, skipped };
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB);
  const results = [];
  for (const collectionName of LEGACY_FREE_COLLECTIONS) {
    results.push(await migrateCollection(db, collectionName));
  }
  console.log(JSON.stringify({ ok: true, users_collection: USERS_COLLECTION, results }));
} finally {
  await client.close();
}
