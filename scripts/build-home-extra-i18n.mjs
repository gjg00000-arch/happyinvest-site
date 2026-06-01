/**
 * 빌드: assets/home-extra-i18n.js — window.__MAGIC_HOME_EXTRA_BUNDLES
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "assets", "home-extra-sources");

const HOME_EXTRA_LANGS = ["en", "ja", "zh", "es"];
const CHUNK_KEYS = [
  "hubMaps",
  "indicatorIntro",
  "quickView",
  "snapshotIntro",
  "magicTrading",
  "planPrices",
  "announceIntro",
  "discussIntro",
  "qaBlock",
  "marketIntro",
];

function stripBom(s) {
  const t = String(s || "");
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

function readUtf8(abs) {
  return stripBom(readFileSync(abs, "utf8"));
}

function loadChunk(lang, chunkKey) {
  const enPath = path.join(SRC_ROOT, "en", `${chunkKey}.html`);
  const langPath = path.join(SRC_ROOT, lang, `${chunkKey}.html`);
  if (existsSync(langPath)) return readUtf8(langPath);
  return readUtf8(enPath);
}

function loadBoardTitlesForLang(lang) {
  const enPath = path.join(SRC_ROOT, "en", "boardTitles.json");
  const base = JSON.parse(readUtf8(enPath));
  const langPath = path.join(SRC_ROOT, lang, "boardTitles.json");
  if (lang === "en" || !existsSync(langPath)) return { ...base };
  try {
    const overlay = JSON.parse(readUtf8(langPath));
    return { ...base, ...overlay };
  } catch (_e) {
    return { ...base };
  }
}

const bundles = {};
for (const lang of HOME_EXTRA_LANGS) {
  const chunks = {};
  for (const key of CHUNK_KEYS) chunks[key] = loadChunk(lang, key);
  bundles[lang] = {
    chunks,
    boardTitles: loadBoardTitlesForLang(lang),
  };
}

const body =
  ";(function(){\ntry {\nwindow.__MAGIC_HOME_EXTRA_BUNDLES = " +
  JSON.stringify(bundles) +
  ";\n} catch (_eHx) {}\n})();\n";

const outPath = path.join(ROOT, "assets", "home-extra-i18n.js");
writeFileSync(outPath, body, "utf8");
console.log("Wrote " + path.relative(ROOT, outPath));
