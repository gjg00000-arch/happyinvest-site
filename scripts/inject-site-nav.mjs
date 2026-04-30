/**
 * 단일 진실 원천: 상단 `<nav class="site-nav">` 전체 마크업 생성 후 각 HTML 에 주입합니다.
 * 실행: npm run build:nav
 *
 * NAV_REGEX: 클래스·aria-label 문구를 바꾸면 이 정규식과 모든 HTML 의 <nav> 구조를 동일하게 맞출 것.
 */
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");

const NAV_REGEX =
  /\s*<nav\s+class="site-nav"\s+aria-label="주요\s*메뉴"\s*>[\s\S]*?<\/nav>/;

/**
 * 페이지별 내비 성격과 현재 표시(active).
 * active 는 내비 항목 id 와 매칭(루트 메인은 "home").
 * guide/tradingview-magic-r 는 상단에 전용 탭이 없어 가이드 허브("guide")를 강조.
 */
export const PAGES = [
  { rel: "index.html", kind: "root", active: "home" },
  { rel: "billing/index.html", kind: "flat", active: "billing" },
  { rel: "boards/index.html", kind: "flat", active: "boards" },
  { rel: "contact/index.html", kind: "flat", active: "contact" },
  { rel: "downloads/index.html", kind: "flat", active: "downloads" },
  { rel: "events/index.html", kind: "flat", active: "events" },
  { rel: "integrations/index.html", kind: "flat", active: "integrations" },
  { rel: "membership/index.html", kind: "flat", active: "membership" },
  { rel: "reflection/index.html", kind: "flat", active: "reflection" },
  { rel: "head-daily-report/index.html", kind: "flat", active: "headDaily" },
  { rel: "registration/index.html", kind: "flat", active: "registration" },
  { rel: "telegram-chat-id/index.html", kind: "flat", active: null },
  { rel: "verify/index.html", kind: "flat", active: "verify" },
  { rel: "guide/index.html", kind: "guide", active: "guide" },
  { rel: "guide/usage.html", kind: "guide", active: "usage" },
  { rel: "guide/usage-trv.html", kind: "guide", active: "trv" },
  { rel: "guide/usage-mt5.html", kind: "guide", active: "mt5" },
  { rel: "guide/tradingview-magic-r.html", kind: "guide", active: "guide" },
  { rel: "legal/index.html", kind: "legalHub", active: "legal" },
  { rel: "legal/access-matrix.html", kind: "legalLeaf", active: null },
  { rel: "legal/plan-terms-nonrefund.html", kind: "legalLeaf", active: null },
  { rel: "legal/privacy.html", kind: "legalLeaf", active: null },
  { rel: "legal/refund.html", kind: "legalLeaf", active: null },
  { rel: "legal/terms-magictrading-event.html", kind: "legalLeaf", active: null },
  { rel: "legal/terms-magictrading-free-trial.html", kind: "legalLeaf", active: null },
  { rel: "legal/terms-magictrading-regular.html", kind: "legalLeaf", active: null },
  { rel: "legal/terms.html", kind: "legalLeaf", active: null },
  { rel: "admin/index.html", kind: "adminHome", active: null },
  { rel: "admin/monitor.html", kind: "adminMonitor", active: null },
];

/**
 * @param {string} href
 * @param {string} text
 * @param {boolean} cur
 */
function a(href, text, cur) {
  const c = cur ? ` aria-current="page"` : "";
  return `      <a href="${href}"${c}>${text}</a>`;
}

const U = (...segs) => path.posix.join("..", ...segs);

/**
 * 같은 1층 디렉터리(예: billing/index.html) 에 있으면 index.html, 아니면 ../slug
 * @param {string} flatDir 디렉터리명만 (예: "billing","contact")
 */
function siblingIndex(flatDir, folderName, restPath) {
  return flatDir === folderName ? "index.html" : U(restPath);
}

/**
 * @param {{ active: string | null }} spec
 */
