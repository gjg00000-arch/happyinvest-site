import { createClient } from "redis";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const TRIAL_MS = THREE_MONTHS_MS;
const MS_ONE_DAY = 24 * 60 * 60 * 1000;

export const SIGNAL_WEBHOOK_EVENTS_COLLECTION = "signal_webhook_events";
export const USERS_COLLECTION = "users";
const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
const ONE_WEEK_LICENSE_PACKS = new Set([
  "dmt_free_3month",
  "dmt_free_1week",
]);
const ONE_WEEK_DURATION_LICENSE_PACKS = new Set(["dmt_free_1week"]);
const THREE_MONTH_DURATION_LICENSE_PACKS = new Set(["dmt_free_3month"]);
const ONE_MONTH_EVENT_LICENSE_PACKS = new Set(["dodam_magictrading_1monthevent"]);
const MULTICHART_FIXED_LICENSE_PACKS = new Set(["dodam_magictrading_multichart_fixed"]);
const PERMANENT_LICENSE_PACKS = new Set(["dodam_triple_momentum_panel_permanent"]);
const MULTICHART_UNLIMITED_LIMIT = 999;
const EXPECTED_SECURE_TOKEN = process.env.TRIAL_WEBHOOK_SECURE_TOKEN || "dmt_free_auth_9823f71a";
const PERMANENT_SECURE_TOKEN = process.env.PERMANENT_WEBHOOK_SECURE_TOKEN || "dmt_permanent_auth_7712a";
const PAYPAL_FREE_1W_PLAN_ID = process.env.PAYPAL_FREE_1W_PLAN_ID || "";
const PAYPAL_FREE_3M_PLAN_ID = process.env.PAYPAL_FREE_3M_PLAN_ID || "";
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const EXPECTED_SECURE_TOKENS = new Set(
  String(process.env.TRIAL_WEBHOOK_SECURE_TOKENS || EXPECTED_SECURE_TOKEN)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
);
const DEBOUNCE_TTL_MS = Number(process.env.TRIAL_WEBHOOK_DEBOUNCE_MS || 5000);
const REDIS_URL = process.env.TRIAL_WEBHOOK_REDIS_URL || process.env.REDIS_URL || "";
const LICENSE_ALERT_WEBHOOK_URL = process.env.LICENSE_ALERT_WEBHOOK_URL || "";
const LICENSE_ALERT_WEBHOOK_TOKEN = process.env.LICENSE_ALERT_WEBHOOK_TOKEN || "";
const EMAIL_WARNING_WEBHOOK_URL = process.env.EMAIL_WARNING_WEBHOOK_URL || "";
const EMAIL_WARNING_WEBHOOK_TOKEN = process.env.EMAIL_WARNING_WEBHOOK_TOKEN || "";
const MT5_PUSH_WEBHOOK_URL = process.env.MT5_PUSH_WEBHOOK_URL || "";
const MT5_PUSH_WEBHOOK_TOKEN = process.env.MT5_PUSH_WEBHOOK_TOKEN || "";
const TRADINGVIEW_INVITE_REVOKE_URL = process.env.TRADINGVIEW_INVITE_REVOKE_URL || "";
const TRADINGVIEW_INVITE_ADD_URL = process.env.TRADINGVIEW_INVITE_ADD_URL || "";
const TRADINGVIEW_INVITE_TOKEN = process.env.TRADINGVIEW_INVITE_TOKEN || process.env.TRADINGVIEW_INVITE_REVOKE_TOKEN || "";
const TRADINGVIEW_INVITE_SCRIPT_ID =
  process.env.TRADINGVIEW_INVITE_SCRIPT_ID || "Dodam_MagicTrading_MultiChart_Fixed";
const TRADINGVIEW_INVITE_SCRIPT_IDS = String(process.env.TRADINGVIEW_INVITE_SCRIPT_IDS || TRADINGVIEW_INVITE_SCRIPT_ID)
  .split(",")
  .map((scriptId) => scriptId.trim())
  .filter(Boolean);
const TRADINGVIEW_WEBHOOK_IPS = new Set(
  String(
    process.env.TRADINGVIEW_WEBHOOK_IP_ALLOWLIST ||
      "52.89.214.238,34.212.75.30,54.112.49.92,54.112.51.100"
  )
    .split(",")
    .map((ip) => normalizeIp(ip))
    .filter(Boolean)
);
const webhookDebounceCache = new Map();
let redisClientPromise = null;

function cleanId(value, max = 96) {
  const s = String(value || "").trim();
  if (!s || s.includes("{{") || s.includes("}}")) return "";
  if (!/^[a-zA-Z0-9._:@-]{1,96}$/.test(s)) return "";
  return s.slice(0, max);
}

function normalizeIp(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  return s.startsWith("::ffff:") ? s.slice(7) : s;
}

function requestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((ip) => normalizeIp(ip))
    .find(Boolean);
  return forwardedFor || normalizeIp(req.ip || req.socket?.remoteAddress || "");
}

function isAllowedTradingViewIp(req) {
  if (TRADINGVIEW_WEBHOOK_IPS.size === 0) return true;
  return TRADINGVIEW_WEBHOOK_IPS.has(requestIp(req));
}

function hasExpectedSecureToken(payload = {}) {
  const token = String(payload.secure_token || payload.secureToken || "").trim();
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  if (PERMANENT_LICENSE_PACKS.has(licensePack)) return token === PERMANENT_SECURE_TOKEN;
  return token !== PERMANENT_SECURE_TOKEN && EXPECTED_SECURE_TOKENS.has(token);
}

function debounceKey(tvId, payload = {}) {
  const tickerid = String(payload.tickerid || payload.ticker || "").trim().toLowerCase();
  return `webhook:${tvId}:${tickerid || "unknown"}`;
}

async function redisClient() {
  if (!REDIS_URL) return null;
  if (!redisClientPromise) {
    const client = createClient({ url: REDIS_URL });
    client.on("error", (err) => {
      console.warn("trial-webhook redis error", err?.message || err);
    });
    redisClientPromise = client.connect().then(() => client);
  }
  return redisClientPromise;
}

function shouldDropDuplicateWebhookInMemory(key, nowMs = Date.now()) {
  if (!DEBOUNCE_TTL_MS || DEBOUNCE_TTL_MS < 1) return false;
  const previousExpiresAt = webhookDebounceCache.get(key) || 0;
  if (previousExpiresAt > nowMs) return true;
  webhookDebounceCache.set(key, nowMs + DEBOUNCE_TTL_MS);

  for (const [cacheKey, expiresAt] of webhookDebounceCache) {
    if (expiresAt <= nowMs) webhookDebounceCache.delete(cacheKey);
  }
  return false;
}

async function shouldDropDuplicateWebhook(tvId, payload = {}, nowMs = Date.now()) {
  if (!DEBOUNCE_TTL_MS || DEBOUNCE_TTL_MS < 1) return false;
  const key = debounceKey(tvId, payload);
  const redis = await redisClient();
  if (redis) {
    const result = await redis.set(key, "1", { NX: true, PX: DEBOUNCE_TTL_MS });
    return result !== "OK";
  }
  return shouldDropDuplicateWebhookInMemory(key, nowMs);
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

function freeTrialDurationMsForPayload(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  if (ONE_WEEK_DURATION_LICENSE_PACKS.has(licensePack)) return ONE_WEEK_MS;
  if (THREE_MONTH_DURATION_LICENSE_PACKS.has(licensePack)) return THREE_MONTHS_MS;
  return THREE_MONTHS_MS;
}

function freeTrialPlanLabelForPayload(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  return ONE_WEEK_DURATION_LICENSE_PACKS.has(licensePack) ? "1주일" : "3개월";
}

export function isOneMonthEventLicensePack(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  return ONE_MONTH_EVENT_LICENSE_PACKS.has(licensePack);
}

export function isMultiChartFixedLicensePack(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  return MULTICHART_FIXED_LICENSE_PACKS.has(licensePack);
}

export function isPermanentLicensePack(payload = {}) {
  const licensePack = String(payload.license_pack || payload.licensePack || "").trim().toLowerCase();
  return PERMANENT_LICENSE_PACKS.has(licensePack);
}

export function calculateMultiChartFixedBilling(chartCount) {
  const requestedCharts = Math.max(1, Math.floor(Number(chartCount || 1)));
  if (requestedCharts >= 20) {
    return {
      tier_type: "MultiChart_Fixed",
      requested_charts: requestedCharts,
      active_charts_limit: MULTICHART_UNLIMITED_LIMIT,
      unlimited: true,
      monthly_usd: 19999,
    };
  }

  return {
    tier_type: "MultiChart_Fixed",
    requested_charts: requestedCharts,
    active_charts_limit: requestedCharts,
    unlimited: false,
    monthly_usd: 4999 + (requestedCharts - 1) * 500,
  };
}

export function buildMultiChartFixedUserPatch({ chartCount = 1, paidAt = new Date() } = {}) {
  const billing = calculateMultiChartFixedBilling(chartCount);
  const paidDate = coerceDate(paidAt) || new Date();
  const expiresAt = new Date(paidDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    billing,
    update: {
      $set: {
        tier_type: "MultiChart_Fixed",
        active_charts_limit: billing.active_charts_limit,
        expires_at: expiresAt,
        status: "active",
        multichart_monthly_usd: billing.monthly_usd,
        multichart_requested_charts: billing.requested_charts,
        multichart_unlimited: billing.unlimited,
        paid_at: paidDate,
        updated_at: new Date(),
      },
      $setOnInsert: {
        current_registered_tickers: [],
        created_at: new Date(),
      },
    },
  };
}

function cleanEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.slice(0, 254) : "";
}

function parseMaybeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeLicensePack(value) {
  return String(value || "").trim();
}

function licensePackFromPaymentIdentifier(value) {
  const s = String(value || "").trim();
  const l = s.toLowerCase();
  if (!s) return "";
  if (l === "event_1w_free" || l === "dmt_free_1week" || (PAYPAL_FREE_1W_PLAN_ID && s === PAYPAL_FREE_1W_PLAN_ID)) {
    return "DMT_Free_1Week";
  }
  if (l === "event_3m_free" || l === "dmt_free_3month" || (PAYPAL_FREE_3M_PLAN_ID && s === PAYPAL_FREE_3M_PLAN_ID)) {
    return "DMT_Free_3Month";
  }
  if (l === "event_1m_magictrading" || l === "dodam_magictrading_1monthevent") {
    return "Dodam_MagicTrading_1MonthEvent";
  }
  if (
    l === "regular_default" ||
    l === "reg_magictrading" ||
    l === "dodam_magictrading_multichart_fixed" ||
    l.startsWith("whop_trv_") ||
    l.startsWith("whop_mt5_") ||
    l.startsWith("mql_mt5_")
  ) {
    return "Dodam_MagicTrading_MultiChart_Fixed";
  }
  return s;
}

function extractPaymentFields(payload = {}, provider = "unknown") {
  const resource = payload.resource || payload.data?.resource || {};
  const customJson = parseMaybeJsonObject(
    payload.custom || payload.custom_id || payload.data?.custom || resource.custom || resource.custom_id
  );
  const metadata = {
    ...parseMaybeJsonObject(payload.metadata || payload.data?.metadata),
    ...parseMaybeJsonObject(payload.custom_fields),
    ...parseMaybeJsonObject(resource.metadata),
    ...customJson,
  };
  const product = payload.product || payload.plan || payload.item || payload.data?.product || payload.data?.plan || resource.plan || {};
  const rawLicensePack = normalizeLicensePack(
    payload.license_pack ||
      payload.licensePack ||
      metadata.license_pack ||
      metadata.licensePack ||
      payload.product_id ||
      payload.productId ||
      payload.plan_id ||
      payload.planId ||
      payload.plan_code ||
      payload.planCode ||
      resource.plan_id ||
      resource.planId ||
      resource.custom_id ||
      product.license_pack ||
      product.id ||
      product.sku ||
      product.name
  );
  const licensePack = licensePackFromPaymentIdentifier(rawLicensePack);
  const tvId = normalizeTvId(
    payload.tv_id ||
      payload.tvId ||
      payload.tradingview_username ||
      payload.tradingviewUsername ||
      metadata.tv_id ||
      metadata.tvId ||
      metadata.tradingview_username ||
      metadata.tradingviewUsername ||
      payload.data?.tv_id ||
      payload.data?.tradingview_username
  );
  const email = cleanEmail(
    payload.email ||
      payload.user_email ||
      payload.customer_email ||
      payload.payer_email ||
      resource.subscriber?.email_address ||
      resource.subscriber?.payer_id ||
      payload.data?.email ||
      payload.data?.customer_email ||
      metadata.email
  );
  const chartCount = Number(
    payload.chart_count ||
      payload.chartCount ||
      payload.quantity ||
      payload.qty ||
      metadata.chart_count ||
      metadata.chartCount ||
      metadata.quantity ||
      1
  );
  const eventType = String(payload.event || payload.type || payload.event_type || payload.payment_status || "").toLowerCase();
  const amount = Number(
    payload.amount ||
      payload.total ||
      payload.price ||
      payload.data?.amount ||
      payload.data?.total ||
      resource.billing_info?.last_payment?.amount?.value ||
      resource.amount?.value ||
      0
  );
  const subscriptionId = cleanId(
    payload.subscription_id ||
      payload.subscriptionId ||
      payload.billing_subscription_id ||
      payload.paypal_subscription_id ||
      resource.id ||
      resource.subscription_id ||
      resource.billing_agreement_id ||
      ""
  );
  return {
    provider,
    licensePack,
    licensePackLower: licensePack.toLowerCase(),
    tvId,
    email,
    chartCount,
    eventType,
    amount,
    subscriptionId,
  };
}

function paymentLooksSuccessful(fields) {
  const eventType = fields.eventType;
  if (!eventType) return true;
  return [
    "payment.success",
    "payment_succeeded",
    "checkout.completed",
    "checkout_completed",
    "subscription.created",
    "subscription.activated",
    "subscription.approved",
    "billing.subscription.created",
    "billing.subscription.activated",
    "completed",
    "paid",
    "sale.completed",
    "capture.completed",
  ].some((token) => eventType.includes(token));
}

function normalizedValues(...values) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function userIsActive(user = {}) {
  const statuses = normalizedValues(
    user.status,
    user.account_status,
    user.subscription_status,
    user.plan_status,
    user.dodam_status,
    user.magictrading_status
  );
  return statuses.includes("active") || statuses.includes("정상") || statuses.includes("활성");
}

function userLookupFilter({ tv_id, tvId, tradingview_username, email } = {}) {
  const normalizedTvId = normalizeTvId(tv_id || tvId || tradingview_username);
  const normalizedEmail = cleanEmail(email);
  const or = [];
  if (normalizedTvId) {
    or.push({ trv_id: normalizedTvId }, { tv_id: normalizedTvId }, { tradingview_username: normalizedTvId });
  }
  if (normalizedEmail) {
    or.push({ email: normalizedEmail }, { user_email: normalizedEmail }, { contact_email: normalizedEmail });
  }
  return or.length ? { $or: or } : null;
}

async function findUserByIdentity(db, identity = {}) {
  const filter = userLookupFilter(identity);
  if (!filter) return null;
  return db.collection(USERS_COLLECTION).findOne(filter, { collation: { locale: "en", strength: 2 } });
}

function userHasActiveBillablePlan(user = {}, now = new Date()) {
  if (!userIsActive(user)) return false;
  if (user.permanent_access === true) return true;
  const expiresAt = coerceDate(user.expires_at || user.expire_at);
  return !!expiresAt && expiresAt.getTime() > now.getTime();
}

function userIsActiveOneMonthEvent(user = {}, now = new Date()) {
  if (!userIsActive(user)) return false;
  const expiresAt = coerceDate(user.expires_at || user.expire_at);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return false;
  const values = normalizedValues(user.tier_type, user.plan_code, user.plan_sku, user.license_pack, user.last_license_pack);
  return values.some((value) =>
    ["onemonthevent", "dodam_magictrading_1monthevent", "event_1m_magictrading"].includes(value)
  );
}

export async function getUserEntitlementStatus(db, identity = {}) {
  const user = await findUserByIdentity(db, identity);
  const now = new Date();
  if (!user) {
    return { ok: true, status: 200, found: false, active_plan: false };
  }
  const activePlan = userHasActiveBillablePlan(user, now);
  return {
    ok: true,
    status: 200,
    found: true,
    active_plan: activePlan,
    already_active_plan: activePlan,
    user: {
      trv_id: user.trv_id || user.tv_id || user.tradingview_username || null,
      email: user.email || user.user_email || user.contact_email || null,
      status: user.status || null,
      tier_type: user.tier_type || null,
      plan_code: user.plan_code || null,
      expires_at: user.expires_at || user.expire_at || null,
      permanent_access: user.permanent_access === true,
      paypal_billing_status: user.paypal_billing_status || null,
      backendRegularPrepaidConfirmed: user.backendRegularPrepaidConfirmed === true,
      backend_regular_prepaid_confirmed: user.backend_regular_prepaid_confirmed === true,
    },
  };
}

