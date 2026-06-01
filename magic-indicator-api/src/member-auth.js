import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-change-JWT_SECRET-in-production";
const ACCESS_EXPIRES_IN = process.env.MEMBER_ACCESS_TOKEN_EXPIRES_IN || "30d";
const REFRESH_EXPIRES_IN = process.env.MEMBER_REFRESH_TOKEN_EXPIRES_IN || "180d";

export function signMemberToken(email, role) {
  return jwt.sign(
    {
      sub: String(email).toLowerCase(),
      role: String(role || "guest").toLowerCase(),
      typ: "access",
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

export function signMemberRefreshToken(email, role) {
  return jwt.sign(
    {
      sub: String(email).toLowerCase(),
      role: String(role || "guest").toLowerCase(),
      typ: "refresh",
    },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

export function verifyMemberToken(token) {
  try {
    const p = jwt.verify(String(token), JWT_SECRET);
    if (p.admin) return null;
    if (!p.sub) return null;
    if (p.typ && p.typ !== "access") return null;
    return p;
  } catch {
    return null;
  }
}

export function verifyMemberRefreshToken(token) {
  try {
    const p = jwt.verify(String(token), JWT_SECRET);
    if (p.admin) return null;
    if (!p.sub) return null;
    if (p.typ !== "refresh") return null;
    return p;
  } catch {
    return null;
  }
}
