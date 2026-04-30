/**
 * sitemap.xml + robots.txt 생성. 프로젝트 루트: npm run build:seo
 * 배포 도메인: SITE_ORIGIN (기본 https://happyinvests.com)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PAGES } from "./inject-site-nav.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ORIGIN = (process.env.SITE_ORIGIN || "https://happyinvests.com").replace(/\/$/, "");

/** 관리자 HTML은 공개 색인에서 제외(페이지 noindex + 사이트맵 미포함 + robots Disallow). */
const SITEMAP_PAGES = PAGES.filter(
  (p) => !p.rel.startsWith("admin/") && p.rel !== "head-daily-report/index.html"
);

const LASTMOD = new Date().toISOString().slice(0, 10);

/**
 * 파일 경로(index.html 포함)를 절대 URL 로
 * @param {string} rel posix
 */
function locFor(rel) {
  const norm =
    rel === "index.html" ? `${ORIGIN}/` : `${ORIGIN}/${rel.replace(/^\/+/, "")}`;
  return norm;
}

async function writeSitemap() {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...SITEMAP_PAGES.map(
      (p) => `  <url><loc>${locFor(p.rel)}</loc><lastmod>${LASTMOD}</lastmod></url>`
    ),
    `</urlset>`,
    ``,
  ];
  await fs.writeFile(path.join(ROOT, "sitemap.xml"), lines.join("\n"), "utf8");
  console.log(
    `[seo] wrote sitemap.xml (${SITEMAP_PAGES.length} URLs, skipped admin/*, origin=${ORIGIN})`
  );
}

async function writeRobots() {
  const body = `# 자동 생성 (npm run build:seo). 다른 도메인이면 SITE_ORIGIN 으로 다시 빌드.
User-agent: *
Allow: /

# 관리자 UI — 색인·사이트맵에서 제외(검색 노출 완화)
Disallow: /admin/

Sitemap: ${ORIGIN}/sitemap.xml
`;
  await fs.writeFile(path.join(ROOT, "robots.txt"), body, "utf8");
  console.log(`[seo] wrote robots.txt`);
}

await writeSitemap();
await writeRobots();