export async function assertNoActivePlanForPayment(db, identity = {}) {
  const status = await getUserEntitlementStatus(db, identity);
  const requestedLicensePack = licensePackFromPaymentIdentifier(
    identity.license_pack || identity.licensePack || identity.plan_code || identity.planCode || ""
  ).toLowerCase();
  if (
    status.active_plan &&
    status.user &&
    requestedLicensePack === "dodam_magictrading_multichart_fixed" &&
    userIsActiveOneMonthEvent(status.user)
  ) {
    return {
      ok: true,
      status: 200,
      prepayment_allowed: true,
      reason: "active_one_month_event_can_prepay_multichart_fixed",
      entitlement: status.user,
    };
  }
  if (status.active_plan) {
    return {
      ok: false,
      status: 400,
      success: false,
      code: "ALREADY_ACTIVE_PLAN",
      message: "이미 가입되어 이용 중인 플랜 원장이 존재합니다. 중복 결제가 차단되었습니다.",
      entitlement: status.user,
    };
  }
  return { ok: true, status: 200 };
}

function userIsRegularMember(user = {}) {
  const values = normalizedValues(
    user.member_type,
    user.membership_type,
    user.membership_tier,
    user.grade,
    user.role,
    user.roles,
    user.plan_code,
    user.plan_sku,
    user.dodam_plan_code,
    user.dodam_plan_sku,
    user.magictrading_plan_code,
    user.magictrading_plan_sku,
    user.signup_plan_choice
  );
  return values.some((value) =>
    [
      "regular",
      "regular_default",
      "regular_member",
      "paid",
      "subscriber",
      "정회원",
      "event_1m_magictrading",
      "event_1m_usd",
      "1m_magictrading",
      "1m_premium",
      "dodam_magictrading_1monthevent",
      "multichart_fixed",
      "dodam_magictrading_multichart_fixed",
    ].includes(value)
  );
}

function userIsMultiChartFixed(user = {}) {
  const values = normalizedValues(
    user.tier_type,
    user.plan_code,
    user.plan_sku,
    user.dodam_plan_code,
    user.dodam_plan_sku,
    user.magictrading_plan_code,
    user.magictrading_plan_sku,
    user.license_pack,
    user.last_license_pack
  );
  return values.includes("multichart_fixed") || values.includes("dodam_magictrading_multichart_fixed");
}

function userIsRegularPermanent(user = {}) {
  const values = normalizedValues(
    user.tier_type,
    user.member_type,
    user.membership_type,
    user.membership_tier,
    user.grade,
    user.role,
    user.roles,
    user.plan_code,
    user.plan_sku,
    user.dodam_plan_code,
    user.dodam_plan_sku,
    user.magictrading_plan_code,
    user.magictrading_plan_sku,
    user.license_pack,
    user.last_license_pack
  );
  return values.some((value) =>
    [
      "regular_permanent",
      "permanent",
      "permanent_regular",
      "dodam_triple_momentum_panel_permanent",
    ].includes(value)
  );
}

function activeChartsLimit(user = {}) {
  const raw = Number(user.active_charts_limit);
  if (!Number.isFinite(raw) || raw < 1) return 0;
  return Math.floor(raw);
}

function chartKeyFromPayload(payload = {}) {
  const tickerid = String(payload.tickerid || payload.ticker || "").trim();
  if (!tickerid || tickerid.includes("{{") || tickerid.includes("}}")) return "";
  if (!/^[a-zA-Z0-9._:@!/+|=-]{1,160}$/.test(tickerid)) return "";
  return tickerid.toLowerCase();
}

function normalizedTickerList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => chartKeyFromPayload({ tickerid: item })).filter(Boolean))];
}

function userExpiresAt(user = {}) {
  return coerceDate(
    user.expires_at ||
      user.expire_at ||
      user.dodam_plan_expires_at ||
      user.plan_expires_at ||
      user.magictrading_expires_at ||
      user.subscription_expires_at ||
      user.access_until ||
      user.indicator_expires_at
  );
}

async function findRegularEventUserByTvId(db, tvId) {
  return db.collection(USERS_COLLECTION).findOne(
    {
      $or: [
        { trv_id: tvId },
        { tv_id: tvId },
        { tradingview_username: tvId },
        { tradingviewUsername: tvId },
        { "profile.tradingview_username": tvId },
        { "tradingview.username": tvId },
        { "integrations.tradingview_username": tvId },
        { "integrations.trv_id": tvId },
        { "licenses.trv_id": tvId },
        { "licenses.tv_id": tvId },
      ],
    },
    { collation: { locale: "en", strength: 2 } }
  );
}

async function haltMultiChartUserForLimitExceeded(
  db,
  user,
  { tvId, chartKey, tickerid, activeChartsLimit, registeredTickers, reason }
) {
  if (!user?._id) {
    return { ok: false, reason: "user_missing_for_limit_halt" };
  }

  const now = new Date();
  const alertResult = await sendLicenseLimitAlert(user, {
    tvId,
    activeChartsLimit,
    tickerid,
    chartKey,
  });
  const inviteDeleteResult = await triggerInviteOnlyAccess("delete", user, {
    tvId,
    reason,
  });

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: user._id },
    {
      $set: {
        status: "halted",
        halted_at: now,
        halted_at_kst: kstIso(now),
        halted_reason: reason,
        limit_blocked_at: now,
        limit_blocked_tickerid: tickerid,
        limit_blocked_chart_key: chartKey,
        limit_blocked_active_charts_limit: activeChartsLimit,
        limit_blocked_registered_tickers: registeredTickers,
        invite_delete_result: inviteDeleteResult,
        license_alert_result: alertResult,
        updated_at: now,
      },
    }
  );

  return {
    ok: true,
    status: "halted",
    alert_result: alertResult,
    invite_delete_result: inviteDeleteResult,
  };
}

