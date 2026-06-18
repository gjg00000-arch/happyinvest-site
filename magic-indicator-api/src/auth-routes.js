import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router } from "express";
import { connectDb, COL } from "./db.js";
import { getUserId } from "./acl.js";
import { signMemberRefreshToken, signMemberToken, verifyMemberRefreshToken, verifyMemberToken } from "./member-auth.js";
import { stripPasswordHash } from "./user-sanitize.js";
import { assertNoMt5BindingConflict, mt5AccountBindingKey } from "./mt5-binding.js";
import {
  normalizeKoreanPhoneE164,
  createPhoneOtp,
  verifyAndConsumePhoneOtp,
  PURPOSE_REGISTER,
  smsProvider,
} from "./phone-otp.js";
import { buildOtpAuthUri, createTotpSecretBase32, verifyTotpCode } from "./google-totp.js";
import { buildSmsAddonUserFields } from "./sms-addon-user-fields.js";
import { buildMembershipForNewUser, membershipForApiResponse } from "./membership.js";

function normalizeEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function trimOrEmpty(v, max) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function trimOrNull(v, max) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

const SIGNUP_PLAN_CHOICES = new Set([
  "regular_default",
  "none",
  "event_1w_free",
  "event_1m_magictrading",
]);

const TOTP_ENROLL_TTL_MS = 10 * 60_000;
const SUPPORTED_UI_LANGS = new Set(["ko", "en", "ja", "zh", "es"]);
const COUNTRY_LANG_HINTS = {
  KR: "ko",
  KP: "ko",
  JP: "ja",
  CN: "zh",
  TW: "zh",
  HK: "zh",
  MO: "zh",
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  UY: "es",
  PY: "es",
  BO: "es",
  EC: "es",
  GT: "es",
  HN: "es",
  SV: "es",
  NI: "es",
  CR: "es",
  PA: "es",
  DO: "es",
  PR: "es",
  CU: "es",
};

function shouldRequireGoogleOtp(signupPlanChoice) {
  return signupPlanChoice === "regular_default";
}

function normalizeCountryCode(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2}$/.test(s)) return null;
  return s;
}

function normalizeUiLanguage(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (!SUPPORTED_UI_LANGS.has(s)) return null;
  return s;
}

function defaultLanguageByCountry(countryCode) {
  const cc = normalizeCountryCode(countryCode);
  if (!cc) return "en";
  return COUNTRY_LANG_HINTS[cc] || "en";
}

function issueMemberTokens(email, role) {
  const access = signMemberToken(email, role);
  return {
    token: access,
    access_token: access,
    refresh_token: signMemberRefreshToken(email, role),
    token_type: "Bearer",
  };
}