function renderRoot(spec) {
  const act = spec.active;
  /** @type {string[]} */
  const lines = ['    <nav class="site-nav" aria-label="주요 메뉴">'];
  const push = (...xs) => lines.push(...xs);
  push(
    a("index.html", "메인", act === "home"),
    a("guide/index.html", "가이드", act === "guide"),
    a("guide/usage.html", "지표 사용", act === "usage"),
    a("guide/usage-trv.html", "TRV", act === "trv"),
    a("guide/usage-mt5.html", "MT5", act === "mt5"),
    a("downloads/index.html", "다운로드", act === "downloads"),
    a("registration/index.html", "가입·등록", act === "registration"),
    a("verify/index.html", "본인인증", act === "verify"),
    a("billing/index.html#payment-dual", "구독·결제", act === "billing"),
    a("events/index.html", "이벤트", act === "events"),
    a("membership/index.html", "회원혜택", act === "membership"),
    a("reflection/index.html", "실전후기", act === "reflection"),
    a("contact/index.html", "문의", act === "contact"),
    a("boards/index.html", "모임터", act === "boards"),
    a("boards/index.html?board=event_promo_shoutout", "추천·홍보", act === "promo"),
    a("legal/index.html", "약관·정책", act === "legal"),
    a("head-daily-report/index.html", "본부 데일리", act === "headDaily"),
    a("admin/index.html", "관리자", act === "admin"),
    a("integrations/index.html", "연동", act === "integrations")
  );
  lines.push("    </nav>");
  return `\n${lines.join("\n")}\n`;
}

/**
 * 최상위 단일 디렉터리 하위 페이지( flat )
 * @param {{ active: string | null }} spec
 * @param {string} flatDir 디렉터리 세그먼트 (예: "billing","telegram-chat-id")
 */
function renderFlat(spec, flatDir) {
  const act = /** @type {string | null} */ (spec.active);
  /** @type {string[]} */
  const lines = ['    <nav class="site-nav" aria-label="주요 메뉴">'];
  const push = (...xs) => lines.push(...xs);

  push(
    a(U("index.html"), "메인", false),
    a(U("guide/index.html"), "가이드", act === "guide"),
    a(U("guide/usage.html"), "지표 사용", act === "usage"),
    a(U("guide/usage-trv.html"), "TRV", act === "trv"),
    a(U("guide/usage-mt5.html"), "MT5", act === "mt5"),
    a(U("downloads/index.html"), "다운로드", act === "downloads"),
    a(U("registration/index.html"), "가입·등록", act === "registration"),
    a(U("verify/index.html"), "본인인증", act === "verify"),
    a(
      siblingIndex(flatDir, "billing", "billing/index.html"),
      "구독·결제",
      act === "billing"
    ),
    a(siblingIndex(flatDir, "events", "events/index.html"), "이벤트", act === "events"),
    a(U("membership/index.html"), "회원혜택", act === "membership"),
    a(U("reflection/index.html"), "실전후기", act === "reflection"),
    a(U("contact/index.html"), "문의", act === "contact"),
    a(siblingIndex(flatDir, "boards", "boards/index.html"), "모임터", act === "boards"),
    a(U("boards/index.html?board=event_promo_shoutout"), "추천·홍보", act === "promo"),
    a(U("legal/index.html"), "약관·정책", act === "legal"),
    a(U("admin/index.html"), "관리자", act === "admin"),
    a(
      siblingIndex(flatDir, "integrations", "integrations/index.html"),
      "연동",
      act === "integrations"
    )
  );
  lines.push("    </nav>");
  return `\n${lines.join("\n")}\n`;
}

/**
 * @param {{ active: string | null }} spec
 */
