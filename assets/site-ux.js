/**
 * 공통 UX: 스킵링크, 다크모드, 언어(html lang), 토스트, fetch 재시도
 */
(function () {
  var THEME_KEY = "happyinvest-theme";
  var LANG_KEY = "happyinvest-lang";
  /** 상태 표시줄·PWA — 라이트/다크 브랜드 톤 (manifest theme_color 와 균형) */
  var META_THEME_LIGHT = "#2f6f4f";
  var META_THEME_DARK = "#0d1117";

  function toast(msg, opts) {
    opts = opts || {};
    var root = document.getElementById("ux-toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "ux-toast-root";
      document.body.appendChild(root);
    }
    var el = document.createElement("div");
    el.className = "ux-toast" + (opts.type === "warn" ? " ux-toast--warn" : "");
    el.setAttribute("role", "status");
    var span = document.createElement("span");
    span.textContent = msg;
    el.appendChild(span);
    if (opts.action && opts.onAction) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ux-toast__action";
      btn.textContent = opts.action;
      btn.addEventListener("click", function () {
        try {
          opts.onAction();
        } catch (e) {}
        el.remove();
      });
      el.appendChild(btn);
    }
    root.appendChild(el);
    var ms = opts.duration != null ? opts.duration : 5200;
    if (ms > 0) {
      setTimeout(function () {
        try {
          el.remove();
        } catch (e) {}
      }, ms);
    }
  }

  function fetchWithRetry(url, init, retries) {
    retries = retries == null ? 2 : retries;
    init = init || {};
    var attempt = 0;
    function delay(ms) {
      return new Promise(function (res) {
        setTimeout(res, ms);
      });
    }
    function go() {
      return fetch(url, init)
        .catch(function () {
          if (attempt < retries) {
            attempt++;
            return delay(600 * attempt).then(go);
          }
          throw new Error("network");
        })
        .then(function (r) {
          if (!r.ok && attempt < retries) {
            attempt++;
            return delay(600 * attempt).then(go);
          }
          return r;
        });
    }
    return go();
  }

  function syncThemeColorMeta() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var color = dark ? META_THEME_DARK : META_THEME_LIGHT;
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "theme-color");
      document.head.appendChild(m);
    }
    m.setAttribute("content", color);
    var ap = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!ap) {
      ap = document.createElement("meta");
      ap.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      document.head.appendChild(ap);
    }
    ap.setAttribute("content", dark ? "black-translucent" : "default");
  }

  function applyTheme(isDark) {
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    syncThemeColorMeta();
  }

  function initHeadReferrer() {
    if (document.querySelector('meta[name="referrer"]')) return;
    var meta = document.createElement("meta");
    meta.setAttribute("name", "referrer");
    meta.setAttribute("content", "strict-origin-when-cross-origin");
    var h = document.head;
    if (h && h.firstChild) h.insertBefore(meta, h.firstChild);
    else if (h) h.appendChild(meta);
  }

  function enhanceViewportMeta() {
    var v = document.querySelector('meta[name="viewport"]');
    if (!v) return;
    var c = v.getAttribute("content") || "";
    if (c.indexOf("viewport-fit") >= 0) return;
    v.setAttribute("content", c.replace(/\s*$/, "") + ", viewport-fit=cover");
  }

  function initTheme() {
    var saved = "";
    try {
      saved = localStorage.getItem(THEME_KEY) || "";
    } catch (e) {}
    if (saved === "light") applyTheme(false);
    else applyTheme(true);

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        try {
          var s = localStorage.getItem(THEME_KEY);
          if (!s) applyTheme(true);
        } catch (e) {}
      });
    }
  }

  function toggleTheme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var next = !dark;
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch (e) {}
    return next;
  }

  /** 5개 언어: ko, en, ja, zh(简体), es */
  var I18N_LANGS = [
    { code: "ko", label: "한국어" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "zh", label: "简体中文" },
    { code: "es", label: "Español" },
  ];
  var I18N_HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };

  var I18N = {
    ko: {
      skip: "본문으로 건너뛰기",
      navAria: "주요 메뉴",
      theme: "테마",
      themeAria: "밝기·어두움 전환",
      languageAria: "언어 선택",
      nav: {
        home: "메인",
        guide: "설치 안내",
        usage: "사용법",
        trv: "TRV 설정",
        mt5: "MT5 설정",
        downloads: "다운로드",
        register: "가입·등록",
        verify: "본인인증",
        billing: "구독·결제",
        events: "이벤트",
        membership: "회원혜택",
        reflection: "실전후기",
        contact: "문의",
        community: "모임터",
        promo: "홍보 인증",
        legal: "약관·정책",
        admin: "관리자",
        integrations: "연동",
        telegram: "텔레그램 Chat ID",
        tvr: "가이드 R",
      },
      indexTitle: "Magic 지표 · 매직라인",
      indexLead:
        "복잡한 분석보다 방향·구간·대응을 빠르게 보는 지표입니다. 차트에 입히고, 내 플랜을 고르고, 매직라인 방향만 확인하세요.",
      indexLeadHtml:
        "복잡한 분석보다 <strong>방향·구간·대응</strong>을 빠르게 보는 지표입니다. 차트에 입히고, 내 플랜을 고르고, 매직라인 방향만 확인하세요.",
    },
    en: {
      skip: "Skip to content",
      navAria: "Main menu",
      theme: "Theme",
      themeAria: "Toggle light/dark",
      languageAria: "Language",
      nav: {
        home: "Home",
        guide: "Setup",
        usage: "How to use",
        trv: "TRV setup",
        mt5: "MT5 setup",
        downloads: "Downloads",
        register: "Sign up",
        verify: "Verification",
        billing: "Billing",
        events: "Events",
        membership: "Membership",
        reflection: "Reviews",
        contact: "Contact",
        community: "Community",
        promo: "Promo proof",
        legal: "Legal",
        admin: "Admin",
        integrations: "Integrations",
        telegram: "Telegram Chat ID",
        tvr: "Guide R",
      },
      indexTitle: "Magic Indicators · Magic Line",
      indexLead:
        "A simple indicator for reading direction, zones, and response faster. Apply it to your chart, choose your plan, and check the Magic Line direction.",
    },
    ja: {
      skip: "本文へスキップ",
      navAria: "メインメニュー",
      theme: "テーマ",
      themeAria: "明暗を切替",
      languageAria: "言語",
      nav: {
        home: "ホーム",
        guide: "導入案内",
        usage: "使い方",
        trv: "TRV設定",
        mt5: "MT5設定",
        downloads: "ダウンロード",
        register: "登録",
        verify: "本人確認",
        billing: "請求",
        events: "イベント",
        membership: "会員",
        reflection: "実例",
        contact: "お問い合わせ",
        community: "コミュニティ",
        promo: "宣伝認証",
        legal: "規約",
        admin: "管理",
        integrations: "連携",
        telegram: "Telegram Chat ID",
        tvr: "ガイドR",
      },
      indexTitle: "Magic インジ · マジックライン",
      indexLead:
        "方向・ゾーン・対応をすばやく確認するためのシンプルなインジケーターです。チャートに適用し、プランを選び、Magic Line の方向を確認します。",
    },
    zh: {
      skip: "跳转至正文",
      navAria: "主导航",
      theme: "主题",
      themeAria: "切换明暗",
      languageAria: "语言",
      nav: {
        home: "首页",
        guide: "安装指南",
        usage: "使用方法",
        trv: "TRV 设置",
        mt5: "MT5 设置",
        downloads: "下载",
        register: "注册",
        verify: "身份验证",
        billing: "订阅与支付",
        events: "活动",
        membership: "会员",
        reflection: "实战反馈",
        contact: "联系",
        community: "社区",
        promo: "推广认证",
        legal: "条款与政策",
        admin: "管理",
        integrations: "集成",
        telegram: "Telegram Chat ID",
        tvr: "指南R",
      },
      indexTitle: "Magic 指标 · 魔线",
      indexLead:
        "用于快速查看方向、区间和应对的简洁指标。应用到图表，选择计划，然后确认 Magic Line 方向。",
    },
    es: {
      skip: "Ir al contenido",
      navAria: "Menú principal",
      theme: "Tema",
      themeAria: "Cambiar claro/oscuro",
      languageAria: "Idioma",
      nav: {
        home: "Inicio",
        guide: "Instalación",
        usage: "Uso",
        trv: "Config. TRV",
        mt5: "Config. MT5",
        downloads: "Descargas",
        register: "Registro",
        verify: "Verificación",
        billing: "Facturación",
        events: "Eventos",
        membership: "Membresía",
        reflection: "Reseñas",
        contact: "Contacto",
        community: "Comunidad",
        promo: "Prueba de promo",
        legal: "Legal",
        admin: "Admin",
        integrations: "Integraciones",
        telegram: "Telegram Chat ID",
        tvr: "Guía R",
      },
      indexTitle: "Indicadores Magic · Magic Line",
      indexLead:
        "Un indicador simple para leer dirección, zonas y respuesta con más rapidez. Aplícalo al gráfico, elige tu plan y revisa la dirección de Magic Line.",
    },
  };

  function getUiLang() {
    try {
      var lg = localStorage.getItem(LANG_KEY) || "ko";
      if (I18N[lg]) return lg;
    } catch (e) {}
    return "ko";
  }

  function setUiLang(code) {
    if (!I18N[code]) return;
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch (e) {}
    var h = I18N_HTML_LANG[code] || code;
    document.documentElement.setAttribute("lang", h);
  }

  function navKeyFromHref(absoluteUrl) {
    var u;
    try {
      u = new URL(absoluteUrl, window.location.href);
    } catch (e) {
      return null;
    }
    var s = (u.pathname + u.search).toLowerCase();
    if (s.indexOf("tradingview-magic") >= 0) return "tvr";
    if (s.indexOf("telegram-chat") >= 0) return "telegram";
    if (s.indexOf("board=event_promo_shoutout") >= 0) return "promo";
    if (s.indexOf("usage-trv") >= 0) return "trv";
    if (s.indexOf("usage-mt5") >= 0) return "mt5";
    if (s.indexOf("guide/usage") >= 0 || s.indexOf("/guide/usage") >= 0) return "usage";
    if (s.indexOf("guide/") >= 0 || s.indexOf("/guide") >= 0) return "guide";
    if (s.indexOf("downloads") >= 0) return "downloads";
    if (s.indexOf("registration") >= 0) return "register";
    if (s.indexOf("verify") >= 0) return "verify";
    if (s.indexOf("billing") >= 0) return "billing";
    if (s.indexOf("events") >= 0) return "events";
    if (s.indexOf("membership") >= 0) return "membership";
    if (s.indexOf("reflection") >= 0) return "reflection";
    if (s.indexOf("contact") >= 0) return "contact";
    if (s.indexOf("boards") >= 0) return "community";
    if (s.indexOf("legal") >= 0) return "legal";
    if (s.indexOf("admin") >= 0) return "admin";
    if (s.indexOf("integrations") >= 0) return "integrations";
    if (s.indexOf("index.html") >= 0) return "home";
    return "home";
  }

  function applyI18n(lang) {
    if (!I18N[lang]) lang = "ko";
    var t = I18N[lang];
    setUiLang(lang);

    var sk = document.querySelector(".skip-link");
    if (sk && t.skip) sk.textContent = t.skip;

    var nav = document.querySelector(".site-nav");
    if (nav) {
      if (t.navAria) nav.setAttribute("aria-label", t.navAria);
      var links = nav.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var key = navKeyFromHref(a.getAttribute("href"));
        if (key && t.nav && t.nav[key]) a.textContent = t.nav[key];
      }
    }

    var themeBtn = document.getElementById("ux-btn-theme");
    if (themeBtn) {
      themeBtn.setAttribute("aria-label", t.themeAria || t.theme);
      themeBtn.textContent = "🌓 " + (t.theme || "Theme");
    }

    var langLabel = document.getElementById("ux-lang-label");
    if (langLabel) {
      var L = I18N_LANGS;
      for (var j = 0; j < L.length; j++) {
        if (L[j].code === lang) {
          langLabel.textContent = L[j].label;
          break;
        }
      }
    }

    var items = document.querySelectorAll(".ux-lang__item");
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var c = it.getAttribute("data-lang");
      var chk = it.querySelector(".ux-lang__check");
      if (c === lang) {
        it.classList.add("is-active");
        it.setAttribute("aria-current", "true");
        if (chk) chk.textContent = "✓";
      } else {
        it.classList.remove("is-active");
        it.removeAttribute("aria-current");
        if (chk) chk.textContent = "";
      }
    }

    var langSum = document.getElementById("ux-btn-lang");
    if (langSum) langSum.setAttribute("aria-label", t.languageAria || "Language");

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      var path = el.getAttribute("data-i18n");
      if (!path) continue;
      var val = t[path];
      if (val == null) continue;
      el.textContent = val;
    }

    var elLead = document.getElementById("index-lead");
    if (elLead) {
      if (lang === "ko" && I18N.ko.indexLeadHtml) {
        elLead.innerHTML = I18N.ko.indexLeadHtml;
      } else if (t.indexLead) {
        elLead.textContent = t.indexLead;
      }
    }
  }

  function initSkipLink() {
    if (document.querySelector(".skip-link")) return;
    var a = document.createElement("a");
    a.className = "skip-link";
    a.href = "#main-content";
    a.textContent = I18N.ko.skip;
    document.body.insertBefore(a, document.body.firstChild);
    var main = document.querySelector("main");
    if (main && !main.id) main.id = "main-content";
    var wrap = document.querySelector(".wrap");
    if (!main && wrap && !wrap.id) wrap.id = "main-content";
  }

  function initChromeBar() {
    if (document.getElementById("ux-chrome-bar")) return;
    var nav = document.querySelector(".site-nav");
    if (!nav) return;
    var cur = getUiLang();

    var bar = document.createElement("div");
    bar.id = "ux-chrome-bar";
    bar.className = "ux-chrome-bar";
    var langHtml = "";
    for (var i = 0; i < I18N_LANGS.length; i++) {
      var L = I18N_LANGS[i];
      var active = L.code === cur;
      langHtml +=
        '<li><button type="button" class="ux-lang__item' +
        (active ? " is-active" : "") +
        '" data-lang="' +
        L.code +
        '"' +
        (active ? ' aria-current="true"' : "") +
        ">" +
        '<span>' +
        L.label +
        "</span>" +
        (active ? '<span class="ux-lang__check" aria-hidden="true">✓</span>' : '<span class="ux-lang__check" aria-hidden="true"></span>') +
        "</button></li>";
    }

    var curLabel = (function () {
      for (var j = 0; j < I18N_LANGS.length; j++) {
        if (I18N_LANGS[j].code === cur) return I18N_LANGS[j].label;
      }
      return I18N_LANGS[0].label;
    })();

    bar.innerHTML =
      '<div class="ux-chrome-bar__inner">' +
      '<button type="button" class="ux-chrome-btn" id="ux-btn-theme" aria-label="' +
      (I18N[cur] && I18N[cur].themeAria ? I18N[cur].themeAria : I18N.ko.themeAria) +
      '">🌓 ' +
      (I18N[cur] && I18N[cur].theme ? I18N[cur].theme : I18N.ko.theme) +
      "</button>" +
      '<details class="ux-lang" id="ux-lang-root">' +
      '<summary class="ux-lang__btn" id="ux-btn-lang" aria-label="' +
      (I18N[cur] && I18N[cur].languageAria ? I18N[cur].languageAria : I18N.ko.languageAria) +
      '">' +
      '<span class="ux-lang__globe" aria-hidden="true">🌐</span> ' +
      '<span id="ux-lang-label">' +
      curLabel +
      "</span></summary>" +
      '<ul class="ux-lang__menu" role="list">' +
      langHtml +
      "</ul></details></div>";
    nav.parentNode.insertBefore(bar, nav.nextSibling);

    document.getElementById("ux-btn-theme").addEventListener("click", function () {
      var reduced =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      function doToggleAndToast() {
        var nextDark = toggleTheme();
        var lg = getUiLang();
        var m = I18N[lg] || I18N.ko;
        toast(
          nextDark
            ? lg === "ko"
              ? "다크 모드예요."
              : m.theme + ": dark"
            : lg === "ko"
              ? "라이트 모드예요."
              : m.theme + ": light",
          { duration: 2200 }
        );
      }

      if (document.startViewTransition && !reduced) {
        document.startViewTransition(function () {
          doToggleAndToast();
        });
      } else doToggleAndToast();
    });

    var root = document.getElementById("ux-lang-root");
    bar.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("button[data-lang]");
      if (!btn) return;
      var code = btn.getAttribute("data-lang");
      if (!code) return;
      e.preventDefault();
      applyI18n(code);
      if (root) root.removeAttribute("open");
      var labelFound = code;
      for (var tli = 0; tli < I18N_LANGS.length; tli++) {
        if (I18N_LANGS[tli].code === code) {
          labelFound = I18N_LANGS[tli].label;
          break;
        }
      }
      toast((code === "ko" ? "언어: " : "Language: ") + labelFound, { duration: 2000 });
    });

    document.addEventListener("click", function (e) {
      if (!root || !root.hasAttribute("open")) return;
      if (e.target && root.contains(e.target)) return;
      root.removeAttribute("open");
    });

    applyI18n(cur);
  }

  function initOgImageAbsolute() {
    var og = document.querySelector('meta[property="og:image"][data-relative="1"]');
    if (!og) return;
    var rel = og.getAttribute("content");
    if (!rel) return;
    try {
      var u = new URL(rel, window.location.origin);
      og.setAttribute("content", u.href);
      og.removeAttribute("data-relative");
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    initHeadReferrer();
    enhanceViewportMeta();
    initSkipLink();
    initTheme();
    initChromeBar();
    initOgImageAbsolute();
  });

  window.HappyUX = {
    toast: toast,
    fetchWithRetry: fetchWithRetry,
    getLang: getUiLang,
    setLang: function (code) {
      applyI18n(code);
    },
    applyI18n: applyI18n,
  };
})();