async function checkMultiChartFixedEntitlement(db, tvId, payload, req) {
  const user = await findRegularEventUserByTvId(db, tvId);
  const now = new Date();
  const expiresAt = userExpiresAt(user || {});
  const chartKey = chartKeyFromPayload(payload);
  const limit = activeChartsLimit(user || {});
  const registeredTickers = normalizedTickerList(user?.current_registered_tickers);
  const alreadyRegistered = chartKey ? registeredTickers.includes(chartKey) : false;
  const unlimited = limit >= MULTICHART_UNLIMITED_LIMIT;

  const rejectionReason = !user
    ? "multichart_user_not_found"
    : !userIsActive(user)
      ? "multichart_user_not_active"
      : !userIsRegularMember(user)
        ? "regular_plan_required"
        : !userIsMultiChartFixed(user)
          ? "multichart_fixed_tier_required"
          : !expiresAt
            ? "multichart_missing_expires_at"
            : now.getTime() > expiresAt.getTime()
              ? "multichart_subscription_expired"
              : !chartKey
                ? "missing_or_invalid_tickerid"
                : !limit
                  ? "active_charts_limit_missing"
                  : !alreadyRegistered && !unlimited && registeredTickers.length >= limit
                    ? "active_charts_limit_exceeded"
                    : "";

  if (rejectionReason) {
    const limitExceeded = rejectionReason === "active_charts_limit_exceeded";
    const limitActions = limitExceeded
      ? await haltMultiChartUserForLimitExceeded(db, user, {
          tvId,
          chartKey,
          tickerid: payload.tickerid || payload.ticker || chartKey,
          activeChartsLimit: limit,
          registeredTickers,
          reason: rejectionReason,
        })
      : null;
    await writeAudit(db, {
      event: "multichart_fixed_entitlement_rejected",
      blocked: true,
      reason: rejectionReason,
      invite_revoke_required: limitExceeded,
      subject_key: `trv:${tvId}`,
      trv_id: tvId,
      chart_key: chartKey || null,
      active_charts_limit: limit || null,
      current_registered_tickers_count: registeredTickers.length,
      current_registered_tickers: registeredTickers,
      license_pack: payload.license_pack || null,
      tickerid: payload.tickerid || null,
      tf: payload.tf || null,
      limit_actions: limitActions,
      ip: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null,
    });
    return {
      ok: false,
      status: 403,
      error: rejectionReason,
      message:
        rejectionReason === "active_charts_limit_exceeded"
          ? "정회원 차트별 허용 개수를 초과하여 새 차트 활성화를 차단했습니다."
          : "정회원 차트별 정액제 접근권이 활성 상태가 아니거나 원장 정보가 부족합니다.",
    };
  }

  const registrationFilter = { _id: user._id };
  if (!alreadyRegistered && !unlimited) {
    registrationFilter.$or = [
      { current_registered_tickers: chartKey },
      { current_registered_tickers: { $exists: false } },
      { $expr: { $lt: [{ $size: { $ifNull: ["$current_registered_tickers", []] } }, limit] } },
    ];
  }

  const registrationResult = await db.collection(USERS_COLLECTION).updateOne(
    registrationFilter,
    {
      $set: {
        tier_type: "MultiChart_Fixed",
        status: "active",
        last_seen_at: now,
        last_seen_at_kst: kstIso(now),
        last_license_pack: payload.license_pack || null,
        last_tickerid: payload.tickerid || null,
        last_chart_key: chartKey,
        last_magic_signal: payload.magic_signal || null,
        last_event: payload.event || null,
        updated_at: now,
      },
      $addToSet: {
        current_registered_tickers: chartKey,
      },
    }
  );

  if (registrationResult.matchedCount === 0) {
    const limitActions = await haltMultiChartUserForLimitExceeded(db, user, {
      tvId,
      chartKey,
      tickerid: payload.tickerid || payload.ticker || chartKey,
      activeChartsLimit: limit,
      registeredTickers,
      reason: "active_charts_limit_exceeded_race_guard",
    });
    await writeAudit(db, {
      event: "multichart_fixed_entitlement_rejected",
      blocked: true,
      reason: "active_charts_limit_exceeded_race_guard",
      invite_revoke_required: true,
      subject_key: `trv:${tvId}`,
      trv_id: tvId,
      chart_key: chartKey,
      active_charts_limit: limit,
      current_registered_tickers_count: registeredTickers.length,
      limit_actions: limitActions,
      license_pack: payload.license_pack || null,
      tickerid: payload.tickerid || null,
      tf: payload.tf || null,
      ip: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null,
    });
    return {
      ok: false,
      status: 403,
      error: "active_charts_limit_exceeded",
      message: "정회원 차트별 허용 개수를 초과하여 새 차트 활성화를 차단했습니다.",
    };
  }

  const nextRegisteredTickers = alreadyRegistered ? registeredTickers : [...registeredTickers, chartKey];

  await writeAudit(db, {
    event: "multichart_fixed_entitlement_accepted",
    blocked: false,
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    source: USERS_COLLECTION,
    chart_key: chartKey,
    active_charts_limit: limit,
    unlimited,
    current_registered_tickers_count: nextRegisteredTickers.length,
    expires_at: expiresAt,
    license_pack: payload.license_pack || null,
    tickerid: payload.tickerid || null,
    tf: payload.tf || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    user_agent: req.headers["user-agent"] || null,
  });

  return {
    ok: true,
    status: 200,
    source: USERS_COLLECTION,
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    chart_key: chartKey,
    active_charts_limit: limit,
    current_registered_tickers_count: nextRegisteredTickers.length,
    expires_at: expiresAt,
  };
}

async function checkOneMonthEventEntitlement(db, tvId, payload, req) {
  const user = await findRegularEventUserByTvId(db, tvId);
  const now = new Date();
  const expiresAt = userExpiresAt(user || {});

  if (!user || !userIsActive(user) || !userIsRegularMember(user) || !expiresAt || now.getTime() > expiresAt.getTime()) {
    await writeAudit(db, {
      event: "one_month_event_entitlement_rejected",
      blocked: true,
      reason: !user
        ? "regular_user_not_found"
        : !userIsActive(user)
          ? "regular_user_not_active"
          : !userIsRegularMember(user)
            ? "regular_plan_required"
            : !expiresAt
              ? "regular_plan_missing_expires_at"
              : "regular_plan_expired",
      subject_key: `trv:${tvId}`,
      trv_id: tvId,
      license_pack: payload.license_pack || null,
      tickerid: payload.tickerid || null,
      ip: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null,
    });
    return {
      ok: false,
      status: 403,
      error: "regular_event_entitlement_required",
      message: "정회원 1달 이벤트 접근권이 활성 상태가 아니거나 만료되었습니다.",
    };
  }

  await writeAudit(db, {
    event: "one_month_event_entitlement_accepted",
    blocked: false,
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    source: USERS_COLLECTION,
    expires_at: expiresAt,
    license_pack: payload.license_pack || null,
    tickerid: payload.tickerid || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    user_agent: req.headers["user-agent"] || null,
  });

  return {
    ok: true,
    status: 200,
    source: USERS_COLLECTION,
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    expires_at: expiresAt,
  };
}

async function checkPermanentEntitlement(db, tvId, payload, req) {
  const user = await findRegularEventUserByTvId(db, tvId);
  const now = new Date();

  if (!user || !userIsActive(user) || (!userIsRegularPermanent(user) && !userIsRegularMember(user))) {
    await writeAudit(db, {
      event: "permanent_entitlement_rejected",
      blocked: true,
      reason: !user
        ? "permanent_user_not_found"
        : !userIsActive(user)
          ? "permanent_user_not_active"
          : "regular_permanent_required",
      subject_key: `trv:${tvId}`,
      trv_id: tvId,
      license_pack: payload.license_pack || null,
      tickerid: payload.tickerid || null,
      tf: payload.tf || null,
      ip: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null,
    });
    return {
      ok: false,
      status: 403,
      error: "permanent_entitlement_required",
      message: "정규플랜 영구제공 접근권이 활성 상태가 아닙니다.",
    };
  }

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: user._id },
    {
      $set: {
        tier_type: user.tier_type || "Regular_Permanent",
        permanent_access: true,
        last_seen_at: now,
        last_seen_at_kst: kstIso(now),
        last_license_pack: payload.license_pack || null,
        last_tickerid: payload.tickerid || null,
        last_magic_signal: payload.magic_signal || null,
        last_event: payload.event || null,
        updated_at: now,
      },
    }
  );

  await writeAudit(db, {
    event: "permanent_entitlement_accepted",
    blocked: false,
    reason: "expires_at_check_skipped_for_permanent",
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    source: USERS_COLLECTION,
    permanent_access: true,
    license_pack: payload.license_pack || null,
    tickerid: payload.tickerid || null,
    tf: payload.tf || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    user_agent: req.headers["user-agent"] || null,
  });

  return {
    ok: true,
    status: 200,
    source: USERS_COLLECTION,
    subject_key: `trv:${tvId}`,
    trv_id: tvId,
    permanent_access: true,
  };
}

