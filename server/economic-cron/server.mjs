/**
 * 경제 캘린더(Finnhub) 조회 → 발표 N분 전 텔레그램 알림.
 * Finnhub가 “푸시 웹훅”을 주지 않으므로, 외부 Cron이 이 URL에 POST 해서 주기적으로 깨웁니다.
 *
 * POST /v1/cron/economic-calendar
 *   헤더: Authorization: Bearer <CRON_SECRET>  또는  X-Cron-Secret: <CRON_SECRET>
 *
 * GET /health
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { DateTime } from "luxon";

function envStr(k, d = "") {
  const v = process.env[k];
  return v == null || v === "" ? d : String(v).trim();
}

function envBool(k) {
  const v = envStr(k).toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envInt(k, d) {
  const n = parseInt(envStr(k, String(d)), 10);
  return Number.isFinite(n) ? n : d;
}

function normImpact(raw) {
  if (raw == null) return "";
  if (typeof raw === "number") return String(Math.trunc(raw));
  return String(raw).trim().toLowerCase();
}

function impactAllowed(impact, allowedSet) {
  if (!allowedSet.size) return true;
  const imp = impact.toLowerCase();
  if (allowedSet.has(imp)) return true;
  if (/^\d+$/.test(imp) && allowedSet.has(imp)) return true;
  const aliases = {
    high: new Set(["high", "h", "3", "strong"]),
    medium: new Set(["medium", "med", "m", "2", "moderate"]),
    low: new Set(["low", "l", "1", "weak"]),
  };
  for (const [level, names] of Object.entries(aliases)) {
    if (allowedSet.has(level) && names.has(imp)) return true;
  }
  return false;
}

function parseInstant(row, sourceTz) {
  const keysNum = ["time", "timestamp", "releaseTime", "datetime"];
  for (const k of keysNum) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const sec = v > 1e12 ? v / 1000 : v;
      return DateTime.fromSeconds(sec, { zone: "utc" });
    }
  }

  const isoKeys = ["time", "datetime", "releaseTime", "releaseDate"];
  for (const k of isoKeys) {
    const v = row[k];
    if (typeof v !== "string" || !v.trim()) continue;
    const s = v.trim().replace("Z", "+00:00");
    if (s.length === 10 && s[4] === "-" && s[7] === "-") continue;
    const hasTz = /[+-]\d{2}:?\d{2}$/.test(s);
    let dt = hasTz
      ? DateTime.fromISO(s, { setZone: true })
      : DateTime.fromISO(s, { zone: sourceTz });
    if (!dt.isValid && !hasTz) {
      dt = DateTime.fromFormat(s, "yyyy-MM-dd HH:mm:ss", { zone: sourceTz });
    }
    if (!dt.isValid && !hasTz) {
      dt = DateTime.fromFormat(s, "yyyy-MM-dd H:mm:ss", { zone: sourceTz });
    }
    if (dt.isValid) return dt.toUTC();
  }

  const dRaw = row.date;
  const tRaw = row.time;
  if (typeof dRaw === "string" && dRaw.trim().length >= 10) {
    const dPart = dRaw.trim().slice(0, 10);
    let tPart = "00:00:00";
    if (typeof tRaw === "string" && /^\d{1,2}:\d{2}/.test(tRaw.trim())) {
      const p = tRaw.trim().split(":");
      const hh = p[0].padStart(2, "0");
      const mm = (p[1] || "0").padStart(2, "0");
      const ss = p[2] ? String(p[2].split(".")[0]).padStart(2, "0") : "00";
      tPart = `${hh}:${mm}:${ss}`;
    }
    const local = DateTime.fromFormat(`${dPart} ${tPart}`, "yyyy-MM-dd HH:mm:ss", { zone: sourceTz });
    if (local.isValid) return local.toUTC();
  }

  return null;
}

function stableEventId(country, title, instantIso) {
  const raw = `${country}|${title}|${instantIso}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 24);
}

async function fetchFinnhub(from, to, apiKey, eventCountries, impactLevels, sourceTz) {
  const u = new URL("https://finnhub.io/api/v1/calendar/economic");
  u.searchParams.set("from", from);
  u.searchParams.set("to", to);
  u.searchParams.set("token", apiKey);
  const r = await fetch(u, { method: "GET" });
  if (!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
  const data = await r.json();
  const rows = Array.isArray(data?.economicCalendar)
    ? data.economicCalendar
    : Array.isArray(data)
      ? data
      : [];

  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const country = String(row.country || "")
      .trim()
      .toUpperCase();
    if (eventCountries.size && !eventCountries.has(country)) continue;
    const title = String(row.event || row.name || "").trim();
    if (!title) continue;
    const impact = normImpact(row.impact);
    if (!impactAllowed(impact, impactLevels)) continue;
    const instant = parseInstant(row, sourceTz);
    if (!instant || !instant.isValid) continue;
    const instantUtc = instant.toUTC();
    const iso = instantUtc.toISO();
    out.push({
      event_id: stableEventId(country, title, iso),
      country,
      title,
      impact: impact || "?",
      instant_utc: instantUtc,
    });
  }
  out.sort((a, b) => a.instant_utc.toMillis() - b.instant_utc.toMillis());
  return out;
}

async function loadState(filePath) {
  try {
    const t = await fs.readFile(filePath, "utf8");
    const j = JSON.parse(t);
    const n = j.notified;
    const notified = {};
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (typeof k === "string" && typeof v === "string") notified[k] = v;
      }
    }
    return { notified };
  } catch {
    return { notified: {} };
  }
}

function pruneState(state, maxAgeDays = 14) {
  const cutoff = DateTime.utc().minus({ days: maxAgeDays });
  const next = {};
  for (const [eid, iso] of Object.entries(state.notified)) {
    const t = DateTime.fromISO(iso, { zone: "utc" });
    if (t.isValid && t >= cutoff) next[eid] = iso;
  }
  state.notified = next;
}

async function saveState(filePath, state) {
  await fs.writeFile(filePath, JSON.stringify({ notified: state.notified }, null, 2), "utf8");
}

function formatAlert(ev, cfg) {
  const utc = ev.instant_utc;
  const local = utc.setZone(cfg.displayTz);
  const utcStr = utc.toFormat("yyyy-MM-dd HH:mm 'UTC'");
  const localStr = local.toFormat("yyyy-MM-dd HH:mm ZZZZ");
  return [
    "📊 경제지표 사전 알림 (고임팩트)",
    "",
    `• 지표: ${ev.title}`,
    `• 국가: ${ev.country}  ·  중요도: ${ev.impact}`,
    `• 발표 예정(표시 TZ: ${cfg.displayTz}): ${localStr}`,
    `• 발표 예정(UTC): ${utcStr}`,
    `• 약 ${cfg.alertMinutesBefore}분 후 발표 예정입니다.`,
    "",
    "변동성·스프레드·슬리피지에 유의하세요.",
    "(포지션 여부와 무관한 일정 안내입니다.)",
  ].join("\n");
}

async function sendTelegram(botToken, chatId, text, dryRun) {
  if (dryRun) {
    console.log("[DRY_RUN] 텔레그램:\n" + text);
    return true;
  }
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error("Telegram error", r.status, errText.slice(0, 500));
    return false;
  }
  return true;
}

function parseSetUpper(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toUpperCase())
  );
}

function parseImpactSet(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function runCycle(cfg) {
  const now = DateTime.utc();
  const today = now.toISODate();
  const horizon = now.plus({ days: 3 }).toISODate();

  const events = await fetchFinnhub(
    today,
    horizon,
    cfg.finnhubKey,
    cfg.eventCountries,
    cfg.impactLevels,
    cfg.sourceTz
  );

  const state = await loadState(cfg.stateFile);
  pruneState(state);

  let sent = 0;
  const alertDelta = { minutes: cfg.alertMinutesBefore };

  for (const ev of events) {
    if (state.notified[ev.event_id]) continue;
    if (now >= ev.instant_utc) continue;
    const alertAt = ev.instant_utc.minus(alertDelta);
    if (now < alertAt) continue;

    const text = formatAlert(ev, cfg);
    const ok = await sendTelegram(cfg.botToken, cfg.chatId, text, cfg.dryRun);
    if (ok) {
      state.notified[ev.event_id] = now.toISO();
      sent += 1;
      console.log("알림 전송:", ev.title, ev.country);
    }
  }

  await saveState(cfg.stateFile, state);
  return { checked: events.length, sent };
}

function readCronSecret(req) {
  const x = req.headers["x-cron-secret"];
  if (x) return String(x);
  const auth = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

function loadConfig() {
  const impactRaw = envStr("IMPACT_LEVELS", "high");
  const countriesRaw = envStr("EVENT_COUNTRIES", "US");
  return {
    port: envInt("PORT", 8787),
    cronSecret: envStr("CRON_SECRET"),
    finnhubKey: envStr("FINNHUB_API_KEY"),
    botToken: envStr("TELEGRAM_BOT_TOKEN"),
    chatId: envStr("TELEGRAM_CHAT_ID"),
    alertMinutesBefore: envInt("ALERT_MINUTES_BEFORE", 30),
    impactLevels: parseImpactSet(impactRaw),
    eventCountries: parseSetUpper(countriesRaw),
    sourceTz: envStr("SOURCE_TIMEZONE", "UTC"),
    displayTz: envStr("DISPLAY_TIMEZONE", "America/New_York"),
    dryRun: envBool("DRY_RUN"),
    stateFile: envStr("STATE_FILE", "./sent_state.json"),
  };
}

function validateCfg(c) {
  const e = [];
  if (!c.cronSecret) e.push("CRON_SECRET");
  if (!c.finnhubKey) e.push("FINNHUB_API_KEY");
  if (!c.botToken) e.push("TELEGRAM_BOT_TOKEN");
  if (!c.chatId) e.push("TELEGRAM_CHAT_ID");
  return e;
}

const cfg = loadConfig();
const missing = validateCfg(cfg);
if (missing.length) {
  console.error("환경 변수 누락:", missing.join(", "));
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.split("?")[0] === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }

    const path = req.url.split("?")[0];
    if (req.method === "POST" && path === "/v1/cron/economic-calendar") {
      const sec = readCronSecret(req);
      if (sec !== cfg.cronSecret) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("unauthorized");
        return;
      }
      const body = await runCycle(cfg);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, ...body }));
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(e && e.message ? e.message : e));
  }
});

server.listen(cfg.port, () => {
  console.log(
    `economic-cron listening :${cfg.port}  POST /v1/cron/economic-calendar  (Cron 웹훅)`
  );
});
