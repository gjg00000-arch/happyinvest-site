import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import {
  applyManualPaymentApproval,
  applyFreeTrialSignup,
  applyPaidPlanFromWebhook,
  assertNoActivePlanForPayment,
  calculateMultiChartFixedBilling,
  checkTrialWebhookEntitlement,
  checkOneWeekFreeTrial,
  ensureOneWeekFreeTrialIndexes,
  getUserEntitlementStatus,
  parseWebhookPayload,
  resetMultiChartFixedSession,
} from "./src/oneWeekFreeTrialGuard.mjs";

const PORT = Number(process.env.ONE_WEEK_FREE_TRIAL_PORT || process.env.PORT || 3071);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const MULTICHART_SESSION_RESET_TOKEN = process.env.MULTICHART_SESSION_RESET_TOKEN || "";
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";
const FREE_TRIAL_APPLY_TOKEN = process.env.FREE_TRIAL_APPLY_TOKEN || "";

if (!MONGODB_URI) {
  console.error("MONGODB_URI 환경변수가 필요합니다.");
  process.exit(2);
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
await ensureOneWeekFreeTrialIndexes(db);

const app = express();

app.get("/healthz", (req, res) => {
  res.json({ ok: true, service: "three-month-free-trial-webhook" });
});

async function acceptedSignalHandler(req, res, next) {
  try {
    const payload = req.webhookPayload || parseWebhookPayload(req.body);
    // 실제 MT5/브로커 체결 라우터는 checkTrialWebhookEntitlement 통과 후 이 지점 뒤에 연결합니다.
    res.json({
      ok: true,
      accepted: true,
      trial: req.trialWebhookEntitlement,
      signal: {
        event: payload.event || null,
        magic_signal: payload.magic_signal || null,
        tickerid: payload.tickerid || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

app.post(
  "/api/signals/webhook",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  acceptedSignalHandler
);

app.post(
  "/api/webhooks/signals/three-month-free",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  acceptedSignalHandler
);

app.post(
  "/api/webhooks/signals/one-week-free",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  acceptedSignalHandler
);

app.post("/api/admin/one-week-free/check", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    const decision = await checkOneWeekFreeTrial(db, req.body || {}, {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

function requireOptionalBearer(req, tokenValue) {
  if (!tokenValue) return true;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.body?.token || "");
  return token === tokenValue;
}

app.post("/api/webhooks/whop", express.json({ limit: "256kb" }), async (req, res, next) => {
  try {
    if (!requireOptionalBearer(req, PAYMENT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: "invalid_payment_webhook_token" });
    }
    const decision = await applyPaidPlanFromWebhook(db, req.body || {}, "whop", {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.post("/api/payment/webhook", express.json({ limit: "256kb" }), async (req, res, next) => {
  try {
    if (!requireOptionalBearer(req, PAYMENT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: "invalid_payment_webhook_token" });
    }
    const provider = String(req.body?.provider || req.body?.source || "generic_payment").toLowerCase();
    const decision = await applyPaidPlanFromWebhook(db, req.body || {}, provider, {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/webhooks/paypal/ipn",
  express.urlencoded({ extended: false, limit: "256kb" }),
  async (req, res, next) => {
    try {
      if (!requireOptionalBearer(req, PAYMENT_WEBHOOK_SECRET)) {
        return res.status(401).json({ ok: false, error: "invalid_payment_webhook_token" });
      }
      const decision = await applyPaidPlanFromWebhook(db, req.body || {}, "paypal", {
        ip: req.ip || req.socket?.remoteAddress,
        user_agent: req.headers["user-agent"],
      });
      res.status(decision.status).json(decision);
    } catch (err) {
      next(err);
    }
  }
);

app.post("/api/free-trial/apply", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    if (!requireOptionalBearer(req, FREE_TRIAL_APPLY_TOKEN)) {
      return res.status(401).json({ ok: false, error: "invalid_free_trial_apply_token" });
    }
    const decision = await applyFreeTrialSignup(db, req.body || {}, {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.get("/api/users/entitlement/status", async (req, res, next) => {
  try {
    const decision = await getUserEntitlementStatus(db, {
      tv_id: req.query.tv_id || req.query.tvId || req.query.tradingview_username,
      email: req.query.email,
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.post("/api/payment/create-paypal-order", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    const guard = await assertNoActivePlanForPayment(db, req.body || {});
    if (!guard.ok) return res.status(guard.status).json(guard);
    res.status(202).json({
      ok: true,
      eligible: true,
      message: "활성 플랜이 없어 결제 생성 단계로 진행할 수 있습니다. 실제 PayPal 주문 생성은 프론트 PayPal SDK 또는 결제 서버에 연결하십시오.",
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/payments/paypal/create-order", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    const guard = await assertNoActivePlanForPayment(db, req.body || {});
    if (!guard.ok) return res.status(guard.status).json(guard);
    res.status(202).json({
      ok: true,
      eligible: true,
      prepayment_allowed: guard.prepayment_allowed === true,
      message: guard.prepayment_allowed
        ? "이벤트 플랜 활성 상태이지만 정규 상위 플랜 선결제로 진행할 수 있습니다."
        : "활성 플랜이 없어 PayPal 주문 생성 단계로 진행할 수 있습니다.",
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/payments/prepare-checkout", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    const guard = await assertNoActivePlanForPayment(db, req.body || {});
    if (!guard.ok) return res.status(guard.status).json(guard);
    res.status(202).json({
      ok: true,
      eligible: true,
      prepayment_allowed: guard.prepayment_allowed === true,
      message: guard.prepayment_allowed
        ? "이벤트 플랜 활성 상태이지만 정규 상위 플랜 선결제 인보이스 준비를 허용합니다."
        : "활성 플랜이 없어 결제 준비 단계로 진행할 수 있습니다.",
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/payment/bank-approve", express.json({ limit: "128kb" }), async (req, res, next) => {
  try {
    if (!requireOptionalBearer(req, PAYMENT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: "invalid_payment_approval_token" });
    }
    const decision = await applyManualPaymentApproval(db, req.body || {}, "bank_transfer", {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.post("/api/payment/crypto-verify", express.json({ limit: "128kb" }), async (req, res, next) => {
  try {
    if (!requireOptionalBearer(req, PAYMENT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: "invalid_payment_approval_token" });
    }
    const decision = await applyManualPaymentApproval(db, req.body || {}, "crypto_transfer", {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/multichart-fixed/quote", express.json({ limit: "32kb" }), (req, res) => {
  const chartCount = req.body?.chart_count ?? req.body?.chartCount ?? 1;
  res.json({ ok: true, ...calculateMultiChartFixedBilling(chartCount) });
});

app.post("/api/admin/multichart-fixed/session-reset", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    if (MULTICHART_SESSION_RESET_TOKEN) {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.body?.token || "");
      if (token !== MULTICHART_SESSION_RESET_TOKEN) {
        return res.status(401).json({ ok: false, error: "invalid_session_reset_token" });
      }
    }

    const decision = await resetMultiChartFixedSession(db, req.body || {}, {
      ip: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers["user-agent"],
    });
    res.status(decision.status).json(decision);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error("three-month-free-trial-webhook", err);
  res.status(500).json({ ok: false, error: "internal_server_error" });
});

const server = app.listen(PORT, () => {
  console.log(`three-month-free-trial webhook listening on :${PORT}`);
});

async function shutdown() {
  server.close(() => {});
  await client.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