export async function applyPaidPlanFromWebhook(db, payload = {}, provider = "unknown", reqMeta = {}) {
  const fields = extractPaymentFields(payload, provider);
  if (!paymentLooksSuccessful(fields)) {
    return { ok: true, status: 202, ignored: true, reason: "payment_not_successful", event_type: fields.eventType };
  }
  if (!fields.tvId && !fields.email) {
    return { ok: false, status: 400, error: "missing_tv_id_or_email" };
  }

  if (ONE_WEEK_LICENSE_PACKS.has(fields.licensePackLower)) {
    if (!fields.tvId) return { ok: false, status: 400, error: "missing_tv_id_for_free_trial_subscription" };
    return applyFreeTrialSignup(
      db,
      {
        license_pack: fields.licensePack,
        tv_id: fields.tvId,
        email: fields.email || undefined,
        paypal_subscription_id: fields.subscriptionId || payload.paypal_subscription_id || payload.subscription_id || undefined,
        provider,
        payment_amount: fields.amount,
        payment_event_type: fields.eventType,
      },
      reqMeta
    );
  }

  const now = new Date();
  const subjectKey = fields.tvId ? `trv:${fields.tvId}` : `email:${fields.email}`;
  const userFilter = fields.tvId
    ? { $or: [{ trv_id: fields.tvId }, { tv_id: fields.tvId }, { tradingview_username: fields.tvId }] }
    : { email: fields.email };
  const existingUser = await findUserByIdentity(db, { tv_id: fields.tvId, email: fields.email });
  const isRegularPrepayFromEvent =
    fields.licensePackLower === "dodam_magictrading_multichart_fixed" && userIsActiveOneMonthEvent(existingUser, now);
  const previousExpiresAt = coerceDate(existingUser?.expires_at || existingUser?.expire_at);
  const expiresAt =
    isRegularPrepayFromEvent && previousExpiresAt
      ? new Date(previousExpiresAt.getTime() + MS_30_DAYS + MS_ONE_DAY)
      : new Date(now.getTime() + MS_30_DAYS);

  let planPatch = null;
  let planKind = "";
  let billing = null;
  let prepayPaypalCancelResult = null;

  if (fields.licensePackLower === "dodam_magictrading_1monthevent") {
    planKind = "one_month_event";
    planPatch = {
      $set: {
        subject_key: subjectKey,
        ...(fields.tvId ? { trv_id: fields.tvId, tv_id: fields.tvId, tradingview_username: fields.tvId } : {}),
        ...(fields.email ? { email: fields.email } : {}),
        username: fields.tvId || fields.email || subjectKey,
        tier_type: "OneMonthEvent",
        license_pack: "Dodam_MagicTrading_1MonthEvent",
        last_license_pack: "Dodam_MagicTrading_1MonthEvent",
        plan_code: "Dodam_MagicTrading_1MonthEvent",
        plan_sku: "Dodam_MagicTrading_1MonthEvent",
        status: "active",
        expires_at: expiresAt,
        backendRegularPrepaidConfirmed: false,
        backend_regular_prepaid_confirmed: false,
        paid_at: now,
        payment_provider: provider,
        payment_amount: fields.amount || null,
        ...(fields.subscriptionId ? { paypal_subscription_id: fields.subscriptionId, paypal_billing_status: "active" } : {}),
        updated_at: now,
      },
      $setOnInsert: { created_at: now },
    };
  } else if (fields.licensePackLower === "dodam_magictrading_multichart_fixed") {
    planKind = isRegularPrepayFromEvent ? "multichart_fixed_prepay_from_event" : "multichart_fixed";
    const built = buildMultiChartFixedUserPatch({ chartCount: fields.chartCount, paidAt: now });
    billing = built.billing;
    const update = built.update;
    if (
      isRegularPrepayFromEvent &&
      existingUser?.paypal_subscription_id &&
      !payload.skip_existing_paypal_cancel &&
      existingUser.paypal_subscription_id !== fields.subscriptionId
    ) {
      prepayPaypalCancelResult = await cancelPaypalSubscription(
        existingUser.paypal_subscription_id,
        "Regular plan prepayment completed; cancel existing event/free PayPal schedule to prevent double billing."
      );
    }
    planPatch = {
      $set: {
        ...update.$set,
        expires_at: expiresAt,
        subject_key: subjectKey,
        ...(fields.tvId ? { trv_id: fields.tvId, tv_id: fields.tvId, tradingview_username: fields.tvId } : {}),
        ...(fields.email ? { email: fields.email } : {}),
        username: fields.tvId || fields.email || subjectKey,
        license_pack: "Dodam_MagicTrading_MultiChart_Fixed",
        last_license_pack: "Dodam_MagicTrading_MultiChart_Fixed",
        plan_code: "Dodam_MagicTrading_MultiChart_Fixed",
        plan_sku: "Dodam_MagicTrading_MultiChart_Fixed",
        regular_prepay_from_event: isRegularPrepayFromEvent,
        ...(isRegularPrepayFromEvent
          ? {
              backendRegularPrepaidConfirmed: true,
              backend_regular_prepaid_confirmed: true,
              previous_event_expires_at: previousExpiresAt,
              regular_prepay_bonus_days: 1,
              regular_prepay_extension_days: 31,
              regular_prepay_applied_at: now,
            }
          : {
              backendRegularPrepaidConfirmed: false,
              backend_regular_prepaid_confirmed: false,
            }),
        ...(prepayPaypalCancelResult ? { paypal_cancel_result: prepayPaypalCancelResult } : {}),
        payment_provider: provider,
        payment_amount: fields.amount || billing.monthly_usd,
        ...(fields.subscriptionId ? { paypal_subscription_id: fields.subscriptionId, paypal_billing_status: "active" } : {}),
      },
      $setOnInsert: update.$setOnInsert,
    };
  } else {
    return { ok: false, status: 400, error: "unsupported_paid_license_pack", license_pack: fields.licensePack };
  }

  const result = await db.collection(USERS_COLLECTION).findOneAndUpdate(userFilter, planPatch, {
    upsert: true,
    returnDocument: "after",
    collation: { locale: "en", strength: 2 },
  });
  const user = result?.value || result;
  const inviteAddResult = fields.tvId
    ? await triggerInviteOnlyAccess("add", user, { tvId: fields.tvId, reason: `paid_${planKind}_webhook` })
    : { ok: true, skipped: true, reason: "missing_tv_id" };
  const prepayUpgradeAlertResult = isRegularPrepayFromEvent
    ? await sendRegularPrepayUpgradeAlert(user, {
        tvId: fields.tvId || user?.trv_id || user?.tv_id || user?.tradingview_username || "",
        newExpiresAt: expiresAt,
        previousExpiresAt,
        billing,
      })
    : null;

  await writeAudit(db, {
    event: "paid_plan_webhook_applied",
    blocked: false,
    provider,
    plan_kind: planKind,
    license_pack: fields.licensePack,
    subject_key: subjectKey,
    trv_id: fields.tvId || null,
    email: fields.email || null,
    expires_at: expiresAt,
    previous_expires_at: previousExpiresAt || null,
    regular_prepay_from_event: isRegularPrepayFromEvent,
    paypal_cancel_result: prepayPaypalCancelResult,
    invite_add_result: inviteAddResult,
    prepay_upgrade_alert_result: prepayUpgradeAlertResult,
    ip: reqMeta.ip || null,
    user_agent: reqMeta.user_agent || null,
  });

  return {
    ok: true,
    status: 200,
    plan_kind: planKind,
    trv_id: fields.tvId || null,
    expires_at: expiresAt,
    regular_prepay_from_event: isRegularPrepayFromEvent,
    previous_expires_at: previousExpiresAt || null,
    paypal_cancel_result: prepayPaypalCancelResult,
    invite_add_result: inviteAddResult,
    prepay_upgrade_alert_result: prepayUpgradeAlertResult,
  };
}

async function paypalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { ok: false, skipped: true, reason: "paypal_api_credentials_not_configured" };
  }
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    return { ok: false, status: response.status, error: "paypal_oauth_failed", body: json };
  }
  return { ok: true, access_token: json.access_token };
}

