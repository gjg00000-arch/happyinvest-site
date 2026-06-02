const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

export const ONE_WEEK_FREE_COLLECTION = "one_week_free_trials";
export const FREE_TRIAL_ACCESSES_COLLECTION = "free_trial_accesses";
export const SIGNAL_WEBHOOK_EVENTS_COLLECTION = "signal_webhook_events";
const ONE_WEEK_LICENSE_PACKS = new Set(["dmt_free_1week", "marketfree_1weekfree"]);

function cleanId(value, max = 96) {
  const s = String(value || "").trim();
  if (!s || s.includes("{{") || s.includes("}}")) return "";
  if (!/^[a-zA-Z0-9._:@-]{1,96}$/.test(s)) return "";
  return s.slice(0, max);
}

function normalizeTvId(value) {
  return cleanId(value, 96).toLowerCase();
}

function normalizeMt5Account(value) {
  return cleanId(value, 64).toLowerCase();
}

function normalizeMt5Server(value) {
  const s = String(value || "").trim();
  if (!s || s.includes("{{") || s.includes("}}")) return "";
  if (!/^[a-zA-Z0-9._: /-]{1,120}$/.test(s)) return "";
  return s.replace(/\s+/g, " ").slice(0, 120).toLowerCase();
}

function kstIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

export function parseWebhookPayload(rawBody) {
  if (rawBody && typeof rawBody === "object" && !Buffer.isBuffer(rawBody)) return rawBody;
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

export function extractTrialIdentity(payload = {}) {
  const tvId = normalizeTvId(payload.tv_id || payload.tvId || payload.tradingview_username);
  const mt5Account = normalizeMt5Account(
    payload.mt5_account || payload.mt5_login || payload.mt5_id || payload.account || payload.account_id
  );
  const mt5Server = normalizeMt5Server(payload.mt5_server || payload.server || payload.broker_server);

  if (tvId) {
    return {
      channel: "tradingview",
      subject_key: `trv:${tvId}`,
      trv_id: tvId,
      mt5_account: mt5Account || null,
      mt5_server: mt5Server || null,
    };
  }

  if (mt5Account && mt5Server) {
    return {
      channel: "mt5",
      subject_key: `mt5:${mt5Server}:${mt5Account}`,
      trv_id: null,
      mt5_account: mt5Account,
      mt5_server: mt5Server,
    };
  }

  return null;
}

export function isOneWeekFreeLicensePack(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  return ONE_WEEK_LICENSE_PACKS.has(licensePack);
}

export async function ensureOneWeekFreeTrialIndexes(db) {
  const trials = db.collection(ONE_WEEK_FREE_COLLECTION);
  await trials.createIndex({ subject_key: 1 }, { unique: true, name: "one_week_free_trials_subject_key_unique" });
  await trials.createIndex({ trv_id: 1 }, { name: "one_week_free_trials_trv_id", sparse: true });
  await trials.createIndex(
    { mt5_server: 1, mt5_account: 1 },
    { name: "one_week_free_trials_mt5_identity", sparse: true }
  );
  await trials.createIndex({ expires_at: 1 }, { name: "one_week_free_trials_expires_at" });
  await trials.createIndex({ status: 1, last_seen_at: -1 }, { name: "one_week_free_trials_status_last_seen" });

  const events = db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION);
  await events.createIndex({ received_at: -1 }, { name: "signal_webhook_events_received_at" });
  await events.createIndex({ subject_key: 1, received_at: -1 }, { name: "signal_webhook_events_subject_received" });
  await events.createIndex({ trv_id: 1, received_at: 1 }, { name: "signal_webhook_events_trv_received" });
  await events.createIndex({ tv_id: 1, received_at: 1 }, { name: "signal_webhook_events_tv_received", sparse: true });

  const freeTrials = db.collection(FREE_TRIAL_ACCESSES_COLLECTION);
  await freeTrials.createIndex({ subject_key: 1 }, { unique: true, name: "free_trial_accesses_subject_key_unique" });
  await freeTrials.createIndex({ trv_id: 1, started_at: 1 }, { name: "free_trial_accesses_trv_started", sparse: true });
  await freeTrials.createIndex({ tv_id: 1, started_at: 1 }, { name: "free_trial_accesses_tv_started", sparse: true });
  await freeTrials.createIndex({ expire_at: 1 }, { name: "free_trial_accesses_expire_at", sparse: true });
}

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

function coerceDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function startedAtFromRecord(record) {
  return coerceDate(
    record?.trial_started_at ||
      record?.started_at ||
      record?.first_seen_at ||
      record?.created_at ||
      record?.received_at
  );
}

function expireAtFromRecord(record, startedAt) {
  return (
    coerceDate(record?.expire_at || record?.expires_at || record?.expired_at) ||
    (startedAt ? new Date(startedAt.getTime() + TRIAL_MS) : null)
  );
}

async function findExistingTrialByTvId(db, tvId) {
  const subjectKey = `trv:${tvId}`;
  const tvMatch = [
    { subject_key: subjectKey },
    { trv_id: tvId },
    { tv_id: tvId },
    { tradingview_username: tvId },
  ];

  const freeTrial = await db.collection(FREE_TRIAL_ACCESSES_COLLECTION).findOne(
    { $or: tvMatch },
    { sort: { started_at: 1, trial_started_at: 1, created_at: 1 } }
  );
  if (freeTrial) return { source: FREE_TRIAL_ACCESSES_COLLECTION, record: freeTrial };

  const signalEvent = await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).findOne(
    { $or: tvMatch },
    { sort: { received_at: 1, created_at: 1 } }
  );
  if (signalEvent) return { source: SIGNAL_WEBHOOK_EVENTS_COLLECTION, record: signalEvent };

  return null;
}

