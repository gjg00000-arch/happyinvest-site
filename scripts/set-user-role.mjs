#!/usr/bin/env node
/**
 * API 서버(.env 의 MONGODB_URI)에서 회원 role 변경.
 * 사용: node scripts/set-user-role.mjs geo590603@gmail.com admin
 */
import { MongoClient } from "mongodb";

const email = String(process.argv[2] || "")
  .trim()
  .toLowerCase();
const role = String(process.argv[3] || "admin")
  .trim()
  .toLowerCase();
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "magic_indicator";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("usage: MONGODB_URI=... node scripts/set-user-role.mjs <email> [role]");
  process.exit(1);
}
if (!uri) {
  console.error("MONGODB_URI 환경 변수가 필요합니다.");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const res = await db.collection("users").updateOne(
    { email },
    { $set: { role, status: "active", updated_at: new Date() } }
  );
  if (res.matchedCount === 0) {
    console.error(`users 문서 없음: ${email}`);
    process.exit(2);
  }
  console.log(JSON.stringify({ ok: true, email, role, modified: res.modifiedCount }, null, 2));
} finally {
  await client.close();
}