function bearerToken(req) {
  return String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function verifyGoogleIdToken(idToken) {
  const tok = String(idToken || "").trim();
  if (!tok) {
    const err = new Error("Google credential(id_token)이 필요합니다.");
    err.statusCode = 400;
    throw err;
  }
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok)}`;
  const r = await fetch(url, { method: "GET" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data || data.error_description || data.error) {
    const err = new Error("Google 토큰 검증에 실패했습니다. 다시 로그인해 주세요.");
    err.statusCode = 401;
    throw err;
  }
  const aud = String(data.aud || "").trim();
  const sub = String(data.sub || "").trim();
  const email = normalizeEmail(data.email);
  const emailVerified = String(data.email_verified || "").toLowerCase() === "true";
  const name = trimOrEmpty(data.name, 200);
  const picture = trimOrNull(data.picture, 500);
  if (!sub || !email || !isValidEmail(email)) {
    const err = new Error("Google 계정 정보(email/sub)가 올바르지 않습니다.");
    err.statusCode = 401;
    throw err;
  }
  const expectedAud = trimOrEmpty(process.env.GOOGLE_CLIENT_ID, 300);
  if (expectedAud && aud !== expectedAud) {
    const err = new Error("Google Client ID가 일치하지 않습니다. 서버 설정을 확인하세요.");
    err.statusCode = 401;
    throw err;
  }
  if (!emailVerified) {
    const err = new Error("이 Google 계정은 이메일 인증이 완료되지 않았습니다.");
    err.statusCode = 400;
    throw err;
  }
  return { sub, email, email_verified: emailVerified, name, picture };
}

export function createAuthRouter(mongodbUri, mongodbDb) {
  const r = Router();

  /** 휴대폰으로 SMS 인증번호 발송(회원가입 전). SMS_PROVIDER=mock 이면 콘솔에만 출력(로컬용). */
  r.post("/phone/request-code", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "MONGODB_URI가 필요합니다." });
    }
    try {
      const prov = smsProvider();
      if (prov === "twilio") {
        const hasSid = !!String(process.env.TWILIO_ACCOUNT_SID || "").trim();
        const hasToken = !!String(process.env.TWILIO_AUTH_TOKEN || "").trim();
        const hasFrom = !!String(process.env.TWILIO_SMS_FROM || "").trim();
        const hasMsgSvc = !!String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
        if (!hasSid || !hasToken || (!hasFrom && !hasMsgSvc)) {
          return res.status(503).json({
            error:
              "SMS(Twilio)가 설정되지 않았습니다. .env에 TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN 및 TWILIO_SMS_FROM 또는 TWILIO_MESSAGING_SERVICE_SID 를 넣거나, 로컬은 SMS_PROVIDER=mock 으로 테스트하세요.",
          });
        }
      }
      const body = req.body || {};
      const purpose = String(body.purpose || PURPOSE_REGISTER);
      if (purpose !== PURPOSE_REGISTER) {
        return res.status(400).json({ error: "지원하지 않는 purpose 입니다." });
      }
      const e164 = normalizeKoreanPhoneE164(body.phone);
      if (!e164) {
        return res.status(400).json({ error: "휴대전화 번호 형식(010-… 또는 10~11자리)을 확인해 주세요." });
      }
      const db = await connectDb(mongodbUri, mongodbDb);
      const ex = await db.collection(COL.users).findOne({ phone_e164: e164 });
      if (ex) {
        return res.status(409).json({ error: "이 휴대전화 번호는 이미 가입되어 있습니다. 로그인해 주세요." });
      }
      const reveal = String(process.env.SMS_MOCK_REVEAL || "").trim() === "1" && String(process.env.NODE_ENV || "") !== "production";
      const out = await createPhoneOtp(db, e164, PURPOSE_REGISTER, { canRevealMock: reveal });
      res.json({ ok: true, message: "인증번호를 발송했습니다. 문자(SMS)를 확인해 주세요.", ...out });
    } catch (e) {
      if (e && e.statusCode === 429) {
        return res.status(429).json({ error: e.message, next_allowed_at: e.next_allowed_at });
      }
      console.error(e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  /** 정규 플랜 가입 전 Google OTP(TOTP) 등록 키 생성 */
  r.post("/totp/enroll", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "MONGODB_URI가 필요합니다." });
    }
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Google OTP 등록을 위해 유효한 이메일을 입력하세요." });
      }
      const db = await connectDb(mongodbUri, mongodbDb);
      const now = new Date();
      const expires_at = new Date(now.getTime() + TOTP_ENROLL_TTL_MS);
      const setup_id = crypto.randomUUID().replace(/-/g, "");
      const secret_base32 = createTotpSecretBase32();
      const issuer = trimOrEmpty(process.env.TOTP_ISSUER || "Haengbokdodam Invest", 40) || "Haengbokdodam Invest";
      const otpauth_url = buildOtpAuthUri(secret_base32, email, issuer);
      await db.collection(COL.pending_totp_enrollments).deleteMany({ email, purpose: PURPOSE_REGISTER });
      await db.collection(COL.pending_totp_enrollments).insertOne({
        setup_id,
        email,
        purpose: PURPOSE_REGISTER,
        secret_base32,
        created_at: now,
        expires_at,
      });
      res.json({
        ok: true,
        setup_id,
        issuer,
        secret_base32,
        otpauth_url,
        expires_at: expires_at.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  r.post("/google/register-or-login", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "MONGODB_URI가 필요합니다." });
    }
    try {
      const body = req.body || {};
      const google = await verifyGoogleIdToken(body.credential || body.id_token);
      const db = await connectDb(mongodbUri, mongodbDb);
      const users = db.collection(COL.users);
      const now = new Date();

      let user = await users.findOne({ $or: [{ google_sub: google.sub }, { email: google.email }] });
      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        const signupPlanChoice = SIGNUP_PLAN_CHOICES.has(String(body.signup_plan_choice || "").trim())
          ? String(body.signup_plan_choice).trim()
          : "none";
        const smsAddonGoogle = buildSmsAddonUserFields(body.sms_addon_choice || "none", now);
        const doc = {
          email: google.email,
          password_hash: null,
          display_name: google.name || google.email.split("@")[0],
          phone: null,
          phone_e164: null,
          phone_verified_at: null,
          tv_username: null,
          mql5_email: null,
          mt5_login: null,
          mt5_server: null,
          mt5_account_binding_key: null,
          telegram_username: null,
          referral_code: null,
          signup_plan_choice: signupPlanChoice,
          telegram_chat_id: null,
          google_otp_enabled: false,
          google_otp_secret_base32: null,
          google_otp_enrolled_at: null,
          auth_provider: "google",
          google_sub: google.sub,
          google_email_verified: true,
          google_picture: google.picture,
          role: "free",
          status: "active",
          note: "",
          ...smsAddonGoogle,
          created_at: now,
          updated_at: now,
        };
        await users.insertOne(doc);
        user = doc;
      } else {
        if (user.google_sub && String(user.google_sub) !== google.sub) {
          return res.status(409).json({
            error: "이미 다른 Google 계정과 연결된 이메일입니다. 기존 방식으로 로그인 후 계정 연동을 확인해 주세요.",
          });
        }
        await users.updateOne(
          { _id: user._id },
          {
            $set: {
              auth_provider: "google",
              google_sub: google.sub,
              google_email_verified: true,
              google_picture: google.picture || user.google_picture || null,
              display_name: user.display_name || google.name || user.display_name,
              updated_at: now,
            },
          }
        );
        user = await users.findOne({ _id: user._id });
      }

      const role = String((user && user.role) || "free").toLowerCase();
      const tokens = issueMemberTokens(google.email, role);
      const safe = stripPasswordHash(user);
      safe.membership = membershipForApiResponse(user);
      const needsProfileCompletion = !user.phone_e164;
      res.json({
        ok: true,
        ...tokens,
        user: safe,
        is_new_user: isNewUser,
        needs_profile_completion: needsProfileCompletion,
      });
    } catch (e) {
      const sc = e && e.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;
      res.status(sc).json({ error: String(e.message || e) });
    }
  });

  r.post("/register", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({
        error: "서버에 MONGODB_URI가 설정되어야 회원가입이 가능합니다.",
      });
    }
    try {
      const body = req.body || {};
      const memberTierRaw = String(body.member_tier || body.memberTier || "full").toLowerCase();
      const memberTier = memberTierRaw === "associate" ? "associate" : "full";

      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const display_name = trimOrEmpty(body.display_name, 200);
      const agree_terms = body.agree_terms === true || body.agree_terms === "true";
      const agree_privacy = body.agree_privacy === true || body.agree_privacy === "true";

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "유효한 이메일(로그인 ID)을 입력하세요." });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      }
      if (!display_name) {
        return res.status(400).json({ error: "이름을 입력하세요." });
      }
      if (!agree_terms || !agree_privacy) {
        return res.status(400).json({ error: "필수 약관에 모두 동의해 주세요." });
      }

      let phone = "";
      /** @type {string|null} */
      let phone_e164 = null;
      /** @type {Date|null} */
      let phone_verified_at = null;

      if (memberTier === "associate") {
        phone = "";
        phone_e164 = null;
        phone_verified_at = null;
      } else {
        phone = trimOrEmpty(body.phone, 40);
        if (!phone) {
          return res.status(400).json({ error: "휴대폰 번호는 필수입니다." });
        }
        phone_e164 = normalizeKoreanPhoneE164(phone);
        if (!phone_e164) {
          return res.status(400).json({ error: "휴대전화 번호 형식(010-… 또는 10~11자리)을 확인해 주세요." });
        }
      }
      const phoneOtp = String(body.phone_otp || body.phoneOtp || "")
        .replace(/\D/g, "")
        .trim();
      if (memberTier === "full" && phoneOtp.length !== 6) {
        return res.status(400).json({ error: "휴대폰으로 받은 6자리 인증번호를 입력해 주세요." });
      }
      const tv_username = trimOrNull(body.tv_username, 120);
      const mql5_email = trimOrNull(body.mql5_email, 200);
      const rawMt5Log = String(body.mt5_login ?? "").trim();
      const rawMt5Srv = String(body.mt5_server ?? "").trim();
      const hasMt5L = rawMt5Log.length > 0;
      const hasMt5S = rawMt5Srv.length > 0;
      if (hasMt5L !== hasMt5S) {
        return res.status(400).json({
          error: "MT5 계좌 번호와 서버 이름은 둘 다 입력하거나, 둘 다 비워 두세요.",
        });
      }
      const mt5_login = hasMt5L ? rawMt5Log.replace(/\s+/g, "").slice(0, 80) : null;
      const mt5_server = hasMt5S ? rawMt5Srv.slice(0, 120) : null;
      const mt5_account_binding_key = mt5AccountBindingKey(mt5_login, mt5_server);
      if (hasMt5L && hasMt5S && !mt5_account_binding_key) {
        return res.status(400).json({
          error: "MT5 계좌 번호는 숫자만, 서버 이름은 터미널(계정)에 보이는 그대로 입력해 주세요.",
        });
      }
      const telegram_username = trimOrNull(body.telegram_username, 80);
      const referral_code = trimOrNull(body.referral_code, 80);
      const referrer_homepage_id = normalizeEmail(body.referrer_homepage_id);
      const referrer_tr_id = trimOrNull(body.referrer_tr_id, 120);
      const referrer_mt5_id = trimOrNull(body.referrer_mt5_id, 120);
      const referrer_kiwoom_id = trimOrNull(body.referrer_kiwoom_id, 120);
      if (referrer_homepage_id && !isValidEmail(referrer_homepage_id)) {
        return res.status(400).json({ error: "추천인 홈페이지 ID는 이메일 주소 형식으로 입력해 주세요." });
      }
      const country_code = normalizeCountryCode(body.country_code || body.country);
      if (!country_code) {
        return res.status(400).json({ error: "국가 코드를 입력해 주세요. (ISO 2자리, 예: KR, US, JP)" });
      }
      const preferred_language = normalizeUiLanguage(body.preferred_language) || defaultLanguageByCountry(country_code);
      let signup_plan_choice = trimOrNull(body.signup_plan_choice, 40);
      if (memberTier === "associate") {
        signup_plan_choice = "none";
      } else if (signup_plan_choice && !SIGNUP_PLAN_CHOICES.has(signup_plan_choice)) {
        signup_plan_choice = "regular_default";
      } else if (!signup_plan_choice) {
        signup_plan_choice = "regular_default";
      }
      const googleOtpSetupId = trimOrNull(body.google_otp_setup_id, 120);
      const googleOtpCode = String(body.google_otp_code || "")
        .replace(/\D/g, "")
        .trim();
      if (memberTier !== "associate" && shouldRequireGoogleOtp(signup_plan_choice)) {
        if (!googleOtpSetupId) {
          return res.status(400).json({ error: "정규 플랜 가입은 Google OTP 등록이 필요합니다. 먼저 OTP 키를 생성하세요." });
        }
        if (googleOtpCode.length !== 6) {
          return res.status(400).json({ error: "정규 플랜 가입은 Google OTP 6자리 코드를 입력해야 합니다." });
        }
      }
      let telegram_chat_id = trimOrNull(body.telegram_chat_id, 32);
      if (telegram_chat_id) {
        telegram_chat_id = telegram_chat_id.replace(/\s+/g, "");
        if (!/^-?\d+$/.test(telegram_chat_id)) {
          return res.status(400).json({ error: "telegram_chat_id는 숫자(필요 시 음수)만 가능합니다. 봇과 대화 시작 후 id를 넣어 주세요." });
        }
      }

      if (mql5_email && !isValidEmail(mql5_email)) {
        return res.status(400).json({ error: "MQL5 이메일 형식이 올바르지 않습니다." });
      }

      const db = await connectDb(mongodbUri, mongodbDb);
      const existed = await db.collection(COL.users).findOne({ email });
      if (existed) {
        return res.status(409).json({ error: "이미 가입된 이메일입니다." });
      }
      if (phone_e164) {
        const phoneDup = await db.collection(COL.users).findOne({ phone_e164 });
        if (phoneDup) {
          return res.status(409).json({ error: "이 휴대전화 번호는 이미 다른 계정에 등록되어 있습니다." });
        }
      }
      if (memberTier === "full") {
        const otpOk = await verifyAndConsumePhoneOtp(db, phone_e164, PURPOSE_REGISTER, phoneOtp);
        if (!otpOk) {
          return res.status(400).json({
            error: "휴대폰 인증번호가 맞지 않거나 만료되었습니다. 인증번호를 다시 요청하세요.",
          });
        }
      }

      let google_otp_secret_base32 = null;
      let google_otp_enrolled_at = null;
      if (memberTier !== "associate" && shouldRequireGoogleOtp(signup_plan_choice)) {
        const pending = await db.collection(COL.pending_totp_enrollments).findOne({
          setup_id: googleOtpSetupId,
          purpose: PURPOSE_REGISTER,
        });
        if (!pending) {
          return res.status(400).json({ error: "Google OTP 등록 세션이 만료되었거나 찾을 수 없습니다. 키를 다시 생성해 주세요." });
        }
        if (String(pending.email || "").toLowerCase() !== email) {
          return res.status(400).json({ error: "Google OTP를 생성한 이메일과 가입 이메일이 다릅니다." });
        }
        if (new Date(pending.expires_at).getTime() < Date.now()) {
          await db.collection(COL.pending_totp_enrollments).deleteOne({ _id: pending._id });
          return res.status(400).json({ error: "Google OTP 등록 시간이 만료되었습니다. 키를 다시 생성해 주세요." });
        }
        const okGoogleOtp = verifyTotpCode(String(pending.secret_base32 || ""), googleOtpCode, 1);
        if (!okGoogleOtp) {
          return res.status(400).json({ error: "Google OTP 코드가 올바르지 않습니다. 앱의 6자리 코드를 다시 입력해 주세요." });
        }
        google_otp_secret_base32 = String(pending.secret_base32 || "");
        google_otp_enrolled_at = new Date();
        await db.collection(COL.pending_totp_enrollments).deleteOne({ _id: pending._id });
      }

      const bindConflict = await assertNoMt5BindingConflict(db, email, mt5_account_binding_key);
      if (bindConflict) {
        return res.status(bindConflict.status).json({ error: bindConflict.error });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const now = new Date();
      const smsAddon = buildSmsAddonUserFields(body.sms_addon_choice || "none", now);

      const membership = buildMembershipForNewUser({
        tier: memberTier,
        signup_plan_choice,
        phone_e164,
        phone_verified_at: phone_e164 ? now : null,
        google_otp_enrolled_at,
        google_otp_enabled: !!google_otp_secret_base32,
        mt5_account_binding_key,
        tv_username,
        mql5_email,
        now,
      });

      await db.collection(COL.users).insertOne({
        email,
        password_hash,
        display_name,
        dodam_member_tier: memberTier,
        membership,
        phone: phone_e164 ? phone : null,
        phone_e164,
        phone_verified_at: phone_e164 ? now : null,
        tv_username,
        mql5_email,
        mt5_login,
        mt5_server,
        mt5_account_binding_key: mt5_account_binding_key || null,
        telegram_username,
        referral_code,
        referrer_homepage_id: referrer_homepage_id || null,
        referrer_tr_id,
        referrer_mt5_id,
        referrer_kiwoom_id,
        country_code,
        preferred_language,
        signup_plan_choice,
        telegram_chat_id: telegram_chat_id || null,
        google_otp_enabled: !!google_otp_secret_base32,
        google_otp_secret_base32,
        google_otp_enrolled_at,
        ...smsAddon,
        role: "free",
        status: "active",
        note: "",
        created_at: now,
        updated_at: now,
      });

      res.status(201).json({
        ...issueMemberTokens(email, "free"),
        user: {
          email,
          role: "free",
          display_name,
          dodam_member_tier: memberTier,
          membership,
          phone: phone_e164 ? phone : null,
          phone_verified_at: phone_e164 ? now.toISOString() : null,
          tv_username,
          mql5_email,
          mt5_login,
          mt5_server,
          telegram_username,
          referral_code,
          referrer_homepage_id: referrer_homepage_id || undefined,
          referrer_tr_id: referrer_tr_id || undefined,
          referrer_mt5_id: referrer_mt5_id || undefined,
          referrer_kiwoom_id: referrer_kiwoom_id || undefined,
          country_code,
          preferred_language,
          signup_plan_choice,
          google_otp_enabled: !!google_otp_secret_base32,
          google_otp_enrolled_at: google_otp_enrolled_at ? google_otp_enrolled_at.toISOString() : undefined,
          telegram_chat_id: telegram_chat_id || undefined,
          sms_addon_choice: smsAddon.sms_addon_choice,
          sms_addon_quota_monthly: smsAddon.sms_addon_quota_monthly,
          sms_addon_price_usd: smsAddon.sms_addon_price_usd,
          sms_addon_active: smsAddon.sms_addon_active,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message) });
    }
  });

  /** 준회원 → 정회원: 로그인(X-User-Id) 상태에서 휴대폰 SMS·Google OTP까지 동일 검증 후 `dodam_member_tier` 를 `full` 로 올린다 — 1달 이벤트·무상 프로모 전제. */
  r.post("/associate/upgrade-to-full", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({
        error: "서버에 MONGODB_URI가 설정되어야 합니다.",
      });
    }
    try {
      const uidNorm = normalizeEmail(getUserId(req));
      if (!uidNorm || !isValidEmail(uidNorm)) {
        return res.status(401).json({ error: "로그인 이메일(X-User-Id)이 필요합니다. 사이트에서 로그인한 뒤 시도해 주세요." });
      }
      const db = await connectDb(mongodbUri, mongodbDb);
      const u = await db.collection(COL.users).findOne({ email: uidNorm });
      if (!u || !u.password_hash) {
        return res.status(404).json({ error: "회원 정보를 찾을 수 없습니다." });
      }
      if (String(u.status || "").trim().toLowerCase() === "suspended") {
        return res.status(403).json({ error: "이용이 정지된 계정입니다." });
      }
      if (String(u.dodam_member_tier || "").trim().toLowerCase() !== "associate") {
        return res.status(400).json({ error: "이 계정은 준회원이 아니거나 이미 전환 처리되었습니다." });
      }

      const signup_plan_choice_after = "regular_default";
      const body = req.body || {};
      const phone = trimOrEmpty(body.phone, 40);
      if (!phone) {
        return res.status(400).json({ error: "휴대폰 번호는 필수입니다." });
      }
      const phone_e164 = normalizeKoreanPhoneE164(phone);
      if (!phone_e164) {
        return res.status(400).json({ error: "휴대전화 번호 형식(010-… 또는 10~11자리)을 확인해 주세요." });
      }
      const phoneOtp = String(body.phone_otp || body.phoneOtp || "")
        .replace(/\D/g, "")
        .trim();
      if (phoneOtp.length !== 6) {
        return res.status(400).json({ error: "휴대폰 인증번호 6자리를 입력해 주세요." });
      }
      const googleOtpSetupId = trimOrNull(body.google_otp_setup_id, 120);
      const googleOtpCode = String(body.google_otp_code || "")
        .replace(/\D/g, "")
        .trim();
      if (shouldRequireGoogleOtp(signup_plan_choice_after)) {
        if (!googleOtpSetupId) {
          return res.status(400).json({
            error: "정규 회원 플로와 동일하게 Google OTP 등록이 필요합니다. 먼저 /api/auth/totp/enroll 로 키를 생성하세요.",
          });
        }
        if (googleOtpCode.length !== 6) {
          return res.status(400).json({ error: "Google OTP 6자리 코드를 입력해야 합니다." });
        }
      }

      const phoneDup = await db.collection(COL.users).findOne({
        phone_e164,
        email: { $ne: uidNorm },
      });
      if (phoneDup) {
        return res.status(409).json({
          error: "이 휴대전화 번호는 이미 다른 계정에 등록되어 있습니다.",
        });
      }

      const otpOk = await verifyAndConsumePhoneOtp(db, phone_e164, PURPOSE_REGISTER, phoneOtp);
      if (!otpOk) {
        return res.status(400).json({
          error: "휴대폰 인증번호가 맞지 않거나 만료되었습니다. 인증번호를 다시 요청하세요.",
        });
      }

      let google_otp_secret_base32 = null;
      let google_otp_enrolled_at = null;
      if (shouldRequireGoogleOtp(signup_plan_choice_after)) {
        const pending = await db.collection(COL.pending_totp_enrollments).findOne({
          setup_id: googleOtpSetupId,
          purpose: PURPOSE_REGISTER,
        });
        if (!pending) {
          return res.status(400).json({
            error: "Google OTP 등록 세션이 만료되었거나 없습니다. /api/auth/totp/enroll 을 다시 호출해 주세요.",
          });
        }
        if (String(pending.email || "").toLowerCase() !== uidNorm) {
          return res.status(400).json({
            error: "Google OTP를 생성한 이메일과 로그인 계정이 다릅니다.",
          });
        }
        if (new Date(pending.expires_at).getTime() < Date.now()) {
          await db.collection(COL.pending_totp_enrollments).deleteOne({ _id: pending._id });
          return res.status(400).json({ error: "Google OTP 등록 시간이 만료되었습니다." });
        }
        const okGoogle = verifyTotpCode(String(pending.secret_base32 || ""), googleOtpCode, 1);
        if (!okGoogle) {
          return res.status(400).json({ error: "Google OTP 코드가 올바르지 않습니다." });
        }
        google_otp_secret_base32 = String(pending.secret_base32 || "");
        google_otp_enrolled_at = new Date();
        await db.collection(COL.pending_totp_enrollments).deleteOne({ _id: pending._id });
      }

      const now = new Date();
      const membershipUpgrade = buildMembershipForNewUser({
        tier: "full",
        signup_plan_choice: signup_plan_choice_after,
        phone_e164,
        phone_verified_at: now,
        google_otp_enrolled_at,
        google_otp_enabled: !!google_otp_secret_base32,
        mt5_account_binding_key: u.mt5_account_binding_key,
        tv_username: u.tv_username,
        mql5_email: u.mql5_email,
        now,
      });
      await db.collection(COL.users).updateOne(
        { email: uidNorm },
        {
          $set: {
            dodam_member_tier: "full",
            membership: membershipUpgrade,
            signup_plan_choice: signup_plan_choice_after,
            phone: phone,
            phone_e164,
            phone_verified_at: now,
            google_otp_enabled: !!google_otp_secret_base32,
            google_otp_secret_base32,
            google_otp_enrolled_at,
            updated_at: now,
          },
        },
      );

      const u2 = await db.collection(COL.users).findOne({ email: uidNorm });
      const role = String(u2.role || "guest").toLowerCase();
      const safe = stripPasswordHash(u2);
      safe.membership = membershipForApiResponse(u2);
      res.json({
        ok: true,
        ...issueMemberTokens(uidNorm, role),
        user: safe,
        message:
          "정회원 절차가 반영되었습니다. 동일 브라우저에서 로그인·결제 페이지를 새로 고친 뒤 1달 이벤트·무상 플랜을 진행해 주세요.",
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message) });
    }
  });

  r.post("/login", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "서버에 MONGODB_URI가 설정되어야 로그인이 가능합니다." });
    }
    try {
      const { email: rawEmail, password } = req.body || {};
      const email = normalizeEmail(rawEmail);
      const pw = String(password || "");

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "이메일을 입력하세요." });
      }
      if (!pw) return res.status(400).json({ error: "비밀번호를 입력하세요." });

      const db = await connectDb(mongodbUri, mongodbDb);
      const user = await db.collection(COL.users).findOne({ email });
      if (!user || !user.password_hash) {
        return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
      }

      const ok = await bcrypt.compare(pw, user.password_hash);
      if (!ok) {
        return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
      }

      if (user.status === "suspended") {
        return res.status(403).json({ error: "이용이 정지된 계정입니다." });
      }

      const role = String(user.role || "guest").toLowerCase();
      const safe = stripPasswordHash(user);
      safe.membership = membershipForApiResponse(user);
      res.json({ ...issueMemberTokens(email, role), user: safe });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message) });
    }
  });

  r.get("/session", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "MONGODB_URI가 필요합니다." });
    }
    try {
      const payload = verifyMemberToken(bearerToken(req));
      if (!payload?.sub) {
        return res.status(401).json({ error: "유효한 로그인 토큰이 필요합니다." });
      }
      const db = await connectDb(mongodbUri, mongodbDb);
      const user = await db.collection(COL.users).findOne({ email: normalizeEmail(payload.sub) });
      if (!user || String(user.status || "").toLowerCase() === "suspended") {
        return res.status(401).json({ error: "로그인 세션이 유효하지 않습니다." });
      }
      const safe = stripPasswordHash(user);
      safe.membership = membershipForApiResponse(user);
      res.json({ ok: true, user: safe });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  r.post("/refresh", async (req, res) => {
    if (!mongodbUri) {
      return res.status(503).json({ error: "MONGODB_URI가 필요합니다." });
    }
    try {
      const body = req.body || {};
      const refreshToken = String(body.refresh_token || body.refreshToken || "").trim();
      let payload = refreshToken ? verifyMemberRefreshToken(refreshToken) : null;
      if (!payload) {
        payload = verifyMemberToken(bearerToken(req));
      }
      if (!payload?.sub) {
        return res.status(401).json({ error: "갱신 가능한 로그인 세션이 없습니다." });
      }
      const email = normalizeEmail(payload.sub);
      const db = await connectDb(mongodbUri, mongodbDb);
      const user = await db.collection(COL.users).findOne({ email });
      if (!user || String(user.status || "").toLowerCase() === "suspended") {
        return res.status(401).json({ error: "로그인 세션이 유효하지 않습니다." });
      }
      const role = String(user.role || "guest").toLowerCase();
      const safe = stripPasswordHash(user);
      safe.membership = membershipForApiResponse(user);
      res.json({ ok: true, ...issueMemberTokens(email, role), user: safe });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  return r;
}