export function checkTrialWebhookEntitlement(db) {
  return async function trialWebhookEntitlementMiddleware(req, res, next) {
    try {
      const payload = parseWebhookPayload(req.body);
      req.webhookPayload = payload;

      const tvId = normalizeTvId(payload.tv_id);
      if (!tvId) {
        await writeAudit(db, {
          event: "trial_webhook_entitlement_rejected",
          blocked: true,
          reason: "missing_or_invalid_tv_id",
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: "missing_or_invalid_tv_id",
          message: "TradingView tv_id를 확인할 수 없어 주문 전송을 차단했습니다.",
        });
      }

      const now = new Date();
      const subjectKey = `trv:${tvId}`;
      let startedAt = null;
      let expireAt = null;
      let source = ONE_WEEK_FREE_COLLECTION;
      let trialRecord = null;

      const existing = await findExistingTrialByTvId(db, tvId);
      if (existing) {
        source = existing.source;
        trialRecord = existing.record;
        startedAt = startedAtFromRecord(existing.record);
        expireAt = expireAtFromRecord(existing.record, startedAt);
      } else {
        const expireAtOnInsert = new Date(now.getTime() + TRIAL_MS);
        const result = await db.collection(FREE_TRIAL_ACCESSES_COLLECTION).findOneAndUpdate(
          { subject_key: subjectKey },
          {
            $setOnInsert: {
              subject_key: subjectKey,
              channel: "tradingview",
              trv_id: tvId,
              tv_id: tvId,
              started_at: now,
              started_at_kst: kstIso(now),
              trial_started_at: now,
              expire_at: expireAtOnInsert,
              expire_at_kst: kstIso(expireAtOnInsert),
              expires_at: expireAtOnInsert,
              status: "active",
              source: "tradingview_webhook",
              created_at: now,
            },
            $set: {
              last_seen_at: now,
              last_seen_at_kst: kstIso(now),
              last_license_pack: payload.license_pack || null,
              last_tickerid: payload.tickerid || null,
              last_magic_signal: payload.magic_signal || null,
              last_event: payload.event || null,
              updated_at: now,
            },
            $inc: { webhook_seen_count: 1 },
          },
          { upsert: true, returnDocument: "after" }
        );
        trialRecord = result?.value || result;
        startedAt = startedAtFromRecord(trialRecord) || now;
        expireAt = expireAtFromRecord(trialRecord, startedAt) || expireAtOnInsert;
        source = FREE_TRIAL_ACCESSES_COLLECTION;

        await db.collection(ONE_WEEK_FREE_COLLECTION).updateOne(
          { subject_key: subjectKey },
          {
            $setOnInsert: {
              subject_key: subjectKey,
              channel: "tradingview",
              trv_id: tvId,
              tv_id: tvId,
              started_at: startedAt,
              started_at_kst: kstIso(startedAt),
              trial_started_at: startedAt,
              expire_at: expireAt,
              expire_at_kst: kstIso(expireAt),
              expires_at: expireAt,
              status: "active",
              source: "tradingview_webhook_mirror",
              created_at: now,
            },
            $set: {
              last_seen_at: now,
              last_seen_at_kst: kstIso(now),
              last_license_pack: payload.license_pack || null,
              last_tickerid: payload.tickerid || null,
              last_magic_signal: payload.magic_signal || null,
              last_event: payload.event || null,
              updated_at: now,
            },
          },
          { upsert: true }
        );
      }

      if (!startedAt || !expireAt) {
        await writeAudit(db, {
          event: "trial_webhook_entitlement_rejected",
          blocked: true,
          reason: "missing_started_at_or_expire_at",
          subject_key: subjectKey,
          trv_id: tvId,
          source,
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: "missing_started_at_or_expire_at",
          message: "무료 체험 시작/만료 시각을 확인할 수 없어 주문 전송을 차단했습니다.",
        });
      }

      const expired = now.getTime() > expireAt.getTime();

      if (expired) {
        await Promise.all([
          db.collection(FREE_TRIAL_ACCESSES_COLLECTION).updateOne(
            { subject_key: subjectKey },
            {
              $set: {
                subject_key: subjectKey,
                channel: "tradingview",
                trv_id: tvId,
                tv_id: tvId,
                started_at: startedAt,
                trial_started_at: startedAt,
                expire_at: expireAt,
                expire_at_kst: kstIso(expireAt),
                expires_at: expireAt,
                status: "expired",
                blocked_at: now,
                blocked_reason: "trial_period_expired",
                updated_at: now,
              },
              $inc: { blocked_count: 1 },
            },
            { upsert: true }
          ),
          db.collection(ONE_WEEK_FREE_COLLECTION).updateOne(
            { subject_key: subjectKey },
            {
              $set: {
                subject_key: subjectKey,
                channel: "tradingview",
                trv_id: tvId,
                tv_id: tvId,
                started_at: startedAt,
                trial_started_at: startedAt,
                expire_at: expireAt,
                expire_at_kst: kstIso(expireAt),
                expires_at: expireAt,
                status: "expired",
                blocked_at: now,
                blocked_reason: "trial_period_expired",
                updated_at: now,
              },
              $inc: { blocked_count: 1 },
            },
            { upsert: true }
          ),
        ]);
        await writeAudit(db, {
          event: "trial_webhook_entitlement_expired",
          blocked: true,
          reason: "trial_period_expired",
          subject_key: subjectKey,
          trv_id: tvId,
          source,
          started_at: startedAt,
          expire_at: expireAt,
          expires_at: expireAt,
          payload_event: payload.event || null,
          magic_signal: payload.magic_signal || null,
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: "trial_period_expired",
          message: "무료 체험 7일이 만료되어 브로커 주문 전송을 차단했습니다.",
        });
      }

      await writeAudit(db, {
        event: "trial_webhook_entitlement_accepted",
        blocked: false,
        subject_key: subjectKey,
        trv_id: tvId,
        source,
        started_at: startedAt,
        expire_at: expireAt,
        expires_at: expireAt,
        payload_event: payload.event || null,
        magic_signal: payload.magic_signal || null,
        license_pack: payload.license_pack || null,
        tickerid: payload.tickerid || null,
        ip: req.ip || req.socket?.remoteAddress || null,
        user_agent: req.headers["user-agent"] || null,
      });

      req.trialWebhookEntitlement = {
        subject_key: subjectKey,
        trv_id: tvId,
        source,
        started_at: startedAt,
        expire_at: expireAt,
        expires_at: expireAt,
        pass: true,
      };
      req.oneWeekFreeTrial = req.trialWebhookEntitlement;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export async function checkOneWeekFreeTrial(db, payload, reqMeta = {}) {
  const identity = extractTrialIdentity(payload);
  const now = new Date();

  if (!isOneWeekFreeLicensePack(payload)) {
    await writeAudit(db, {
      event: "one_week_free_trial_license_pack_rejected",
      blocked: true,
      reason: "invalid_license_pack",
      license_pack: payload.license_pack || null,
      ip: reqMeta.ip || null,
      user_agent: reqMeta.user_agent || null,
    });
    return {
      ok: false,
      status: 403,
      error: "1주 무료 체험판 웹훅 라이선스가 아닙니다.",
    };
  }

  if (!identity) {
    await writeAudit(db, {
      event: "one_week_free_trial_identity_missing",
      blocked: true,
      reason: "missing_tv_id_or_mt5_identity",
      ip: reqMeta.ip || null,
      user_agent: reqMeta.user_agent || null,
    });
    return {
      ok: false,
      status: 403,
      error: "TradingView 또는 MT5 식별값을 확인할 수 없습니다.",
    };
  }

  const expiresAtOnInsert = new Date(now.getTime() + TRIAL_MS);
  const trials = db.collection(ONE_WEEK_FREE_COLLECTION);
  const result = await trials.findOneAndUpdate(
    { subject_key: identity.subject_key },
    {
      $setOnInsert: {
        ...identity,
        first_seen_at: now,
        trial_started_at: now,
        expires_at: expiresAtOnInsert,
        status: "active",
        source: "webhook_1weekfree",
        created_at: now,
      },
      $set: {
        last_seen_at: now,
        last_seen_at_kst: kstIso(now),
        last_license_pack: payload.license_pack || null,
        last_tickerid: payload.tickerid || null,
        last_magic_signal: payload.magic_signal || null,
        last_event: payload.event || null,
        updated_at: now,
      },
      $inc: { webhook_seen_count: 1 },
    },
    { upsert: true, returnDocument: "after" }
  );

  const trial = result?.value || result;
  if (!trial) {
    throw new Error("one_week_free_trial_upsert_failed");
  }
  const startedAt = new Date(trial.trial_started_at || trial.first_seen_at || now);
  const hardExpiresAt = new Date(startedAt.getTime() + TRIAL_MS);
  const expired = now.getTime() > hardExpiresAt.getTime();

  if (expired) {
    await trials.updateOne(
      { _id: trial._id },
      {
        $set: {
          status: "expired",
          expires_at: hardExpiresAt,
          blocked_at: now,
          blocked_reason: "one_week_free_trial_expired",
          updated_at: now,
        },
        $inc: { blocked_count: 1 },
      }
    );

    const message =
      "무료 체험 기간 1주일이 만료되었습니다. 지속적인 시그널 연동 및 틱 차트 트레이딩을 원하시면 공식 홈페이지(magicindicatorglobal.com)에서 정규 과금 플랜을 확인하세요.";

    await writeAudit(db, {
      event: "one_week_free_trial_expired",
      blocked: true,
      subject_key: identity.subject_key,
      trv_id: identity.trv_id,
      mt5_account: identity.mt5_account,
      mt5_server: identity.mt5_server,
      trial_started_at: startedAt,
      expires_at: hardExpiresAt,
      message,
      payload_event: payload.event || null,
      magic_signal: payload.magic_signal || null,
      ip: reqMeta.ip || null,
      user_agent: reqMeta.user_agent || null,
    });

    return { ok: false, status: 403, error: "무료 체험 기간 1주일이 만료되었습니다.", message };
  }

  await writeAudit(db, {
    event: "one_week_free_trial_accepted",
    blocked: false,
    subject_key: identity.subject_key,
    trv_id: identity.trv_id,
    mt5_account: identity.mt5_account,
    mt5_server: identity.mt5_server,
    trial_started_at: startedAt,
    expires_at: hardExpiresAt,
    payload_event: payload.event || null,
    magic_signal: payload.magic_signal || null,
    license_pack: payload.license_pack || null,
    tickerid: payload.tickerid || null,
    ip: reqMeta.ip || null,
    user_agent: reqMeta.user_agent || null,
  });

  return {
    ok: true,
    status: 200,
    trial: {
      subject_key: identity.subject_key,
      trv_id: identity.trv_id,
      mt5_account: identity.mt5_account,
      mt5_server: identity.mt5_server,
      trial_started_at: startedAt,
      expires_at: hardExpiresAt,
    },
  };
}

export function makeOneWeekFreeTrialMiddleware(db) {
  return async function oneWeekFreeTrialMiddleware(req, res, next) {
    try {
      const payload = parseWebhookPayload(req.body);
      req.webhookPayload = payload;
      const decision = await checkOneWeekFreeTrial(db, payload, {
        ip: req.ip || req.socket?.remoteAddress,
        user_agent: req.headers["user-agent"],
      });

      if (!decision.ok) {
        return res.status(decision.status).json({
          ok: false,
          error: decision.error,
          message: decision.message,
        });
      }

      req.oneWeekFreeTrial = decision.trial;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