function renderGuide(spec) {
  const x = /** @type {string | null} */ (spec.active);
  /** @type {string[]} */
  const lines = ['    <nav class="site-nav" aria-label="주요 메뉴">'];
  const push = (...xs) => lines.push(...xs);

  push(
    a(U("index.html"), "메인", false),
    a("index.html", "가이드", x === "guide"),
    a("usage.html", "지표 사용", x === "usage"),
    a("usage-trv.html", "TRV", x === "trv"),
    a("usage-mt5.html", "MT5", x === "mt5"),
    a(U("downloads/index.html"), "다운로드", x === "downloads"),
    a(U("registration/index.html"), "가입·등록", x === "registration"),
    a(U("verify/index.html"), "본인인증", x === "verify"),
    a(U("billing/index.html"), "구독·결제", x === "billing"),
    a(U("events/index.html"), "이벤트", x === "events"),
    a(U("membership/index.html"), "회원혜택", x === "membership"),
    a(U("reflection/index.html"), "실전후기", x === "reflection"),
    a(U("contact/index.html"), "문의", x === "contact"),
    a(U("boards/index.html"), "모임터", x === "boards"),
    a(U("boards/index.html?board=event_promo_shoutout"), "추천·홍보", false),
    a(U("legal/index.html"), "약관·정책", false),
    a(U("head-daily-report/index.html"), "본부 데일리", false),
    a(U("admin/index.html"), "관리자", false),
    a(U("integrations/index.html"), "연동", false)
  );
  lines.push("    </nav>");
  return `\n${lines.join("\n")}\n`;
}

/**
 * 약관 허브 / 약관 하위: 동일 한 줄만 약관 강조 여부 차이
 * @param {{ active?: string | null }} spec
 * @param {{ highlightLegal?: boolean }} opt
 */
function renderLegal(spec, opt) {
  const act = /** @type {string | null} */ (spec.active);
  const highlightLegal = !!(opt.highlightLegal && act === "legal");
  /** @type {string[]} */
  const lines = ['    <nav class="site-nav" aria-label="주요 메뉴">'];
  const push = (...xs) => lines.push(...xs);

  push(
    a(U("index.html"), "메인", false),
    a(U("guide/index.html"), "가이드", false),
    a(U("guide/usage.html"), "지표 사용", false),
    a(U("guide/usage-trv.html"), "TRV", false),
    a(U("guide/usage-mt5.html"), "MT5", false),
    a(U("downloads/index.html"), "다운로드", false),
    a(U("registration/index.html"), "가입·등록", false),
    a(U("verify/index.html"), "본인인증", false),
    a(U("billing/index.html"), "구독·결제", false),
    a(U("events/index.html"), "이벤트", false),
    a(U("membership/index.html"), "회원혜택", false),
    a(U("reflection/index.html"), "실전후기", false),
    a(U("contact/index.html"), "문의", false),
    a(U("boards/index.html"), "모임터", false),
    a(U("boards/index.html?board=event_promo_shoutout"), "추천·홍보", false),
    a("index.html", "약관·정책", highlightLegal),
    a(U("head-daily-report/index.html"), "본부 데일리", false),
    a(U("admin/index.html"), "관리자", false),
    a(U("integrations/index.html"), "연동", false)
  );
  lines.push("    </nav>");
  return `\n${lines.join("\n")}\n`;
}

/**
 * @param {{ }} spec
 * @param {{ monitorCurrent: boolean }} opt
 */
function renderAdmin(spec, opt) {
  /** @type {string[]} */
  const lines = ['    <nav class="site-nav" aria-label="주요 메뉴">'];
  const push = (...xs) => lines.push(...xs);

  push(
    a(U("index.html"), "메인", false),
    a(U("guide/index.html"), "가이드", false),
    a(U("guide/usage.html"), "지표 사용", false),
    a(U("guide/usage-trv.html"), "TRV", false),
    a(U("guide/usage-mt5.html"), "MT5", false),
    a(U("downloads/index.html"), "다운로드", false),
    a(U("registration/index.html"), "가입·등록", false),
    a(U("verify/index.html"), "본인인증", false),
    a(U("billing/index.html"), "구독·결제", false),
    a(U("events/index.html"), "이벤트", false),
    a(U("membership/index.html"), "회원혜택", false),
    a(U("reflection/index.html"), "실전후기", false),
    a(U("contact/index.html"), "문의", false),
    a(U("boards/index.html"), "모임터", false),
    a(U("boards/index.html?board=event_promo_shoutout"), "추천·홍보", false),
    a(U("legal/index.html"), "약관·정책", false),
    a(U("head-daily-report/index.html"), "본부 데일리", false),
    a("index.html", "관리자", !opt.monitorCurrent),
    a("monitor.html", "플랜 모니터", opt.monitorCurrent),
    a(U("integrations/index.html"), "연동", false)
  );
  lines.push("    </nav>");
  return `\n${lines.join("\n")}\n`;
}

