import "dotenv/config";
import axios from "axios";
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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.DODAM_TELEGRAM_BOT_TOKEN || "";

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

function cleanTelegramId(value) {
  const s = String(value || "").trim();
  return /^\d{5,20}$/.test(s) ? s : "";
}

function cleanTelegramPayload(value) {
  if (!value) return "—";
  return String(value).replace(/[`\\]/g, "");
}

/**
 * 도담 매직트레이딩 텔레그램 시그널 실시간 릴레이 핸들러
 * 기존 checkTrialWebhookEntitlement 미들웨어 및 Redis 5초 디바운싱 통과 직후 실행합니다.
 */
async function relayTelegramSignal(req, res, next) {
  try {
    const payload = req.webhookPayload || {};
    if (!req.webhookPayload) {
      req.telegramRelay = { ok: true, skipped: true, reason: "webhook_payload_not_available_after_entitlement" };
      return next();
    }
    const { tg_id, event, magic_signal, ticker, tf, band_edge, close, tv_id } = payload;
    const botToken = TELEGRAM_BOT_TOKEN;

    if (!tg_id || String(tg_id).trim() === "" || !botToken) {
      req.telegramRelay = {
        ok: true,
        skipped: true,
        reason: !tg_id || String(tg_id).trim() === "" ? "missing_tg_id" : "telegram_bot_token_not_configured",
      };
      return next();
    }

    const validTgId = cleanTelegramId(tg_id);
    if (!validTgId) {
      console.warn(`[Telegram Relay Skip] Invalid non-numeric tg_id format received: ${tg_id}`);
      req.telegramRelay = { ok: true, skipped: true, reason: "invalid_non_numeric_tg_id", tv_id: tv_id || null };
      return next();
    }

    const cleanTicker = cleanTelegramPayload(ticker || payload.tickerid);
    const cleanTf = cleanTelegramPayload(tf);
    const cleanEdge = cleanTelegramPayload(band_edge || payload.entry_anchor);
    const cleanClose = cleanTelegramPayload(close);
    const cleanSignal = cleanTelegramPayload(magic_signal);

    let messageText = "";
    if (event === "magic_core_buy") {
      messageText = `🚀 *[도담 매직트레이딩 - LONG 매수]*\n• 종목: \`${cleanTicker}\`\n• 주기: \`${cleanTf}\`\n• 진입타점(밴드하단): \`${cleanEdge}\`\n💡 _차트 신호가 확정되었습니다. MT5 포지션 진입을 정렬하십시오._`;
    } else if (event === "magic_core_sell") {
      messageText = `🔥 *[도담 매직트레이딩 - SHORT 매도]*\n• 종목: \`${cleanTicker}\`\n• 주기: \`${cleanTf}\`\n• 진입타점(밴드상단): \`${cleanEdge}\`\n💡 _차트 신호가 확정되었습니다. MT5 포지션 진입을 정렬하십시오._`;
    } else if (event === "magic_core_exit" || event === "magic_core_stop") {
      messageText = `⚠️ *[도담 매직트레이딩 - 포지션 청산 완료]*\n• 종목: \`${cleanTicker}\`\n• 청산 유형: \`${cleanSignal}\`\n• 최종 청산가: \`${cleanClose}\`\n🎯 _현재 포지션이 완전 플랫(Flat) 처리되었습니다. 계좌 잔고를 점검하십시오._`;
    }

    if (messageText !== "") {
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await axios.post(
        telegramUrl,
        {
          chat_id: validTgId,
          text: messageText,
          parse_mode: "Markdown",
        },
        { timeout: 4000 }
      );
      req.telegramRelay = { ok: true, status: response.status, tg_id: validTgId };
    } else {
      req.telegramRelay = { ok: true, skipped: true, reason: "unsupported_signal_for_telegram", tg_id: validTgId };
    }
  } catch (telegramError) {
    console.error("[Telegram Bot API Error Domain]", telegramError.message);
    req.telegramRelay = { ok: false, error: telegramError.message };
  }

  return next();
}

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
        telegram_relay: req.telegramRelay || null,
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
  relayTelegramSignal,
  acceptedSignalHandler
);

app.post(
  "/api/webhooks/signals/three-month-free",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  relayTelegramSignal,
  acceptedSignalHandler
);

app.post(
  "/api/webhooks/signals/one-week-free",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  relayTelegramSignal,
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
