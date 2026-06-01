/**
 * 빌드: assets/guide-doc-i18n.js — window.__MAGIC_GUIDE_DOC_BUNDLES
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "guide-doc-sources", "en", "guide-index-body.html");

const LANGS = ["en", "ja", "zh", "es"];

function stripBom(s) {
  const t = String(s || "");
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

const indexEn = stripBom(readFileSync(SRC, "utf8"));
const bundles = {};
for (const lang of LANGS) {
  bundles[lang] = { index: indexEn };
}

const body =
  ";(function(){\ntry {\nwindow.__MAGIC_GUIDE_DOC_BUNDLES = " +
  JSON.stringify(bundles) +
  ";\n} catch (_eGd) {}\n})();\n";

const outPath = path.join(ROOT, "assets", "guide-doc-i18n.js");
writeFileSync(outPath, body, "utf8");
if (!existsSync(outPath)) throw new Error("guide-doc-i18n write failed");
console.log("Wrote " + path.relative(ROOT, outPath));
