import fs from "fs";
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const marker = '<div data-magic-home-chunk="planPrices">';
const start = html.indexOf(marker);
if (start < 0) {
  console.error("planPrices chunk not found");
  process.exit(1);
}
let i = start + marker.length;
let depth = 1;
let fragEnd = i;
while (i < html.length && depth > 0) {
  const open = html.indexOf("<div", i);
  const close = html.indexOf("</div>", i);
  if (close < 0) break;
  const hasOpen = open >= 0 && open < close;
  if (hasOpen) {
    depth++;
    i = open + 4;
  } else {
    depth--;
    fragEnd = close;
    i = close + 6;
  }
}
const fragment = html.slice(start + marker.length, fragEnd);
fs.writeFileSync(new URL("../tmp-plan-ko-inner.html", import.meta.url), fragment);
console.log("wrote tmp-plan-ko-inner.html bytes", fragment.length);
