/**
 * 각 HTML 검사(html-validate). 프로젝트 루트에서: npm run lint:html
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { HtmlValidate } from "html-validate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const cfg = JSON.parse(await fs.readFile(path.join(ROOT, ".htmlvalidate.json"), "utf8"));
const hv = new HtmlValidate(cfg);

/** @returns {Promise<string[]>} */
async function walkHtml(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      if (ent.name === "tools") continue;
      out.push(...(await walkHtml(p)));
    } else if (ent.isFile() && ent.name.endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

const files = await walkHtml(ROOT).then((paths) => paths.sort());

let errs = 0;
let warns = 0;

const verbose = process.env.LINT_HTML_VERBOSE === "1";

for (const abs of files) {
  const html = await fs.readFile(abs, "utf8");
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  try {
    const report = await hv.validateString(html, rel);
    for (const m of report.results.flatMap((r) => r.messages)) {
      const line = `[${rel}:${m.line ?? "?"}] ${m.ruleId || "rule"}: ${m.message}`;
      if (m.severity === 2) {
        errs++;
        console.error(line);
      } else if (m.severity === 1) {
        warns++;
        if (verbose) console.warn(line);
      }
    }
  } catch (e) {
    console.error(`[lint-html] ${rel}: ${e.message || e}`);
    errs++;
  }
}

console.log(`[lint-html] files=${files.length} errors=${errs} warnings=${warns}`);
if (errs > 0) process.exit(1);
