/**
 * SNS 크롤러는 보통 JS를 실행하지 않으므로, og:image를 빌드 시 SITE_ORIGIN 기준 절대 URL로 넣습니다.
 * 재실행 안전(idempotent): content가 이미 https로 시작하면 그대로 둡니다.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = (process.env.SITE_ORIGIN || "https://magicindicatorglobal.com").replace(/\/$/, "");

/**
 * @param {string} pageRelPosix e.g. "legal/refund.html"
 */
function pageBaseHref(pageRelPosix) {
  const dir = path.posix.dirname(pageRelPosix);
  if (!dir || dir === ".") return `${ORIGIN}/`;
  return `${ORIGIN}/${dir}/`;
}

/**
 * @param {string} html
 * @param {string} pageRelPosix
 */
function rewriteOgImage(html, pageRelPosix) {
  const base = pageBaseHref(pageRelPosix);
  return html.replace(
    /<meta\s+property="og:image"\s+content="([^"]*)"([^/>]*)\s*\/>/gi,
    (_whole, uri, tail) => {
      const trimmed = String(uri || "").trim();
      if (!trimmed) return _whole;
      if (/^https?:\/\//iu.test(trimmed)) return _whole;
      let abs;
      try {
        abs = new URL(trimmed, base).href;
      } catch {
        return _whole;
      }
      const rest = tail.replace(/\s*data-relative="1"\s*/i, "").trim();
      const spacer = rest ? ` ${rest} ` : " ";
      return `<meta property="og:image" content="${abs}"${spacer}/>`;
    }
  );
}

async function walkHtml(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "tools") continue;
      out.push(...(await walkHtml(full)));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const paths = await walkHtml(ROOT);
  let touched = 0;
  for (const absPath of paths) {
    const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
    let html = await fs.readFile(absPath, "utf8");
    const next = rewriteOgImage(html, rel);
    if (next !== html) {
      await fs.writeFile(absPath, next, "utf8");
      touched++;
    }
  }
  console.log(`[og-abs] rewritten ${touched} file(s), origin=${ORIGIN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
