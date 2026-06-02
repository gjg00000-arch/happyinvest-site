/**
 * 공개 산출물에서 admin/ 정적 경로가 다시 노출되는지 검사합니다.
 * admin/ 내부 페이지의 자기 이동은 허용하고, 공개 HTML/JS 링크만 차단합니다.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_EXT = new Set([".html", ".js"]);
const ADMIN_HREF_RE =
  /\bhref\s*=\s*["'](?:https?:\/\/(?:www\.)?magicindicatorglobal\.com\/)?(?:\.{0,2}\/)*admin\/[^"']*["']/giu;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = toPosix(path.relative(ROOT, full));
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "tools" || ent.name === ".git") continue;
      if (rel === "admin") continue;
      out.push(...(await walk(full)));
    } else if (ent.isFile() && TARGET_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

let errors = 0;
for (const abs of await walk(ROOT)) {
  const rel = toPosix(path.relative(ROOT, abs));
  const src = await fs.readFile(abs, "utf8");
  for (const match of src.matchAll(ADMIN_HREF_RE)) {
    errors++;
    const before = src.slice(0, match.index);
    const line = before.split(/\r?\n/u).length;
    console.error(`[lint-admin-links] ${rel}:${line} 공개 admin 링크 금지: ${match[0]}`);
  }
}

if (errors > 0) {
  console.error(`[lint-admin-links] errors=${errors}`);
  process.exit(1);
}

console.log("[lint-admin-links] OK — 공개 admin 링크 없음");
