import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "magic_indicator";
const USERS_COLLECTION = "users";
const SIGNAL_WEBHOOK_EVENTS_COLLECTION = "signal_webhook_events";
const LICENSE_ALERT_WEBHOOK_URL = process.env.LICENSE_ALERT_WEBHOOK_URL || "";
const LICENSE_ALERT_WEBHOOK_TOKEN = process.env.LICENSE_ALERT_WEBHOOK_TOKEN || "";
const EMAIL_WARNING_WEBHOOK_URL = process.env.EMAIL_WARNING_WEBHOOK_URL || "";
const EMAIL_WARNING_WEBHOOK_TOKEN = process.env.EMAIL_WARNING_WEBHOOK_TOKEN || "";
const MT5_PUSH_WEBHOOK_URL = process.env.MT5_PUSH_WEBHOOK_URL || "";
const MT5_PUSH_WEBHOOK_TOKEN = process.env.MT5_PUSH_WEBHOOK_TOKEN || "";
const SCAN_LIMIT = Math.max(1, Number(process.env.RENEWAL_WARNING_SCAN_LIMIT || 1000));
const DAY_MS = 24 * 60 * 60 * 1000;

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(2);
}

function kstIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function tvIdFromDoc(doc = {}) {
  return doc.trv_id || doc.tv_id || doc.tradingview_username || doc.tradingviewUsername || "";
}

function emailFromDoc(doc = {}) {
  return doc.email || doc.user_email || doc.contact_email || "";
}

function phoneFromDoc(doc = {}) {
  return doc.phone_e164 || doc.phone || doc.mobile || "";
}

function renewalMessage(daysLeft) {
  return `[도담 시스템 알림] 회원님, 사용 중이신 플랜이 ${daysLeft}일 뒤 만료되어 정규 플랜($4,999/월) 자동 결제로 전환될 예정입니다. 페이팔 플랫폼 수수료 면제 및 할인 혜택을 받으시려면, 자동 결제가 진행되기 전 공식 홈페이지 마이페이지에서 안내하는 [국내 원화 계좌 이체] 또는 [가상화폐 지정 지갑 뱅킹]을 통해 무통장 수동 결제를 완료해 주십시오. 다른 결제 수단으로 정산을 마치시면 기존 페이팔 자동 결제 스케줄은 도담 자율 빌링 시스템에 의해 안전하게 즉시 자동 삭제 처리되오니 중복 결제 걱정 없이 이용하셔도 좋습니다.`;
}

async function postJson(url, token, body) {
  if (!url) return { ok: true, skipped: true, reason: "url_not_configured" };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text.slice(0, 2000) };
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

async function writeAudit(db, event) {
  await db.collection(SIGNAL_WEBHOOK_EVENTS_COLLECTION).insertOne({
    received_at: new Date(),
    received_at_kst: kstIso(),
    ttl_managed: true,
    ...event,
  });
}

async function sendWarning(db, doc, { planKind, daysLeft, markerField }) {
  const now = new Date();
  const tvId = tvIdFromDoc(doc);
  const email = emailFromDoc(doc);
  const phone = phoneFromDoc(doc);
  const message = renewalMessage(daysLeft);
  const html =
    `<p>${message}</p><p><a href="https://magicindicatorglobal.com/mypage/">마이페이지에서 구독 해지/관리하기</a></p>`;
  const common = {
    event: "renewal_warning",
    plan_kind: planKind,
    tv_id: tvId,
    email,
    phone_e164: phone,
    days_left: daysLeft,
    message,
  };

  const kakaoSms = await postJson(LICENSE_ALERT_WEBHOOK_URL, LICENSE_ALERT_WEBHOOK_TOKEN, {
    ...common,
    channels: ["sms", "kakao", "telegram"],
  });
  const emailWebhook = await postJson(EMAIL_WARNING_WEBHOOK_URL, EMAIL_WARNING_WEBHOOK_TOKEN, {
    ...common,
    channel: "email",
    subject: "도담 정규 플랜 자동 전환 결제 예고",
    html,
  });
  const smtp = await sendSmtpEmail(email, "도담 정규 플랜 자동 전환 결제 예고", html);
  const mt5 = await postJson(MT5_PUSH_WEBHOOK_URL, MT5_PUSH_WEBHOOK_TOKEN, {
    ...common,
    channel: "mt5_push",
    mt5_login: doc.mt5_account || doc.mt5_login || doc.mt5_id || null,
    mt5_server: doc.mt5_server || doc.server || null,
    message,
  });

  const update = {
    $set: {
      [markerField]: now,
      [`${markerField}_kst`]: kstIso(now),
      updated_at: now,
    },
  };
  await db.collection(USERS_COLLECTION).updateOne({ _id: doc._id }, update);
  await writeAudit(db, {
    event: "renewal_warning_sent",
    blocked: false,
    plan_kind: planKind,
    subject_key: doc.subject_key || (tvId ? `trv:${String(tvId).toLowerCase()}` : null),
    trv_id: tvId || null,
    email: email || null,
    expires_at: doc.expires_at || doc.expire_at || null,
    delivery: { kakaoSms, emailWebhook, smtp, mt5 },
  });
  return { kakaoSms, emailWebhook, smtp, mt5 };
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const now = new Date();

    const oneWeekRows = await db
      .collection(USERS_COLLECTION)
      .find({
        status: "active",
        license_pack: "DMT_Free_1Week",
        renewal_warning_5d_sent_at: { $exists: false },
        expires_at: { $gt: new Date(now.getTime() + DAY_MS), $lte: new Date(now.getTime() + 2 * DAY_MS) },
      })
      .limit(SCAN_LIMIT)
      .toArray();

    const oneMonthRows = await db
      .collection(USERS_COLLECTION)
      .find({
        status: "active",
        license_pack: "Dodam_MagicTrading_1MonthEvent",
        renewal_warning_1m_3d_sent_at: { $exists: false },
        expires_at: { $gt: new Date(now.getTime() + 2 * DAY_MS), $lte: new Date(now.getTime() + 3 * DAY_MS) },
      })
      .limit(SCAN_LIMIT)
      .toArray();

    for (const row of oneWeekRows) {
      await sendWarning(db, row, { planKind: "one_week_free", daysLeft: 2, markerField: "renewal_warning_5d_sent_at" });
    }
    for (const row of oneMonthRows) {
      await sendWarning(db, row, { planKind: "one_month_event", daysLeft: 3, markerField: "renewal_warning_1m_3d_sent_at" });
    }

    console.log(JSON.stringify({ ok: true, one_week_free: oneWeekRows.length, one_month_event: oneMonthRows.length }));
  } finally {
    await client.close();
  }
}

await main();
