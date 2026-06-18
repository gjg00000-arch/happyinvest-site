import { connectDb, COL } from "./db.js";
import { verifyMemberToken } from "./member-auth.js";

function bearerToken(req) {
  return String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function isAdminApiPath(req) {
  const raw = String(req.originalUrl || req.url || req.path || "");
  const pathOnly = raw.split("?")[0];
  return pathOnly.startsWith("/api/admin");
}

/**
 * JWT Bearer 토큰을 서버 인증의 단일 기준으로 삼아 req.user를 바인딩한다.
 * X-User-Id는 토큰과 일치하는지 검증하는 보조 신호일 뿐, 단독 인증 수단으로 쓰지 않는다.
 * /api/admin/* 는 관리자 JWT( admin: true )를 별도 미들웨어가 처리하므로 회원 attach 를 건너뜀.
 */
export function createUserAttachMiddleware(uri, dbName) {
  return async function userAttach(req, res, next) {
    if (!uri) return next();
    if (isAdminApiPath(req)) return next();
    try {
      const token = bearerToken(req);
      req.user = null;
      req.auth = { authenticated: false };

      if (!token) {
        req.headers["x-user-id"] = "anonymous";
        req.headers["x-user-role"] = "guest";
        return next();
      }

      const tokenPayload = verifyMemberToken(token);
      if (!tokenPayload?.sub) {
        return res.status(401).json({ error: "유효하지 않거나 만료된 로그인 토큰입니다.", code: "invalid_token" });
      }

      const tokenEmail = String(tokenPayload.sub)
        .trim()
        .toLowerCase();
      const headerEmail = String(req.headers["x-user-id"] || "")
        .trim()
        .toLowerCase();
      if (headerEmail && headerEmail !== "anonymous" && headerEmail !== "guest@local" && headerEmail !== tokenEmail) {
        return res.status(401).json({ error: "로그인 토큰과 사용자 헤더가 일치하지 않습니다.", code: "token_subject_mismatch" });
      }

      const db = await connectDb(uri, dbName);
      const u = await db.collection(COL.users).findOne({ email: tokenEmail });
      if (!u) {
        return res.status(401).json({ error: "로그인 회원을 찾을 수 없습니다.", code: "user_not_found" });
      }
      if (u.status === "suspended") {
        req.headers["x-user-id"] = "anonymous";
        req.headers["x-user-role"] = "guest";
        return res.status(401).json({ error: "이용이 정지된 계정입니다.", code: "user_suspended" });
      }
      const role = String(u.role || tokenPayload.role || "free").toLowerCase();
      req.user = {
        id: String(u._id || ""),
        email: tokenEmail,
        role,
        status: String(u.status || "active"),
      };
      req.auth = { authenticated: true, token_type: "member", subject: tokenEmail };
      req.headers["x-user-id"] = tokenEmail;
      req.headers["x-user-role"] = role;
    } catch (e) {
      console.error("userAttach", e);
      return res.status(500).json({ error: "인증 컨텍스트 확인 중 오류가 발생했습니다.", code: "auth_context_error" });
    }
    next();
  };
}
