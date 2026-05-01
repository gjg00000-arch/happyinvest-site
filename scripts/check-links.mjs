/**
 * 페이지 간 이동에 쓰인 HTML 파일 링크만 저장소 존재와 대조합니다.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAME_ORIGIN_URL = new URL((process.env.SITE_ORIGIN || "https://magicindicatorglobal.com").replace(/\/?$/, "") + "/");

const HREF_RE = /\bhref\s*=\s*"([^"]*)"/gi;

/** @param {string} fsPath */
function toPosix(fsPath) {

  return fsPath.split(path.sep).join("/");

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

function stripQH(raw) {


  let s = raw.trim();

  const ha = s.indexOf("#");

  const qu = s.indexOf("?");

  let cut = s.length;



  if (ha >= 0) cut = Math.min(cut, ha);



  if (qu >= 0) cut = Math.min(cut, qu);



  return s.slice(0, cut);


}

function baseName(px) {


  const parts = px.split(/\//);



  return parts[parts.length - 1] || "";


}



/** 다른 자산(CSS 등) 경로 제외 후 .html 페이지 링크인지 */


function looksHtmlPageHref(raw) {


  /** JS 문자열 조합 등 */


  if (/[\x00-\x1f+\r+\n+]|\+=|' +\s|getMagic/iu.test(raw))


    return false;





  const first = stripQH(raw);



  try {


    if (/^https?:\/\//iu.test(first)) {


      const pathname = new URL(first).pathname;





      const bn = decodeURIComponent(baseName(pathname.replace(/\/*$/u, "")));

      if (/\.[^.]+$/iu.test(bn))



        return /\.html?$/iu.test(bn);



      /** …/ 디렉터리 */



      return true;





    }





  } catch {


    return false;





  }






  const pathOnly = first.split("?")[0].split("#")[0];





  const bn = baseName(pathOnly);





  if (/\.[^.]+$/iu.test(bn))


    return /\.html?$/iu.test(bn);



  /** 확장명 없음 = 디렉터리 페이지로 간주 */



  return true;


}

/** 같은 배포 호스트 의 pathname ⇒ repo posix */


function pathnameToRepoPath(urlPathname) {


  let raw = decodeURIComponent(urlPathname);


  raw = raw.replace(/^\/+/u, "").replace(/\/*$/u, "");





  if (!raw)


    return "index.html";





  const segments = raw.split(/\//gu).filter(Boolean);



  const last = segments.at(-1);





  if (!last)



    return "index.html";





  if (last.includes("."))


    return segments.join("/");

  return [...segments, "index.html"].join("/");

}

/** @returns {string | null} */
function normalizedPageRel(fromHtmlAbs, hrefRaw) {


  const cleaned = stripQH(hrefRaw);





  if (!cleaned)



    return null;



  if (/^javascript:|^mailto:|^tel:|^data:/iu.test(cleaned))


    return null;





  if (/^https?:\/\//iu.test(cleaned)) {


    try {


      const url = new URL(cleaned);





      if (url.origin !== SAME_ORIGIN_URL.origin)


        return null;





      return pathnameToRepoPath(url.pathname);





    } catch {


      return null;





    }



  }






  const joinAbs = path.normalize(path.resolve(path.dirname(fromHtmlAbs), cleaned));


  if (!(joinAbs === ROOT || joinAbs.startsWith(ROOT + path.sep)))


    return null;



  return toPosix(path.relative(ROOT, joinAbs));


}

async function main() {


  const htmlAbsPaths = await walkHtml(ROOT);


  const repo = new Set(htmlAbsPaths.map((abs) => toPosix(path.relative(ROOT, abs))));





  /** @type {string[]} */


  const errors = [];

  for (const fromAbs of htmlAbsPaths) {


    const txt = await fs.readFile(fromAbs, "utf8");


    const relFrom = toPosix(path.relative(ROOT, fromAbs));


    let mm;





    while ((mm = HREF_RE.exec(txt)) !== null) {


      const raw = mm[1];


      if (!looksHtmlPageHref(raw))


        continue;



      const rel = normalizedPageRel(fromAbs, raw);





      if (rel == null)


        continue;



      if (!repo.has(rel))



        errors.push(`[links] ${relFrom} → href="${raw}" (없음: ${rel})`);





    }
  }

  if (errors.length) {
    errors.forEach((e) => console.error(e));
    console.error(`[links] 오류 ${errors.length}건`);
    process.exit(1);
  }

  console.log(`[links] OK — ${repo.size}개 HTML 페이지 링크 검사 통과`);

}

main().catch((e) => {



  console.error(e);



  process.exit(1);


});

