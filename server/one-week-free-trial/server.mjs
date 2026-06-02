import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import {
  checkTrialWebhookEntitlement,
  checkOneWeekFreeTrial,
  ensureOneWeekFreeTrialIndexes,
  parseWebhookPayload,
} from "./src/oneWeekFreeTrialGuard.mjs";

const PORT = Number(process.env.ONE_WEEK_FREE_TRIAL_PORT || process.env.PORT || 3071);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";

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
  res.json({ ok: true, service: "one-week-free-trial-webhook" });
});

app.post(
  "/api/webhooks/signals/one-week-free",
  express.raw({ type: "*/*", limit: "256kb" }),
  checkTrialWebhookEntitlement(db),
  async (req, res, next) => {
    try {
      const payload = req.webhookPayload || parseWebhookPayload(req.body);
      // 실제 MT5/브로커 체결 라우터가 복구되면 이 지점 뒤에 전달합니다.
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

app.use((err, req, res, next) => {
  console.error("one-week-free-trial-webhook", err);
  res.status(500).json({ ok: false, error: "internal_server_error" });
});

const server = app.listen(PORT, () => {
  console.log(`one-week-free-trial webhook listening on :${PORT}`);
});

async function shutdown() {
  server.close(() => {});
  await client.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