function flatDirFromRel(rel) {
  const parts = rel.split("/");
  if (parts.length < 2) return "";
  return parts[0];
}

/**
 * @param {{ kind: string, rel: string, active?: string | null }} specPage
 */
function renderNavForPage(specPage) {
  const spec = {
    kind: specPage.kind,
    active:
      specPage.active === undefined || specPage.active === null ? null : specPage.active,
  };
  switch (specPage.kind) {
    case "root":
      return renderRoot(spec);
    case "flat": {
      const fd = flatDirFromRel(specPage.rel);
      return renderFlat(spec, fd);
    }
    case "guide":
      return renderGuide(spec);
    case "legalHub":
      return renderLegal(spec, { highlightLegal: true });
    case "legalLeaf":
      return renderLegal(spec, { highlightLegal: false });
    case "adminHome":
      return renderAdmin(spec, { monitorCurrent: false });
    case "adminMonitor":
      return renderAdmin(spec, { monitorCurrent: true });
    default:
      throw new Error(`unknown nav kind: ${specPage.kind}`);
  }
}

/** @returns {Promise<string[]>} */
async function walkHtmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      if (ent.name === "tools") continue;
      out.push(...(await walkHtmlFiles(p)));
    } else if (ent.isFile() && ent.name.endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 디스크의 *.html 과 PAGES 매니페스트 일치 검사 (누락·고아 경고).
 */
async function auditManifestAgainstDisk() {
  const absPaths = await walkHtmlFiles(SITE_ROOT);
  const onDisk = new Set(absPaths.map((abs) => path.relative(SITE_ROOT, abs).replace(/\\/g, "/")));
  const declared = new Set(PAGES.map((p) => p.rel));

  const missing = [...declared].filter((r) => !onDisk.has(r));
  for (const r of missing) {
    console.error(`[site-nav] 매니페스트에 있는 파일이 없음: ${r}`);
  }

  const ignoreOrphan = new Set(["404.html"]);
  const orphans = [...onDisk].filter((r) => !declared.has(r) && !ignoreOrphan.has(r));
  for (const r of orphans) {
    console.warn(`[site-nav] PAGES 에 없는 HTML (내비 주입 안 됨): ${r}`);
  }

  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  let n = 0;
  for (const page of PAGES) {
    const abs = path.join(SITE_ROOT, page.rel.replace(/\//g, path.sep));
    let html = await fs.readFile(abs, "utf8");
    const nextNav = renderNavForPage({
      ...page,
      active: page.active === undefined ? null : page.active,
    });
    if (!NAV_REGEX.test(html)) {
      console.error(`[site-nav] <nav.site-nav> not found (NAV_REGEX·마크업 확인): ${page.rel}`);
      process.exitCode = 1;
      continue;
    }
    const before = html;
    html = html.replace(NAV_REGEX, nextNav.trimEnd());
    if (before === html) {
      console.warn(`[site-nav] no change (already same?): ${page.rel}`);
    } else {
      await fs.writeFile(abs, html, "utf8");
      n++;
    }
  }
  console.log(`[site-nav] updated ${n} file(s)`);

  await auditManifestAgainstDisk();
}

const __file = fsSync.realpathSync.native(fileURLToPath(import.meta.url));
const invokedAsCli =
  Boolean(process.argv[1]) &&
  fsSync.realpathSync.native(path.resolve(process.argv[1])).toLowerCase() === __file.toLowerCase();

if (invokedAsCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