export async function cancelPaypalSubscription(subscriptionId, reason = "Manual payment completed through Dodam direct billing.") {
  const cleanSubscriptionId = cleanId(subscriptionId, 128);
  if (!cleanSubscriptionId) return { ok: true, skipped: true, reason: "missing_paypal_subscription_id" };
  const token = await paypalAccessToken();
  if (!token.ok) return token;
  const response = await fetch(
    `${PAYPAL_API_BASE}/v1/billing/subscriptions/${encodeURIComponent(cleanSubscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    subscription_id: cleanSubscriptionId,
    body: text.slice(0, 2000),
  };
}

export async function applyManualPaymentApproval(db, payload = {}, provider = "manual", reqMeta = {}) {
  const tvId = normalizeTvId(payload.tv_id || payload.tvId || payload.tradingview_username);
  const email = cleanEmail(payload.email || payload.user_email || payload.customer_email);
  const user = await findUserByIdentity(db, { tv_id: tvId, email });
  const paypalSubscriptionId =
    cleanId(payload.paypal_subscription_id || payload.subscription_id || user?.paypal_subscription_id || "", 128) || "";
  const cancelResult = await cancelPaypalSubscription(
    paypalSubscriptionId,
    `${provider} payment approved; cancel PayPal schedule to prevent double billing.`
  );

  const licensePack = licensePackFromPaymentIdentifier(
    payload.license_pack || payload.licensePack || payload.plan_code || payload.planCode || "Dodam_MagicTrading_1MonthEvent"
  );
  const decision = await applyPaidPlanFromWebhook(
    db,
    {
      ...payload,
      provider,
      skip_existing_paypal_cancel: true,
      event_type: payload.event_type || "payment.success",
      license_pack: licensePack,
      tv_id: tvId || undefined,
      email: email || undefined,
    },
    provider,
    reqMeta
  );
  if (!decision.ok) return decision;

  const filter = userLookupFilter({ tv_id: tvId, email });
  if (filter) {
    const now = new Date();
    await db.collection(USERS_COLLECTION).updateOne(
      filter,
      {
        $set: {
          paypal_billing_status: cancelResult.ok ? "cancelled" : "cancel_requested_failed",
          paypal_cancelled_at: cancelResult.ok ? now : null,
          paypal_cancel_result: cancelResult,
          manual_payment_provider: provider,
          manual_payment_approved_at: now,
          updated_at: now,
        },
      },
      { collation: { locale: "en", strength: 2 } }
    );
  }

  await writeAudit(db, {
    event: "manual_payment_approved",
    blocked: false,
    provider,
    license_pack: licensePack,
    trv_id: tvId || null,
    email: email || null,
    paypal_cancel_result: cancelResult,
    paid_plan_result: decision,
    ip: reqMeta.ip || null,
    user_agent: reqMeta.user_agent || null,
  });

  return {
    ...decision,
    manual_payment_provider: provider,
    paypal_cancel_result: cancelResult,
  };
}

export async function applyFreeTrialSignup(db, payload = {}, reqMeta = {}) {
  if (!isOneWeekFreeLicensePack(payload)) {
    return { ok: false, status: 400, error: "unsupported_free_trial_license_pack" };
  }

  const identity = extractTrialIdentity(payload);
  if (!identity?.trv_id) {
    return { ok: false, status: 400, error: "missing_or_invalid_tv_id" };
  }

  const now = new Date();
  const trialMs = freeTrialDurationMsForPayload(payload);
  const trialPlanLabel = freeTrialPlanLabelForPayload(payload);
  const expireAt = new Date(now.getTime() + trialMs);

  const result = await db.collection(USERS_COLLECTION).findOneAndUpdate(
    {
      $or: [
        { trv_id: identity.trv_id },
        { tv_id: identity.trv_id },
        { tradingview_username: identity.trv_id },
      ],
    },
    {
      $set: {
        username: payload.username || payload.name || identity.trv_id,
        subject_key: identity.subject_key,
        trv_id: identity.trv_id,
        tv_id: identity.trv_id,
        tradingview_username: identity.trv_id,
        ...(payload.email ? { email: cleanEmail(payload.email) || payload.email } : {}),
        membership_type: "associate",
        tier_type: "FreeTrialAssociate",
        license_pack: payload.license_pack || null,
        plan_code: payload.license_pack || null,
        plan_sku: payload.license_pack || null,
        last_license_pack: payload.license_pack || null,
        status: "active",
        free_trial_license_pack: payload.license_pack || null,
        free_trial_plan_label: trialPlanLabel,
        paypal_zero_dollar_verified: true,
        paypal_zero_dollar_verified_at: now,
        ...(payload.paypal_subscription_id || payload.subscription_id
          ? {
              paypal_subscription_id: payload.paypal_subscription_id || payload.subscription_id,
              paypal_billing_status: "active",
            }
          : {}),
        backendRegularPrepaidConfirmed: false,
        backend_regular_prepaid_confirmed: false,
        started_at: now,
        started_at_kst: kstIso(now),
        trial_started_at: now,
        expires_at: expireAt,
        expire_at: expireAt,
        expire_at_kst: kstIso(expireAt),
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true, returnDocument: "after", collation: { locale: "en", strength: 2 } }
  );
  const user = result?.value || result;
  const inviteAddResult = await triggerInviteOnlyAccess("add", user, {
    tvId: identity.trv_id,
    reason: `free_trial_${trialPlanLabel}_signup`,
  });

  await writeAudit(db, {
    event: "free_trial_signup_applied",
    blocked: false,
    subject_key: identity.subject_key,
    trv_id: identity.trv_id,
    license_pack: payload.license_pack || null,
    trial_plan_label: trialPlanLabel,
    expires_at: expireAt,
    invite_add_result: inviteAddResult,
    ip: reqMeta.ip || null,
    user_agent: reqMeta.user_agent || null,
  });

  return {
    ok: true,
    status: 200,
    user: {
      username: user?.username || identity.trv_id,
      tv_id: identity.trv_id,
      license_pack: payload.license_pack || null,
      status: "active",
      expires_at: expireAt,
      paypal_subscription_id: payload.paypal_subscription_id || payload.subscription_id || null,
      backendRegularPrepaidConfirmed: false,
    },
    trial: {
      subject_key: identity.subject_key,
      trv_id: identity.trv_id,
      trial_plan_label: trialPlanLabel,
      expires_at: expireAt,
    },
    invite_add_result: inviteAddResult,
  };
}

export async function resetMultiChartFixedSession(db, { tv_id, tvId, tradingview_username } = {}, reqMeta = {}) {
  const normalizedTvId = normalizeTvId(tv_id || tvId || tradingview_username);
  if (!normalizedTvId) {
    return {
      ok: false,
      status: 400,
      error: "missing_or_invalid_tv_id",
      message: "세션 초기화 대상 TradingView tv_id가 필요합니다.",
    };
  }

  const user = await findRegularEventUserByTvId(db, normalizedTvId);
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: "user_not_found",
      message: "해당 tv_id의 정회원 원장을 찾을 수 없습니다.",
    };
  }

  const now = new Date();
  const inviteAddResult = await triggerInviteOnlyAccess("add", user, {
    tvId: normalizedTvId,
    reason: "multichart_session_reset",
  });

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: user._id },
    {
      $set: {
        status: "active",
        current_registered_tickers: [],
        session_reset_at: now,
        session_reset_at_kst: kstIso(now),
        invite_add_result: inviteAddResult,
        halted_reason: null,
        limit_blocked_tickerid: null,
        limit_blocked_chart_key: null,
        updated_at: now,
      },
      $unset: {
        limit_blocked_registered_tickers: "",
      },
    }
  );

  await writeAudit(db, {
    event: "multichart_fixed_session_reset",
    blocked: false,
    subject_key: `trv:${normalizedTvId}`,
    trv_id: normalizedTvId,
    user_id: String(user._id),
    invite_add_result: inviteAddResult,
    ip: reqMeta.ip || null,
    user_agent: reqMeta.user_agent || null,
  });

  return {
    ok: true,
    status: 200,
    trv_id: normalizedTvId,
    current_registered_tickers: [],
    invite_add_result: inviteAddResult,
  };
}

export async function ensureOneWeekFreeTrialIndexes(db) {
  const events = db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION);
  await events.createIndex({ received_at: -1 }, { name: "signal_webhook_events_received_at" });
  await events.createIndex({ subject_key: 1, received_at: -1 }, { name: "signal_webhook_events_subject_received" });
  await events.createIndex({ trv_id: 1, received_at: 1 }, { name: "signal_webhook_events_trv_received" });
  await events.createIndex({ tv_id: 1, received_at: 1 }, { name: "signal_webhook_events_tv_received", sparse: true });

  const users = db.collection(USERS_COLLECTION);
  await users.createIndex({ subject_key: 1 }, { name: "users_subject_key", sparse: true });
  await users.createIndex({ trv_id: 1 }, { name: "users_trv_id", sparse: true });
  await users.createIndex({ tv_id: 1 }, { name: "users_tv_id", sparse: true });
  await users.createIndex({ tradingview_username: 1 }, { name: "users_tradingview_username", sparse: true });
  await users.createIndex({ license_pack: 1, status: 1, expires_at: 1 }, { name: "users_license_status_expires" });
  await users.createIndex({ paypal_subscription_id: 1 }, { name: "users_paypal_subscription_id", sparse: true });
  await users.createIndex(
    { trv_id: 1 },
    { name: "users_trv_id_ci", sparse: true, collation: { locale: "en", strength: 2 } }
  );
  await users.createIndex(
    { tv_id: 1 },
    { name: "users_tv_id_ci", sparse: true, collation: { locale: "en", strength: 2 } }
  );
  await users.createIndex(
    { tradingview_username: 1 },
    { name: "users_tradingview_username_ci", sparse: true, collation: { locale: "en", strength: 2 } }
  );
  await users.createIndex({ tier_type: 1, status: 1, expires_at: 1 }, { name: "users_tier_status_expires" });
  await users.createIndex({ current_registered_tickers: 1 }, { name: "users_current_registered_tickers", sparse: true });
}

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

function contactSnapshot(user = {}) {
  return {
    email: user.email || user.user_email || user.contact_email || null,
    phone_e164: user.phone_e164 || user.phone || user.mobile || null,
    telegram_chat_id: user.telegram_chat_id || user.telegram?.chat_id || null,
    kakao_user_id: user.kakao_user_id || user.kakao?.user_id || null,
  };
}

function limitExceededMessage({ tvId, activeChartsLimit, tickerid }) {
  return `[도담 라이선스 시스템 계정 알림]\n\n안녕하세요, 회원님.\n현재 사용 중이신 트레이딩뷰 계정(${tvId})에서 정회원 가입 플랜의 '허용 차트 개수 제한'을 초과하여 새로운 차트가 감지되었습니다.\n\n- 회원님 가입 한도: ${activeChartsLimit}개 차트\n- 실시간 감지된 새로운 종목: ${tickerid}\n\n정해진 한도를 초과함에 따라 회원님의 인바이트-온리(Invite-only) 사용 권한이 안전을 위해 일시 정지되었습니다.\n\n불이익을 막기 위해 사용하지 않는 차트 창을 종료하신 후, 공식 홈페이지 마이페이지에 접속하셔서 [실시간 세션 초기화] 버튼을 누르시면 지표 권한이 즉시 재활성화됩니다. 계속 초과하여 사용하실 경우 상위 무제한 요금제($19,999)로의 업그레이드가 필요합니다.`;
}

async function postJson(url, token, body) {
  if (!url) return { ok: true, dry_run: true, reason: "url_not_configured" };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 2000),
  };
}

async function sendLicenseLimitAlert(user, { tvId, activeChartsLimit, tickerid, chartKey }) {
  const message = limitExceededMessage({ tvId, activeChartsLimit, tickerid });
  return postJson(LICENSE_ALERT_WEBHOOK_URL, LICENSE_ALERT_WEBHOOK_TOKEN, {
    event: "multichart_limit_exceeded",
    channels: ["email", "sms", "telegram", "kakao"],
    contact: contactSnapshot(user),
    tv_id: tvId,
    tickerid,
    chart_key: chartKey,
    active_charts_limit: activeChartsLimit,
    message,
  });
}

function regularPrepayUpgradeMessage({ newExpiresAt }) {
  const expiresText = newExpiresAt ? new Date(newExpiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "원장 확인";
  return `[도담 시스템] 회원님, 정규 상위 플랜 선결제가 완료되었습니다! 혜택으로 [기존 잔여일 + 추가 30일 + 보너스 1일] 원장 동기화가 완료되었습니다. 새 만료일: ${expiresText}. 지금 즉시 트레이딩뷰 차트에서 기존 이벤트 지표를 삭제하시고, 상위 정회원 지표인 [Dodam_MagicTrading_Regular] 제품을 새로 추가하여 차트를 최적화 변경 후 사용하십시오.`;
}

async function sendSmtpEmail(to, subject, html) {
  if (!process.env.SMTP_HOST || !to) return { ok: true, skipped: true, reason: "smtp_not_configured_or_missing_email" };
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
  });
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
  return { ok: true, message_id: info.messageId || null };
}

async function sendRegularPrepayUpgradeAlert(user, { tvId, newExpiresAt, previousExpiresAt, billing }) {
  const contact = contactSnapshot(user);
  const message = regularPrepayUpgradeMessage({ newExpiresAt });
  const subject = "[도담 시스템] 정규 플랜 선결제 성공 및 상위 지표 교체 세팅 안내";
  const manualUrl = process.env.REGULAR_INDICATOR_SETUP_URL || "https://magicindicatorglobal.com/guide/usage-trv.html";
  const html = `<p>${message}</p><p><strong>기존 이벤트 만료일:</strong> ${
    previousExpiresAt ? new Date(previousExpiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"
  }</p><p><strong>가산 후 총 라이선스 만료일:</strong> ${
    newExpiresAt ? new Date(newExpiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"
  }</p><p><strong>정규 다중차트 지표:</strong> Dodam_MagicTrading_Regular / DMT_MULTI_FIXED</p><p><a href="${manualUrl}">정규 다중차트 지표 세팅 매뉴얼 열기</a></p>`;
  const common = {
    event: "regular_prepay_upgrade_completed",
    channels: ["sms", "kakao", "email", "mt5_push"],
    contact,
    tv_id: tvId || contact.tv_id || null,
    new_expires_at: newExpiresAt || null,
    previous_expires_at: previousExpiresAt || null,
    billing: billing || null,
    message,
  };
  const kakaoSms = await postJson(LICENSE_ALERT_WEBHOOK_URL, LICENSE_ALERT_WEBHOOK_TOKEN, common);
  const emailWebhook = await postJson(EMAIL_WARNING_WEBHOOK_URL, EMAIL_WARNING_WEBHOOK_TOKEN, {
    ...common,
    channel: "email",
    subject,
    html,
  });
  const smtp = await sendSmtpEmail(contact.email, subject, html);
  const mt5 = await postJson(MT5_PUSH_WEBHOOK_URL, MT5_PUSH_WEBHOOK_TOKEN, {
    ...common,
    channel: "mt5_push",
    mt5_login: user.mt5_account || user.mt5_login || user.mt5_id || null,
    mt5_server: user.mt5_server || user.server || null,
    message: "🚀 도담 정규플랜 선결제 확인! 보너스 +1일 제공 완료. 지금 트레이딩뷰 차트에서 상위 지표(Regular)로 변경하여 사용하십시오.",
  });
  return { kakaoSms, emailWebhook, smtp, mt5 };
}

async function triggerInviteOnlyAccess(action, user, { tvId, reason }) {
  const url = action === "add" ? TRADINGVIEW_INVITE_ADD_URL : TRADINGVIEW_INVITE_REVOKE_URL;
  const scriptIds = TRADINGVIEW_INVITE_SCRIPT_IDS.length ? TRADINGVIEW_INVITE_SCRIPT_IDS : [TRADINGVIEW_INVITE_SCRIPT_ID];
  const results = [];
  for (const scriptId of scriptIds) {
    results.push(
      await postJson(url, TRADINGVIEW_INVITE_TOKEN, {
        action: action === "add" ? "add_invite_only_access" : "delete_invite_only_access",
        script_id: scriptId,
        tv_id: tvId,
        user_id: String(user?._id || ""),
        reason,
      })
    );
  }
  return {
    ok: results.every((result) => result.ok),
    action,
    tv_id: tvId,
    script_ids: scriptIds,
    results,
  };
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

function expireAtFromRecord(record, startedAt, trialMs = TRIAL_MS) {
  return (
    coerceDate(record?.expire_at || record?.expires_at || record?.expired_at) ||
    (startedAt ? new Date(startedAt.getTime() + trialMs) : null)
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

  const user = await db.collection(USERS_COLLECTION).findOne(
    {
      $or: tvMatch,
      license_pack: { $in: ["DMT_Free_1Week", "DMT_Free_3Month"] },
    },
    { collation: { locale: "en", strength: 2 } }
  );
  if (user) return { source: USERS_COLLECTION, record: user };

  return null;
}

export function checkTrialWebhookEntitlement(db) {
  return async function trialWebhookEntitlementMiddleware(req, res, next) {
    try {
      const payload = parseWebhookPayload(req.body);
      req.webhookPayload = payload;

      if (!isAllowedTradingViewIp(req)) {
        return res.status(403).json({
          ok: false,
          error: "tradingview_ip_not_allowed",
          message: "허용된 TradingView 웹훅 발송 IP가 아니므로 차단했습니다.",
        });
      }

      if (!hasExpectedSecureToken(payload)) {
        return res.status(401).json({
          ok: false,
          error: "invalid_secure_token",
          message: "MagicTrading/Triple Momentum 웹훅 보안 토큰이 일치하지 않습니다.",
        });
      }

      const isFreeTrialLicense = isOneWeekFreeLicensePack(payload);
      const isOneMonthEventLicense = isOneMonthEventLicensePack(payload);
      const isMultiChartFixedLicense = isMultiChartFixedLicensePack(payload);
      const isPermanentLicense = isPermanentLicensePack(payload);

      if (!isFreeTrialLicense && !isOneMonthEventLicense && !isMultiChartFixedLicense && !isPermanentLicense) {
        return res.status(401).json({
          ok: false,
          error: "invalid_license_pack",
          message: "지원하는 MagicTrading 웹훅 라이선스가 아닙니다.",
        });
      }

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

      if (await shouldDropDuplicateWebhook(tvId, payload, Date.now())) {
        return res.status(200).json({
          ok: true,
          accepted: false,
          dropped: true,
          reason: "duplicate_webhook_debounced",
        });
      }

      if (isPermanentLicense) {
        const decision = await checkPermanentEntitlement(db, tvId, payload, req);
        if (!decision.ok) {
          return res.status(decision.status).json({
            ok: false,
            error: decision.error,
            message: decision.message,
          });
        }
        req.trialWebhookEntitlement = {
          subject_key: decision.subject_key,
          trv_id: decision.trv_id,
          source: decision.source,
          permanent_access: true,
          license_pack: payload.license_pack || null,
          pass: true,
        };
        req.oneWeekFreeTrial = req.trialWebhookEntitlement;
        return next();
      }

      if (isOneMonthEventLicense) {
        const decision = await checkOneMonthEventEntitlement(db, tvId, payload, req);
        if (!decision.ok) {
          return res.status(decision.status).json({
            ok: false,
            error: decision.error,
            message: decision.message,
          });
        }
        req.trialWebhookEntitlement = {
          subject_key: decision.subject_key,
          trv_id: decision.trv_id,
          source: decision.source,
          expires_at: decision.expires_at,
          license_pack: payload.license_pack || null,
          pass: true,
        };
        req.oneWeekFreeTrial = req.trialWebhookEntitlement;
        return next();
      }

      if (isMultiChartFixedLicense) {
        const decision = await checkMultiChartFixedEntitlement(db, tvId, payload, req);
        if (!decision.ok) {
          return res.status(decision.status).json({
            ok: false,
            error: decision.error,
            message: decision.message,
          });
        }
        req.trialWebhookEntitlement = {
          subject_key: decision.subject_key,
          trv_id: decision.trv_id,
          source: decision.source,
          chart_key: decision.chart_key,
          active_charts_limit: decision.active_charts_limit,
          current_registered_tickers_count: decision.current_registered_tickers_count,
          expires_at: decision.expires_at,
          license_pack: payload.license_pack || null,
          pass: true,
        };
        req.oneWeekFreeTrial = req.trialWebhookEntitlement;
        return next();
      }

      const now = new Date();
      const subjectKey = `trv:${tvId}`;
      const trialMs = freeTrialDurationMsForPayload(payload);
      const trialPlanLabel = freeTrialPlanLabelForPayload(payload);
      const existing = await findExistingTrialByTvId(db, tvId);
      const trialRecord = existing?.record || null;
      const source = USERS_COLLECTION;
      const startedAt = startedAtFromRecord(trialRecord);
      const expireAt = expireAtFromRecord(trialRecord, startedAt, trialMs);
      const requestedLicensePack = String(payload.license_pack || "").trim().toLowerCase();
      const ledgerLicensePack = String(trialRecord?.license_pack || trialRecord?.last_license_pack || "").trim().toLowerCase();

      if (!trialRecord) {
        await writeAudit(db, {
          event: "trial_webhook_entitlement_rejected",
          blocked: true,
          reason: "free_trial_user_not_found_in_users",
          subject_key: subjectKey,
          trv_id: tvId,
          license_pack: payload.license_pack || null,
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: "free_trial_user_not_found",
          message: "PayPal 0원 결제 인증이 완료된 users 원장을 찾을 수 없어 무료 지표 접근을 차단했습니다.",
        });
      }

      if (!userIsActive(trialRecord) || ledgerLicensePack !== requestedLicensePack) {
        await writeAudit(db, {
          event: "trial_webhook_entitlement_rejected",
          blocked: true,
          reason: !userIsActive(trialRecord) ? "free_trial_user_not_active" : "free_trial_license_pack_mismatch",
          subject_key: subjectKey,
          trv_id: tvId,
          source,
          ledger_license_pack: trialRecord.license_pack || trialRecord.last_license_pack || null,
          payload_license_pack: payload.license_pack || null,
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: !userIsActive(trialRecord) ? "free_trial_user_not_active" : "free_trial_license_pack_mismatch",
          message: "무료 지표 접근권이 활성 상태가 아니거나 요청 라이선스와 users 원장이 일치하지 않습니다.",
        });
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
        const inviteDeleteResult = await triggerInviteOnlyAccess("delete", trialRecord, {
          tvId,
          reason: "free_trial_period_expired",
        });
        await db.collection(USERS_COLLECTION).updateOne(
          { _id: trialRecord._id },
          {
            $set: {
              status: "expired",
              expired_at: now,
              expired_at_kst: kstIso(now),
              blocked_at: now,
              blocked_reason: "trial_period_expired",
              invite_revoke_result: inviteDeleteResult,
              updated_at: now,
            },
            $inc: { blocked_count: 1 },
          }
        );
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
          invite_delete_result: inviteDeleteResult,
          ip: req.ip || req.socket?.remoteAddress || null,
          user_agent: req.headers["user-agent"] || null,
        });
        return res.status(403).json({
          ok: false,
          error: "trial_period_expired",
          message: `무료 체험 ${trialPlanLabel}이 만료되어 브로커 주문 전송을 차단했습니다.`,
        });
      }

      await db.collection(USERS_COLLECTION).updateOne(
        { _id: trialRecord._id },
        {
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
        }
      );

      await writeAudit(db, {
        event: "trial_webhook_entitlement_accepted",
        blocked: false,
        subject_key: subjectKey,
        trv_id: tvId,
        source,
        trial_plan_label: trialPlanLabel,
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
        trial_plan_label: trialPlanLabel,
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
  const trialMs = freeTrialDurationMsForPayload(payload);
  const trialPlanLabel = freeTrialPlanLabelForPayload(payload);

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
      error: "지원하는 무료 체험 코스 웹훅 라이선스가 아닙니다.",
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

  const expiresAtOnInsert = new Date(now.getTime() + trialMs);
  const users = db.collection(USERS_COLLECTION);
  const result = await users.findOneAndUpdate(
    {
      $or: [
        { subject_key: identity.subject_key },
        { trv_id: identity.trv_id },
        { tv_id: identity.trv_id },
        { tradingview_username: identity.trv_id },
      ],
    },
    {
      $setOnInsert: {
        username: payload.username || payload.name || identity.trv_id,
        subject_key: identity.subject_key,
        trv_id: identity.trv_id,
        tv_id: identity.trv_id,
        tradingview_username: identity.trv_id,
        ...(payload.email ? { email: cleanEmail(payload.email) || payload.email } : {}),
        membership_type: "associate",
        tier_type: "FreeTrialAssociate",
        license_pack: payload.license_pack || null,
        plan_code: payload.license_pack || null,
        plan_sku: payload.license_pack || null,
        backendRegularPrepaidConfirmed: false,
        backend_regular_prepaid_confirmed: false,
        first_seen_at: now,
        started_at: now,
        started_at_kst: kstIso(now),
        trial_started_at: now,
        expire_at: expiresAtOnInsert,
        expire_at_kst: kstIso(expiresAtOnInsert),
        expires_at: expiresAtOnInsert,
        status: "active",
        source: "users_unified_free_trial",
        created_at: now,
      },
      $set: {
        license_pack: payload.license_pack || null,
        plan_code: payload.license_pack || null,
        plan_sku: payload.license_pack || null,
        last_seen_at: now,
        last_seen_at_kst: kstIso(now),
        last_license_pack: payload.license_pack || null,
        free_trial_license_pack: payload.license_pack || null,
        free_trial_plan_label: trialPlanLabel,
        last_tickerid: payload.tickerid || null,
        last_magic_signal: payload.magic_signal || null,
        last_event: payload.event || null,
        updated_at: now,
      },
      $inc: { webhook_seen_count: 1 },
    },
    { upsert: true, returnDocument: "after", collation: { locale: "en", strength: 2 } }
  );

  const trial = result?.value || result;
  if (!trial) {
    throw new Error("free_trial_user_upsert_failed");
  }
  const startedAt = new Date(trial.trial_started_at || trial.first_seen_at || now);
  const hardExpiresAt = new Date(startedAt.getTime() + trialMs);
  const expired = now.getTime() > hardExpiresAt.getTime();

  if (expired) {
    await users.updateOne(
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
      `무료 체험 기간 ${trialPlanLabel}이 만료되었습니다. 지속적인 시그널 연동 및 틱 차트 트레이딩을 원하시면 공식 홈페이지(magicindicatorglobal.com)에서 정규 과금 플랜을 확인하세요.`;

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

    return { ok: false, status: 403, error: `무료 체험 기간 ${trialPlanLabel}이 만료되었습니다.`, message };
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
      trial_plan_label: trialPlanLabel,
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
