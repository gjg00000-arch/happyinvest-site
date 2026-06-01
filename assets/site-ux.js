/**
 * 공통 UX: 스킵링크, 다크모드, 언어(html lang), 토스트, fetch 재시도
 */
(function () {
  var THEME_KEY = "happyinvest-theme";
  var LANG_KEY = "happyinvest-lang";
  var VISITOR_ID_KEY = "happyinvest-visitor-id";
  /** 상태 표시줄·PWA — 라이트/다크 브랜드 톤 (manifest theme_color 와 균형) */
  var META_THEME_LIGHT = "#2f6f4f";
  var META_THEME_DARK = "#0d1117";

  function parseMockBody(init) {
    var raw = init && init.body;
    if (!raw || typeof raw !== "string") return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  function mockJsonResponse(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: {
        "Content-Type": "application/json",
        "X-Magic-Mock": "api-offline",
      },
    });
  }

  function mockApiPayload(pathname, init, reason) {
    var body = parseMockBody(init);
    var nowIso = new Date().toISOString();
    var unavailable = {
      ok: false,
      offline_mock: true,
      error: "API 서버 점검 중입니다. 임시 데이터로 화면을 유지합니다.",
      reason: reason || "api_unavailable",
    };
    if (pathname === "/api/health") return { ok: true, offline_mock: true, status: "mock", time: nowIso };
    if (pathname === "/api/site-visits") {
      return { ok: true, offline_mock: true, counted: false, today_visitors: 0, total_visitors: 0 };
    }
    if (pathname === "/api/public/trust-snapshot") {
      return { ok: true, offline_mock: true, site_visitors_today: 0, site_visitors_total: 0 };
    }
    if (pathname === "/api/payments/providers/status") {
      return {
        airwallex: { approved: false, keys_ready: false, enabled: false },
        paypal: { approved: false, keys_ready: false, enabled: false },
        coinbase: { approved: false, keys_ready: false, enabled: false },
        any_enabled: false,
        offline_mock: true,
      };
    }
    if (pathname === "/api/me/coupon-status") {
      return { ok: true, offline_mock: true, coupon_access_until: null, dodam_plan_expires_at: null };
    }
    if (pathname === "/api/payments/refund-preview") {
      return Object.assign({}, unavailable, {
        refund_amount_usd: 0,
        paid_amount_usd: 0,
        remaining_days: 0,
        total_days: 31,
        usd_krw: { rate: 0, refund_amount_krw: 0, source: "mock", is_fallback: true },
      });
    }
    if (pathname === "/api/payments/recovery6m/context") {
      return { ok: true, offline_mock: true, eligible: false, reason: "api_offline" };
    }
    if (pathname === "/api/legal/acceptances") {
      return { ok: true, offline_mock: true, acceptance_id: "mock-legal-acceptance", id: "mock-legal-acceptance" };
    }
    if (pathname === "/api/payments/prepare-checkout") {
      var amountUsd = Number(body.amount_usd || 0);
      return {
        ok: true,
        offline_mock: true,
        request_id: "mock-prep-" + Date.now().toString(36),
        status: "prepared",
        provider: body.provider || "manual",
        plan_code: body.plan_code || "mock_plan",
        amount_usd: Number.isFinite(amountUsd) ? amountUsd : 0,
        krw_invoice: {
          payable_amount_krw: 0,
          tracking_offset_krw: 0,
          customer_favorable_discount_krw: 0,
          rate: 0,
          source: "mock",
        },
      };
    }
    if (pathname === "/api/payments/paypal/create-order") {
      return Object.assign({}, unavailable, {
        ok: false,
        provider: "paypal",
        order_id: null,
        approve_url: "",
        request_id: "mock-paypal-" + Date.now().toString(36),
      });
    }
    if (pathname === "/api/payments/paypal/capture-order" || pathname === "/api/payment/webhook") {
      return Object.assign({}, unavailable, {
        provider: "paypal",
        order_id: body.order_id || body.orderID || null,
        capture_id: body.capture_id || null,
      });
    }
    if (pathname === "/api/payments/signup-plan/complete") {
      return {
        ok: true,
        offline_mock: true,
        plan_code: body.plan_code || "mock_plan",
        plan_sku: body.plan_code || "mock_plan",
        expires_at: null,
        message: "API 서버 점검 중이라 임시 처리되었습니다. 서버 복구 후 운영 확인이 필요합니다.",
      };
    }
    if (pathname === "/api/me/redeem-coupon") {
      return Object.assign({}, unavailable, { coupon_kind: null, coupon_access_until: null });
    }
    if (pathname === "/api/payments/refund-requests") {
      return { ok: true, offline_mock: true, request_id: "mock-refund-" + Date.now().toString(36), status: "received" };
    }
    if (pathname === "/api/payments/crypto-deposit/submit") {
      return {
        ok: true,
        offline_mock: true,
        tracking_ref: "MOCK-CRYPTO-" + Date.now().toString(36).toUpperCase(),
        currency: body.currency || body.crypto_currency || "USDT",
        submission_id: "mock",
      };
    }
    if (pathname === "/api/me/profile") {
      return { ok: true, offline_mock: true, email: "", tradingview_username: "", mt5_login: "", mt5_server: "" };
    }
    if (pathname === "/api/upload") {
      return Object.assign({}, unavailable, { url: "" });
    }
    if (pathname === "/api/posts") {
      return {
        ok: true,
        offline_mock: true,
        canRead: true,
        canWrite: false,
        posts: [],
        highlightTopViews: [],
        highlightTopComments: [],
        message: "API 서버 점검 중입니다. 게시글은 서버 복구 후 다시 표시됩니다.",
      };
    }
    if (/^\/api\/posts\/[^/]+\/comments$/.test(pathname)) {
      return { ok: true, offline_mock: true, comments: [] };
    }
    if (/^\/api\/posts\/[^/]+\/view$/.test(pathname)) {
      return { ok: true, offline_mock: true, viewed: false };
    }
    if (pathname.indexOf("/api/admin/") === 0) {
      return Object.assign({}, unavailable, { rows: [], items: [], users: [], stats: {} });
    }
    if (pathname.indexOf("/api/") === 0) return unavailable;
    return null;
  }

  function installApiMockFetch() {
    if (!window.fetch || window.__MAGIC_API_MOCK_FETCH_INSTALLED__) return;
    window.__MAGIC_API_MOCK_FETCH_INSTALLED__ = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var requestUrl = typeof input === "string" ? input : input && input.url;
      var parsed = null;
      try {
        parsed = new URL(requestUrl || "", window.location.href);
      } catch (e) {
        return nativeFetch(input, init);
      }
      var isMagicApi =
        parsed.pathname.indexOf("/api/") === 0 &&
        (parsed.hostname === window.location.hostname ||
          parsed.hostname === "magicindicatorglobal.com" ||
          parsed.hostname === "www.magicindicatorglobal.com");
      if (!isMagicApi) return nativeFetch(input, init);
      var fallback = mockApiPayload(parsed.pathname, init || {}, "api_unavailable");
      return nativeFetch(input, init)
        .then(function (res) {
          if (res && res.status >= 500 && fallback) {
            console.warn("[Magic API mock] " + parsed.pathname + " -> HTTP " + res.status);
            return mockJsonResponse(fallback, 200);
          }
          return res;
        })
        .catch(function (error) {
          if (!fallback) throw error;
          console.warn("[Magic API mock] " + parsed.pathname + " -> network fallback", error);
          return mockJsonResponse(fallback, 200);
        });
    };
  }

  installApiMockFetch();

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
    // 기본은 라이트(흰 바탕). localStorage에 "dark"로만 명시된 경우 다크.
    if (saved === "dark") applyTheme(true);
    else applyTheme(false);

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        try {
          var s = localStorage.getItem(THEME_KEY);
          // 사용자가 테마를 고른 적이 없으면 OS 변경에 맞춰 자동 다크로 바꾸지 않음(기본 라이트 유지).
          if (!s) applyTheme(false);
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

  /** UI 노출 순서 · 구글처럼 다국어 선택(네비 등 공통 카피는 en 복제, 본문/게시판은 자동번역 파이프) */
  var UX_SUPPORTED_LANG_LIST = [
    { code: "ko", label: "한국어" },
    { code: "en", label: "English" },
    { code: "zh", label: "简体中文" },
    { code: "zh-TW", label: "繁體中文" },
    { code: "ja", label: "日本語" },
    { code: "es", label: "Español (España / Latinoamérica)" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
    { code: "it", label: "Italiano" },
    { code: "pt", label: "Português" },
    { code: "pt-BR", label: "Português (Brasil)" },
    { code: "ru", label: "Русский" },
    { code: "uk", label: "Українська" },
    { code: "pl", label: "Polski" },
    { code: "nl", label: "Nederlands" },
    { code: "sv", label: "Svenska" },
    { code: "da", label: "Dansk" },
    { code: "no", label: "Norsk" },
    { code: "fi", label: "Suomi" },
    { code: "cs", label: "Čeština" },
    { code: "sk", label: "Slovenčina" },
    { code: "hu", label: "Magyar" },
    { code: "ro", label: "Română" },
    { code: "bg", label: "Български" },
    { code: "hr", label: "Hrvatski" },
    { code: "sr", label: "Српски" },
    { code: "sl", label: "Slovenščina" },
    { code: "el", label: "Ελληνικά" },
    { code: "tr", label: "Türkçe" },
    { code: "he", label: "עברית" },
    { code: "fa", label: "فارسی" },
    { code: "ar", label: "العربية" },
    { code: "hi", label: "हिन्दी" },
    { code: "bn", label: "বাংলা" },
    { code: "ta", label: "தமிழ்" },
    { code: "mr", label: "मराठी" },
    { code: "te", label: "తెలుగు" },
    { code: "ur", label: "اردو" },
    { code: "id", label: "Bahasa Indonesia" },
    { code: "ms", label: "Bahasa Melayu" },
    { code: "tl", label: "Filipino" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "th", label: "ไทย" },
    { code: "my", label: "မြန်မာ" },
    { code: "km", label: "ភាសាខ្មែរ" },
    { code: "lo", label: "ລາວ" },
    { code: "ne", label: "नेपाली" },
    { code: "si", label: "සිංහල" },
    { code: "ka", label: "ქართული" },
    { code: "hy", label: "Հայերեն" },
    { code: "az", label: "Azərbaycanca" },
    { code: "kk", label: "Қазақша" },
    { code: "uz", label: "Oʻzbek" },
    { code: "mn", label: "Монгол" },
    { code: "sw", label: "Kiswahili" },
    { code: "af", label: "Afrikaans" },
    { code: "zu", label: "isiZulu" },
    { code: "is", label: "Íslenska" },
    { code: "et", label: "Eesti" },
    { code: "lv", label: "Latviešu" },
    { code: "lt", label: "Lietuvių" },
    { code: "ca", label: "Català" },
    { code: "gl", label: "Galego" },
    { code: "eu", label: "Euskara" },
    { code: "sq", label: "Shqip" },
  ];

  var I18N = {
    ko: {
      skip: "본문으로 건너뛰기",
      navAria: "주요 메뉴",
      theme: "테마",
      themeAria: "밝기·어두움 전환",
      languageAria: "언어 선택",
      visitToday: "오늘",
      visitTotal: "누적",
      nav: {
        home: "메인",
        guide: "설치 안내",
        usage: "사용법",
        trv: "TRV 설정",
        mt5: "MT5 설정",
        downloads: "다운로드",
        register: "가입·등록",
        login: "로그인",
        verify: "본인인증",
        billing: "구독·결제",
        events: "이벤트",
        membership: "회원혜택",
        reflection: "실전후기",
        contact: "문의",
        community: "모임터",
        devJournal: "개발자 일지",
        promo: "홍보 인증",
        legal: "약관·정책",
        headDaily: "본부 데일리",
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
      homeVisitorHint: "사이트 방문 고유 방문자 수(KST 일자·브라우저 ID 기준).",
      officialSiteBannerLabel: "공식 홈페이지",
      officialSiteBannerHint: "외부 안내·북마크 시 이 주소인지 확인하세요.",
    },
    en: {
      skip: "Skip to content",
      navAria: "Main menu",
      theme: "Theme",
      themeAria: "Toggle light/dark",
      languageAria: "Language",
      visitToday: "Today",
      visitTotal: "Total",
      nav: {
        home: "Home",
        guide: "Setup",
        usage: "How to use",
        trv: "TRV setup",
        mt5: "MT5 setup",
        downloads: "Downloads",
        register: "Sign up",
        login: "Log in",
        verify: "Verification",
        billing: "Billing",
        events: "Events",
        membership: "Membership",
        reflection: "Reviews",
        contact: "Contact",
        community: "Community",
        devJournal: "Indicator tuning",
        promo: "Promo proof",
        legal: "Legal",
        headDaily: "HQ Daily",
        admin: "Admin",
        integrations: "Integrations",
        telegram: "Telegram Chat ID",
        tvr: "Guide R",
      },
      indexTitle: "Magic Indicators · Magic Line",
      indexLead:
        "A simple indicator for reading direction, zones, and response faster. Apply it to your chart, choose your plan, and check the Magic Line direction.",
      homeVisitorHint: "Unique site visitors counted by browser ID per KST date.",
      officialSiteBannerLabel: "Official site",
      officialSiteBannerHint: "When bookmarking links, verify this URL.",
      homeMustReadHtml: [
        '<p class="ml-must-read__badge">Must read · Very important</p>',
        '<h2 class="ml-must-read__title" id="must-read-title">Please read before using this indicator</h2>',
        '<p class="ml-must-read__lede">',
        'This indicator is <strong>not</strong> a tool where you only follow signals. Without the mindset below, it is <strong>very hard to make consistent profits.</strong> Read this briefly and recall it whenever you are at the charts.',
        "</p>",
        '<aside class="ml-must-read__volume-callout" role="region" aria-labelledby="volume-tick-callout-quote">',
        '<p class="ml-must-read__volume-callout__quote" id="volume-tick-callout-quote">Prices can deceive; volume usually cannot.</p>',
        '<p class="ml-must-read__volume-callout__body">',
        "That idea often applies when reading markets too—the axis that matters is where <strong>trades and activity accumulate as ticks.</strong> ",
        "Rather than only staring at fixed time-based bars, we <strong>strongly recommend using tick charts whenever possible.</strong> ",
        'When interpreting each “candle”, <strong>1000-tick bars are especially recommended.</strong> ',
        'For setup, see <a href="guide/usage.html">TradingView setup</a> and <a href="guide/usage-mt5.html#tick-chart">MT5 tick charts</a>.',
        "</p>",
        "</aside>",
        '<ul class="ml-must-read__list">',
        "<li><strong>You do not need to enter often.</strong> It is fine to be <strong>slower</strong> and trade <strong>less often.</strong> ",
        "What fits this indicator is aiming for trades when <strong>you feel margin of safety is highest</strong>—when bands, R, and context align—and getting <strong>as close as you can to “one clean shot.”</strong></li>",
        "<li>If the market disagrees, you still need <strong>stop losses.</strong> That is not failure; it is <strong>accepting that your premise changed and stepping aside</strong> (moving your reference).</li>",
        "<li><strong>Trim greed.</strong> Instead of one huge win, stack <strong>smaller gains</strong> near the <strong>Magic Line (mean/center)</strong> or where a <strong>trailing stop</strong> defines the exit—that is closer to protecting the account each time the premise shifts.</li>",
        "<li><strong>Mean reversion</strong> is not only about certain names. For <strong>any market, any symbol</strong>, keep in mind the broad view that price that runs away tends to face a pull back toward the mean. This indicator rests on that premise.</li>",
        "<li>On the chart, <strong>buy/sell markers</strong> line up with the <strong>lower/upper band (entry guides)</strong>; exits and stops line up with <strong>near Magic Line, targets, and trail prices.</strong> (They may not match live fills or broker reports 1:1.)</li>",
        "<li><strong>TradingView, MarketFree, and similar distributed scripts</strong> must be <strong>applied per symbol and per timeframe chart</strong> to print signals inside that chart. ",
        "Fields like <code>license_pack</code> in JSON are only <strong>labels for which build</strong> you have—do <strong>not</strong> read them as your TradingView account being paid or “blocked”. (Billing follows TradingView.)</li>",
        "<li><strong>Alerts and webhooks are your choice.</strong> After attaching a strategy/indicator, turn off <strong>Settings (gear) → Properties → Inputs → 「Use alert() Messages」</strong> to prevent <code>alert()</code> from firing—then nothing goes to external servers or Telegram. ",
        "If you leave it on, create alert rules under TradingView ",
        '<strong>Alerts</strong> (webhook URLs, etc.) and see <a href="guide/magictrading-strategy-inputs-ko.html#signals">MagicTrading Signals</a>. Channels and usage are entirely up to you.</li>',
        "<li>The <strong>strategy tab simulated positions/fills</strong> on TradingView are <strong>separate</strong> from <strong>real broker balances or external auto-trading bots.</strong> The chart may show simulation only; live trading follows bridges, bots, and routing.</li>",
        "</ul>",
        '<p class="ml-must-read__warn">',
        "Tuning parameters without <strong>understanding</strong>, or blindly <strong>chasing signals</strong>, tends to enlarge losses. ",
        'Please read <a href="guide/magictrading-strategy-inputs-ko.html">MagicTrading inputs & tuning</a> and ',
        '<a href="guide/usage.html">how to use the indicators</a> <strong>together.</strong>',
        "</p>",
        '<p class="ml-must-read__foot small">Educational reference only; no performance is promised. Leveraged products can produce large losses.</p>',
      ].join(""),
      homeQuickStartHtml: [
        '<p class="ml-quick-start__badge">MagicLine quick start · 3-second guide</p>',
        '<h2 id="ml-quick-start-title">Keep it simple: three steps</h2>',
        '<div class="ml-quick-start__grid" role="list">',
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">1</span>',
        "<h3>Put it on your chart</h3>",
        "<p>",
        "<strong>TradingView:</strong> apply MagicLine to candles, ticks, or whatever fits your workspace. ",
        "<strong>MT5</strong> <code>.ex5</code> builds are offered <strong>for tick-chart use only</strong> (no separate M1/M5 candle-only build).",
        "</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">2</span>',
        "<h3>Pick a plan that fits you</h3>",
        "<p>Choose a plan for scalping, swing, etc., and complete signup.</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">3</span>',
        "<h3>Read the signal and respond</h3>",
        "<p>Before deep analysis, check Magic Line direction and zones.</p>",
        "</article>",
        "</div>",
        '<div class="ml-quick-start__why">',
        "<strong>Why keep it simple?</strong>",
        "<span>Less hesitation, faster execution. The more confident you are in the core, the shorter the explanation.</span>",
        "</div>",
        '<p class="ml-quick-start__actions">',
        '<a class="btn" href="registration/index.html">Start indicator signup</a>',
        '<a class="btn btn--ghost" href="registration/sms-addon.html">SMS signal monthly package</a>',
        '<a class="btn btn--ghost" href="guide/usage.html">View usage</a>',
        '<a class="btn btn--ghost" href="guide/magictrading-strategy-inputs-ko.html">MagicTrading inputs</a>',
        "</p>",
      ].join(""),
      homeI18nFoldHtml: [
        '<section class="ml-quick-start" id="trv-1week-whop-flow" aria-labelledby="trv-1week-whop-title" style="margin-top: 2rem">',
        '<p class="ml-quick-start__badge">Whop &amp; external funnel · 1-week TRV trial</p>',
        '<h2 id="trv-1week-whop-title">1-week (7-day) TradingView trial — steps</h2>',
        '<p class="small" style="margin: -0.25rem 0 1rem; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "If you arrived via Whop ads or product links, follow this order. For pricing and legal details see ",
        '<a href="events/index.html">Events &amp; pricing</a> and ',
        '<a href="legal/terms-magictrading-free-trial.html">7-day free trial terms</a>. ',
        "<strong>Submitting the trial requires an associate-member (or higher) login.</strong>",
        "</p>",
        '<ol class="notice-list" style="max-width: min(70rem, 100%); line-height: 1.72; padding-left: 1.35rem">',
        '<li style="margin-bottom: 0.5rem"><strong>Open the link</strong> from Whop (or similar) and land on ',
        '<strong>the official site <a href="https://magicindicatorglobal.com/">https://magicindicatorglobal.com/</a></strong>.</li>',
        '<li style="margin-bottom: 0.5rem"><strong>Associate signup</strong> (no SMS, minimal info) — ',
        '<a href="registration/associate.html">Associate signup (one-week unpaid trial eligibility)</a></li>',
        '<li style="margin-bottom: 0.5rem">After login, apply under ',
        '<a href="billing/index.html?signup=1&amp;plan=event_1w_free">Billing → 7-day free trial</a>. ',
        "Enter your <strong>TradingView (TRV) username</strong> or <strong>MT5 account + server</strong> and submit agreements and signature.",
        "</li>",
        '<li style="margin-bottom: 0.5rem">When submitted, the <strong>ledger and member profile are updated.</strong> Admins verify intake from ',
        '<a href="admin/monitor.html">Plan monitor</a>.</li>',
        '<li style="margin-bottom: 0.5rem"><strong>Admins</strong> follow up with TradingView <strong>invites / script provisioning</strong> based on your request.</li>',
        '<li style="margin-bottom: 0.5rem">When done, we email the address on file. If nothing arrives, check spam then ',
        '<a href="contact/index.html">Contact</a>.</li>',
        "</ol>",
        '<p class="small" style="margin: 1rem 0 0; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "On the Plan monitor home grid, admins can copy TRV usernames·MT5 IDs·email via the clipboard buttons beside each row.",
        "</p>",
        "</section>",
        '<section class="ml-cloud-care" aria-labelledby="ml-cloud-care-title">',
        '<p class="ml-cloud-care__badge">Optional add-on · technical environment management</p>',
        "<h2 id=\"ml-cloud-care-title\">MagicLine 24/7 cloud care</h2>",
        '<p class="ml-cloud-care__lead">',
        "Optional assistance if you struggle to leave charts running or maintaining settings.",
        " We help store settings, uptime checks, and alert connectivity for MagicLine setups. ",
        "<strong>Set option price (per month · USD)</strong>: Whop path <strong>$2,999</strong> · MQL path <strong>$3,499</strong>",
        "(MT5 · MagicLine 24/7 cloud care). Billed separately from the base license.",
        "</p>",
        '<div class="ml-cloud-care__grid" role="list">',
        '<article class="ml-cloud-care__card" role="listitem"><h3>Backup &amp; settings management</h3>',
        "<p>We preserve your MagicLine plan and chart settings and help restore them when needed.</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>Uptime stability checks</h3>',
        "<p>We periodically check MT5 and cloud runtime health.</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>Alert delivery support</h3>',
        "<p>We manage technical connectivity so configured MagicLine alerts reach the channels you chose.</p></article>",
        "</div>",
        '<p class="ml-cloud-care__notice">Technical environment assistance only—you remain responsible for investment decisions.</p>',
        "</section>",
        '<section class="home-payment-draft" id="payment-draft" aria-labelledby="payment-draft-h2">',
        '<p class="home-payment-draft__badge" role="presentation">Payments · Supported channels</p>',
        '<h2 id="payment-draft-h2" class="home-payment-draft__title">Four ways to pay</h2>',
        '<p class="home-payment-draft__lead">',
        "Available rails, workflows, and fees follow ",
        '<a href="billing/index.html#payment-dual">Billing</a> plus our policies.',
        ' This block summarizes published <strong>operating intent</strong> on the homepage.</p>',
        '<div class="home-payment-draft__grid" role="list">',
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">PayPal</h3>',
        '<p class="home-payment-draft__card-body">For lighter amounts, onboarding, or promos we usually start from <strong>card checkout</strong> via PayPal. Balance/paylater availability and fees obey PayPal and the checkout screen.',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">International USD wires</h3>',
        '<p class="home-payment-draft__card-body"><strong>Higher tiers and overseas accounts</strong> may pay via our ',
        '<strong>global beneficiary accounts</strong> (pick currency &amp; region on Billing). Bank names, account numbers, and SWIFT/IBAN are on ',
        '<a href="billing/index.html#wire-route-picker">Billing → wire picker</a> and invoices.',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">On-chain crypto</h3>',
        '<p class="home-payment-draft__card-body"><strong>USDT · USDC</strong>: select only Ledger-supported rails on Billing (USDT: TRON, Solana, Polygon / USDC: same + Arbitrum One). ',
        "<strong>TRON (TRC-20)</strong> example address: ",
        '<code style="font-size: 0.88em; word-break: break-all">TUBXMuAEGTN3WtM7NHVebe2MAYbuQTDjbw</code> · ',
        'Other chains via <a href="billing/index.html#crypto-deposit">Billing → crypto deposit</a>. ',
        'Major BTC/ETH settles without picking a subnet; exotic assets need a quote.',
        ' Deposits use <strong>pico precision + labels</strong> per order (see ',
        '<a href="billing/index.html#crypto-amount-signature">precision</a>, ',
        '<a href="billing/index.html#crypto-price-basis">FX guidance</a>).',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">Domestic corporate KRW</h3>',
        '<p class="home-payment-draft__card-body">KRW settlement uses <strong>Woori Bank · Haengbokdodam Invest · 61001073818213</strong>. Converting headline USD invoices to KRW follows the calculators on Billing.',
        "</p></article>",
        "</div>",
        '<p class="home-payment-draft__foot"><a href="billing/index.html#payment-dual">Billing details →</a></p>',
        '<p class="small" style="margin: 0.65rem 0 0; color: var(--ci-brown-muted); line-height: 1.62">',
        "International wires can take several days. Submitting clearing evidence (MT103/receipt references) ",
        '<strong>before funds fully clear may still qualify for early provisional access.</strong>',
        '<a href="billing/index.html#swift-gap-remedy"><strong>Wires &amp; evidence guide →</strong></a>',
        "</p>",
        "</section>",
      ].join(""),
    },
    ja: {
      skip: "本文へスキップ",
      navAria: "メインメニュー",
      theme: "テーマ",
      themeAria: "明暗を切替",
      languageAria: "言語",
      visitToday: "今日",
      visitTotal: "累計",
      nav: {
        home: "ホーム",
        guide: "導入案内",
        usage: "使い方",
        trv: "TRV設定",
        mt5: "MT5設定",
        downloads: "ダウンロード",
        register: "登録",
        login: "ログイン",
        verify: "本人確認",
        billing: "請求",
        events: "イベント",
        membership: "会員",
        reflection: "実例",
        contact: "お問い合わせ",
        community: "コミュニティ",
        devJournal: "指標の最適化",
        promo: "宣伝認証",
        legal: "規約",
        headDaily: "本部デイリー",
        admin: "管理",
        integrations: "連携",
        telegram: "Telegram Chat ID",
        tvr: "ガイドR",
      },
      indexTitle: "Magic インジ · マジックライン",
      indexLead:
        "方向・ゾーン・対応をすばやく確認するためのシンプルなインジケーターです。チャートに適用し、プランを選び、Magic Line の方向を確認します。",
      homeVisitorHint: "KST の日付とブラウザ ID 単位で集計したユニークなサイト訪問者数です。",
      officialSiteBannerLabel: "公式サイト",
      officialSiteBannerHint: "外部案内やブックマークの際、この URL をご確認ください。",
      homeMustReadHtml: [
        '<p class="ml-must-read__badge">必読 · とても重要</p>',
        '<h2 class="ml-must-read__title" id="must-read-title">ご利用の前に必ずお読みください</h2>',
        '<p class="ml-must-read__lede">',
        "本インジケータは <strong>シグナルを追うだけ</strong>で使えるツール<strong>ではありません</strong>。下記の準備・考え方がないと<strong>収益を出すことはとても難しくなります。</strong>短時間で読み、チャートの前でもう一度思い出してください。",
        "</p>",
        '<aside class="ml-must-read__volume-callout" role="region" aria-labelledby="volume-tick-callout-quote">',
        '<p class="ml-must-read__volume-callout__quote" id="volume-tick-callout-quote">価格はだませても、出来高はだませないことが多い。</p>',
        '<p class="ml-must-read__volume-callout__body">',
        "市場を見るときも前提に近いことがよくあります。意味のある軸は、<strong>約定や活発さが Tick として蓄積する側</strong>です。",
        "時間足だけに固定するより、できる限り<strong>ティックチャートを使うことを強くおすすめ</strong>します。",
        "バー単位で読むなら<strong>1000 Tick 足の組み合わせを特に強く推奨</strong>します。",
        '設定は <a href="guide/usage.html">TradingView 案内</a> と ',
        '<a href="guide/usage-mt5.html#tick-chart">MT5 ティックチャート</a> をあわせてご確認ください。',
        "</p>",
        "</aside>",
        '<ul class="ml-must-read__list">',
        "<li><strong>エントリーは頻繁である必要はありません。</strong>むしろ<strong>遅くて構いません</strong>し、回数を減らしても大丈夫です。",
        "むしろ<strong>安全域が一番高いと感じるとき</strong>――バンド・R・環境が揃うときに、",
        '<strong>「いい一打」に近い形で入る</strong>ことのほうが本インジに合っています。</li>',
        "<li>それでも市場が違えば<strong>損切りは必要です。</strong>それは失敗ではなく、",
        '<strong>判断の根拠が変わったと認めて身をひくこと</strong>（根拠の移動）に近いです。</li>',
        "<li><strong>欲張りは抑えます。</strong>一回で利益を最大化するより、",
        "<strong>Magic Line（平均・中心）</strong>付近や<strong>トレーリングストップ</strong>が決めた位置で、",
        '<strong>小さな利益でも積み上げる</strong>ほうが、根拠が動くたびに口座を守る道に近いです。</li>',
        "<li><strong>平均回帰</strong>は特定銘柄だけの話ではありません。",
        "<strong>どの市場・どの銘柄でも</strong>「一度伸びたら平均側へ戻ろうとする力」を念頭に置く",
        "<strong>普遍的な見方</strong>です。本インジもこの前提の上にあります。</li>",
        "<li>チャートでは<strong>買い／売りの印</strong>は<strong>バンド下線・上端（エントリー基準線）</strong>に合わせて表示され、",
        "利確・ストップは<strong>Magic Line 付近・目標・トレール価格</strong>に合わせて見えます。",
        "（約定やレポートの数字と必ずしも 1:1 ではありません。）</li>",
        "<li><strong>TradingView・MarketFree などの配布スクリプト</strong>は、",
        "<strong>銘柄・時間軸ごとのチャートにそれぞれ適用すると</strong>、そのチャート内でロジックどおりシグナルが出ます。",
        "JSON に付く <code>license_pack</code> のような項目は<strong>ビルドを区別するラベル</strong>であり、",
        "TradingView アカウントが有料か「ブロックされた」かという意味<strong>ではありません。</strong>",
        "（アカウント課金は TV の案内に従います。）</li>",
        "<li><strong>アラート・Webhook はユーザー側の設定です。</strong>",
        '戦略／インジをチャートに付けたうえで、右側の<strong>設定(歯車) → プロパティ → Inputs → 「Use alert() Messages」</strong>をオフにすると、',
        "<code>alert()</code> が飛ばないため外部サーバーや Telegram へも送信されません。",
        'オンにする場合は TV 上部の<strong>アラート</strong>でルールを作成し（Webhook URL など）、',
        '<a href="guide/magictrading-strategy-inputs-ko.html#signals">MagicTrading Signals の案内</a> ',
        'を参照してください。利用の可否・チャネルはご自身でお決めください。</li>',
        "<li><strong>TradingView 戦略タブのポジション・シミュレーション約定</strong> と、",
        "<strong>実際の証券会社や外部自動売買ボットの建玉</strong>は別です。チャートにはシミュレ結果だけが見えることがあります。実売買は中継・ボット・注文経路次第です。</li>",
        "</ul>",
        '<p class="ml-must-read__warn">',
        "<strong>理解しないまま</strong>設定だけいじったり<strong>シグナルだけ</strong>を追うと損失を拡げやすくなります。",
        '<a href="guide/magictrading-strategy-inputs-ko.html">MagicTrading 入力・微調整</a> と ',
        '<a href="guide/usage.html">インジの使い方</a> を<strong>必ず</strong>併読してください。',
        "</p>",
        '<p class="ml-must-read__foot small">教育・参考用の案内であり、収益は保証しません。レバレッジ商品は大きな損失の可能性があります。</p>',
      ].join(""),
      homeQuickStartHtml: [
        '<p class="ml-quick-start__badge">MagicLine はじめる · 3 秒ガイド</p>',
        '<h2 id="ml-quick-start-title">シンプルに、この 3 つだけ覚えてください</h2>',
        '<div class="ml-quick-start__grid" role="list">',
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">1</span>',
        "<h3>自分のチャートに載せる</h3>",
        "<p>",
        "<strong>TradingView</strong> ではロウソク・ティックなど環境に合わせ MagicLine を適用し、",
        "<strong>MT5</strong> で受け取る <code>.ex5</code> は <strong>ティックチャート専用</strong>としてのみ提供されています（M1/M5 等ロウソク専用ビルドはありません）。",
        "</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">2</span>',
        "<h3>自分に合うプランを選ぶ</h3>",
        "<p>デイトレ・スイングなどスタイルに合うプランを選び手続きを進めます。</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">3</span>',
        "<h3>シグナルを確認して対応する</h3>",
        "<p>複雑な解釈より先に、Magic Line の方向とゾーンを確認します。</p>",
        "</article>",
        "</div>",
        '<div class="ml-quick-start__why">',
        '<strong>なぜシンプルがよいか？</strong>',
        "<span>悩む時間を減らすと実行が速くなります。核に自信があるほど説明は短くて済みます。</span>",
        "</div>",
        '<p class="ml-quick-start__actions">',
        '<a class="btn" href="registration/index.html">インジ申込をはじめる</a>',
        '<a class="btn btn--ghost" href="registration/sms-addon.html">SMS シグナル月額パッケージ</a>',
        '<a class="btn btn--ghost" href="guide/usage.html">使い方を見る</a>',
        '<a class="btn btn--ghost" href="guide/magictrading-strategy-inputs-ko.html">MagicTrading 入力案内</a>',
        "</p>",
      ].join(""),
      homeI18nFoldHtml: [
        '<section class="ml-quick-start" id="trv-1week-whop-flow" aria-labelledby="trv-1week-whop-title" style="margin-top: 2rem">',
        '<p class="ml-quick-start__badge">Whop 等外部流入 · TRV 1週間トライアル</p>',
        '<h2 id="trv-1week-whop-title">1週間（7日間）TradingViewトライアル — 進め方</h2>',
        '<p class="small" style="margin: -0.25rem 0 1rem; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "Whop 広告・商品ページなどのリンクからお越しの方向けです。料金・条項は ",
        '<a href="events/index.html">イベント・料金</a> と ',
        '<a href="legal/terms-magictrading-free-trial.html">7日間無料トライアル条項</a> ',
        'を確認してください。<strong>7日間トライアルの提出・完了には準会員以上でのログインが必要です。</strong>',
        "</p>",
        '<ol class="notice-list" style="max-width: min(70rem, 100%); line-height: 1.72; padding-left: 1.35rem">',
        '<li style="margin-bottom: 0.5rem"><strong>Whop</strong>等の案内リンクをタップし、',
        '<strong>公式サイト <a href="https://magicindicatorglobal.com/">https://magicindicatorglobal.com/</a></strong> へアクセスしてください。',
        "</li>",
        '<li style="margin-bottom: 0.5rem"><strong>準会員登録</strong>（SMS なし・最小情報）— ',
        '<a href="registration/associate.html">準会員登録（1週間無料資格）</a></li>',
        '<li style="margin-bottom: 0.5rem">ログイン後、',
        '<a href="billing/index.html?signup=1&amp;plan=event_1w_free">請求・支払い → 7日間無料トライアル</a> で申請します。',
        '<strong>TradingView（TRV）ユーザー名</strong>または<strong>MT5口座番号＋サーバー</strong>を入力し、条項・署名まで提出します。',
        "</li>",
        '<li style="margin-bottom: 0.5rem">提出済みとなると<strong>システム台帳・会員情報に反映</strong>されます。管理者は',
        '<a href="admin/monitor.html">プランモニター（管理者）</a> で受付状況を確認します。',
        "</li>",
        '<li style="margin-bottom: 0.5rem"><strong>管理者</strong>が申請を踏まえ、TradingView <strong>招待・スクリプト適用</strong>などのフォローを行います。',
        "</li>",
        '<li style="margin-bottom: 0.5rem">手続き完了後<strong>ご登録のメールへ案内</strong>を送信します。届かない場合は迷惑メールを確認のうえ',
        '<a href="contact/index.html">お問い合わせ</a>をご利用ください。',
        "</li>",
        "</ol>",
        '<p class="small" style="margin: 1rem 0 0; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "プランモニター先頭の<strong>直近7日台帳</strong>表で、TRVユーザー名・MT5識別子・メール横の<strong>コピー</strong>ボタンからクリップボードへ取得できます（管理者ログインが必要）。",
        "</p>",
        "</section>",
        '<section class="ml-cloud-care" aria-labelledby="ml-cloud-care-title">',
        '<p class="ml-cloud-care__badge">オプション · 技術環境の管理</p>',
        "<h2 id=\"ml-cloud-care-title\">MagicLine 24/7 クラウドケア</h2>",
        '<p class="ml-cloud-care__lead">',
        "チャートを常時起動しづらい方・設定管理が負担な方向けの任意オプションです。",
        "MagicLine 利用環境の<strong>設定保管・稼働確認・アラート接続</strong>を技術面で支援します。",
        "<strong>確定オプション月額（USD）</strong>：Whop 経路 <strong>$2,999</strong> · MQL 経路 <strong>$3,499</strong>",
        "（MT5 · MagicLine 24/7 クラウドケア）。本体ライセンスとは別課金です。",
        "</p>",
        '<div class="ml-cloud-care__grid" role="list">',
        '<article class="ml-cloud-care__card" role="listitem"><h3>設定バックアップと管理</h3>',
        "<p>適用した MagicLine プランとチャート設定を保管し、必要時の復旧をサポートします。</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>稼働安定性の確認</h3>',
        "<p>MT5 およびクラウド実行環境の稼働を定期的に確認します。</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>アラート接続サポート</h3>',
        "<p>設定済み MagicLine アラートが指定チャネルへ正常送信されるよう接続状態を管理します。</p></article>",
        "</div>",
        '<p class="ml-cloud-care__notice">技術環境の補助オプションであり、投資判断の最終責任は利用者にあります。</p>',
        "</section>",
        '<section class="home-payment-draft" id="payment-draft" aria-labelledby="payment-draft-h2">',
        '<p class="home-payment-draft__badge" role="presentation">運営案内 · 決済チャネル</p>',
        '<h2 id="payment-draft-h2" class="home-payment-draft__title">お支払いは4経路</h2>',
        '<p class="home-payment-draft__lead">',
        "利用可能な手段・手数料・手順は ",
        '<a href="billing/index.html#payment-dual">請求・支払い</a> ',
        "および関連約款に従います。以下はホームで明示する<strong>運営指針</strong>です。",
        "</p>",
        '<div class="home-payment-draft__grid" role="list">',
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">PayPal</h3>',
        '<p class="home-payment-draft__card-body">少額・イベント・入会段階では<strong>カード決済（PayPal 経由）</strong>を優先案内します。残高サービスの可否・手数料は PayPal と決済画面の条件に従います。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">USD 銀行送金</h3>',
        '<p class="home-payment-draft__card-body"><strong>高額・正規・海外のお客様</strong>は ',
        '<strong>グローバル受取口座</strong>へ直接送金（請求ページで通貨・地域選択）。詳細な銀行名・口座・SWIFT/IBAN は ',
        '<a href="billing/index.html#wire-route-picker">決済ページの送金ガイド</a> とインボイスに記載されています。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">オンチェーン（クリプト）</h3>',
        '<p class="home-payment-draft__card-body"><strong>USDT · USDC</strong> は請求ページで<strong>Ledger 対応ネットワークのみ</strong>選択してください（USDT: TRON·Solana·Polygon / USDC: 同様＋Arbitrum One）。',
        " <strong>TRON(TRC-20)</strong> 受取の例:",
        '<code style="font-size: 0.88em; word-break: break-all">TUBXMuAEGTN3WtM7NHVebe2MAYbuQTDjbw</code>',
        ' · そのほかは <a href="billing/index.html#crypto-deposit">請求 → クリプト入金</a> に従ってください。',
        " BTC・ETH 等はネットワーク選択なしで換算し、その他コインは見積り後の送金が原則です。",
        " 入金識別には<strong>注文ごとの精密小数＋ラベル</strong>を用います（",
        '<a href="billing/index.html#crypto-amount-signature">精密金額</a>·',
        '<a href="billing/index.html#crypto-price-basis">換算</a>）。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">国内ウォンファクター振込</h3>',
        '<p class="home-payment-draft__card-body">国内ウォンは <strong>ウリ銀行 · Haengbokdodam Invest 株式会社 · 61001073818213</strong>',
        ' 法人口座およびインボイス基準で案内します。USD請求をウォン換算するときも決済ページの基準に従います。',
        "</p></article>",
        "</div>",
        '<p class="home-payment-draft__foot"><a href="billing/index.html#payment-dual">チャネル詳細は請求・支払いページへ →</a></p>',
        '<p class="small" style="margin: 0.65rem 0 0; color: var(--ci-brown-muted); line-height: 1.62">',
        "海外<strong>SWIFT送金</strong>には数日かかる場合があります。証跡が明瞭な<strong>銀行証憑(MT103 等）</strong>",
        'をいただければ<strong>入金確認前でも</strong>運用上ライン活用の先行許可が可能になる旨を案内しています。',
        '<a href="billing/index.html#swift-gap-remedy"><strong>送達ギャップ・証憑確認（公開ページ）→</strong></a>',
        "</p>",
        "</section>",
      ].join(""),
    },
    zh: {
      skip: "跳转至正文",
      navAria: "主导航",
      theme: "主题",
      themeAria: "切换明暗",
      languageAria: "语言",
      visitToday: "今日",
      visitTotal: "累计",
      nav: {
        home: "首页",
        guide: "安装指南",
        usage: "使用方法",
        trv: "TRV 设置",
        mt5: "MT5 设置",
        downloads: "下载",
        register: "注册",
        login: "登录",
        verify: "身份验证",
        billing: "订阅与支付",
        events: "活动",
        membership: "会员",
        reflection: "实战反馈",
        contact: "联系",
        community: "社区",
        devJournal: "指标优化",
        promo: "推广认证",
        legal: "条款与政策",
        headDaily: "总部日报",
        admin: "管理",
        integrations: "集成",
        telegram: "Telegram Chat ID",
        tvr: "指南R",
      },
      indexTitle: "Magic 指标 · 魔线",
      indexLead:
        "用于快速查看方向、区间和应对的简洁指标。应用到图表，选择计划，然后确认 Magic Line 方向。",
      homeVisitorHint: "按 KST 日期与浏览器 ID 统计的网站独立访客数。",
      officialSiteBannerLabel: "官方网站",
      officialSiteBannerHint: "外链或书签时请核对是否为该地址。",
      homeMustReadHtml: [
        '<p class="ml-must-read__badge">必读 · 非常重要</p>',
        '<h2 class="ml-must-read__title" id="must-read-title">使用本指标前请务必阅读</h2>',
        '<p class="ml-must-read__lede">',
        "本指标<strong>不是</strong>只要跟着信号走就能用的工具。若不具备下面的准备，<strong>要实现稳定盈利会非常困难。</strong>请花几分钟读完，在图表前时时回想。",
        "</p>",
        '<aside class="ml-must-read__volume-callout" role="region" aria-labelledby="volume-tick-callout-quote">',
        '<p class="ml-must-read__volume-callout__quote" id="volume-tick-callout-quote">价格可以骗人，成交量骗不了人。</p>',
        '<p class="ml-must-read__volume-callout__body">',
        '观察市场时这一点往往仍然成立——更有意义的轴向是<strong>成交与活跃度沉淀所在的 Tick（跳动点）</strong>。',
        '与其只盯住固定的时间周期图，我们更<strong>强烈建议尽可能使用 Tick 图</strong>。',
        '在以“每根 K 线”去理解时，<strong>特别推荐 1000 Tick</strong>组合。',
        "设置请参考 <a href=\"guide/usage.html\">TradingView 说明</a> 与 <a href=\"guide/usage-mt5.html#tick-chart\">MT5 Tick 图表</a>。",
        "</p>",
        "</aside>",
        '<ul class="ml-must-read__list">',
        "<li><strong>不必频繁开仓。</strong>甚至可以<strong>慢一点、少一点</strong>。",
        "更重要的是在<strong>你觉得安全边际最高</strong>——通道、R、盘面都合拍时——<strong>更接近“一记好球”那样出手</strong>，这才与本指标一致。</li>",
        "<li>如果盘面不对，仍要<strong>止损</strong>。那不是失败，而是<strong>承认依据已变、先退出观望</strong>（依据迁移）。</li>",
        "<li><strong>克制贪念。</strong>相比一把吃满利润，更应在<strong>Magic Line（均线/中枢）附近</strong>或<strong>移动止损</strong>规定的位置，",
        "<strong>一点一点落袋为安</strong>——这更接近在依据每次变化时守住账户。</li>",
        "<li><strong>均值回归</strong>不只是某几只股票的特例。",
        "<strong>无论哪个市场、哪个品种</strong>，都要想到“价格跑远后，总会有一股往均值回拉的力量”。本指标也建立在这一前提上。</li>",
        "<li>图表上<strong>买/卖标记</strong>对齐<strong>通道下/上沿（进场参考线）</strong>；止盈/止损则对齐<strong>Magic Line 附近、目标与 trail 价位</strong>。",
        "（与真实成交/回报数字未必 1:1。）</li>",
        "<li><strong>TradingView · MarketFree 等分发脚本</strong>需要<strong>按品种、按时间轴分别添加到每一张图表</strong>，才会在该图内按逻辑出信号。",
        "JSON 等里的 <code>license_pack</code> 一类字段只是<strong>区分构建的标识</strong>，",
        "<strong>不要</strong>把它理解成 TradingView 账户是否付费或“被拦截”。（账户收费以 TV 官方为准。）</li>",
        "<li><strong>提醒与 Webhook 由用户自行配置。</strong>将策略/指标挂到图表后，在右侧<strong>设置(齿轮) → 属性 → Inputs → 「Use alert() Messages」</strong>关闭，",
        "即可阻止 <code>alert()</code>，也就不会发到外部服务器或 Telegram。",
        "若开启，请在 TradingView 顶部<strong>闹钟</strong>里创建提醒规则（含 Webhook URL 等），并参考 ",
        '<a href="guide/magictrading-strategy-inputs-ko.html#signals">MagicTrading Signals 说明</a>。',
        "是否使用与渠道由您自行决定。</li>",
        "<li><strong>TradingView「策略」页的模拟仓位/成交</strong>与<strong>真实券商或外部自动交易机器人的持仓</strong>是两套系统。",
        "图表可能只显示仿真结果，实盘取决于桥接、机器人与路由设置。</li>",
        "</ul>",
        '<p class="ml-must-read__warn">',
        "在<strong>不理解</strong>原理的情况下只改参数，或<strong>只顾追信号</strong>，很容易放大亏损。",
        "请务必同时阅读 ",
        '<a href="guide/magictrading-strategy-inputs-ko.html">MagicTrading 参数与微调</a> 与 ',
        '<a href="guide/usage.html">指标使用方法</a>。',
        "</p>",
        '<p class="ml-must-read__foot small">教育/参考用途，不承诺收益。杠杆产品可能造成较大亏损。</p>',
      ].join(""),
      homeQuickStartHtml: [
        '<p class="ml-quick-start__badge">MagicLine 入门 · 3 秒导读</p>',
        '<h2 id="ml-quick-start-title">简单记住这三步</h2>',
        '<div class="ml-quick-start__grid" role="list">',
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">1</span>',
        "<h3>装到你的图表</h3>",
        "<p>",
        "<strong>TradingView</strong>请按蜡烛图/Tick 等环境挂载 MagicLine；",
        '<strong>MT5</strong>提供的 <code>.ex5</code> <strong>仅用于 Tick 图</strong>销售与分发（不提供仅限 M1/M5 等蜡烛周期的专用构建）。',
        "</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">2</span>',
        "<h3>选择适合你的方案</h3>",
        "<p>按日内、波段等交易风格挑选方案并完成开通。</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">3</span>',
        "<h3>阅读信号并对照执行</h3>",
        "<p>先放下复杂解读，看清 Magic Line 的方向与区间。</p>",
        "</article>",
        "</div>",
        '<div class="ml-quick-start__why">',
        "<strong>为什么越简单越好？</strong>",
        "<span>少犹豫才能快执行。对核心越有把握，说明就越简短。</span>",
        "</div>",
        '<p class="ml-quick-start__actions">',
        '<a class="btn" href="registration/index.html">开始申请指标</a>',
        '<a class="btn btn--ghost" href="registration/sms-addon.html">短信信号月套餐</a>',
        '<a class="btn btn--ghost" href="guide/usage.html">查看使用方法</a>',
        '<a class="btn btn--ghost" href="guide/magictrading-strategy-inputs-ko.html">MagicTrading 参数说明</a>',
        "</p>",
      ].join(""),
      homeI18nFoldHtml: [
        '<section class="ml-quick-start" id="trv-1week-whop-flow" aria-labelledby="trv-1week-whop-title" style="margin-top: 2rem">',
        '<p class="ml-quick-start__badge">Whop 等外链 · TRV 一周体验</p>',
        '<h2 id="trv-1week-whop-title">一周（7 天）TradingView 体验 — 流程</h2>',
        '<p class="small" style="margin: -0.25rem 0 1rem; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "若您通过 Whop 广告或商品链接进入，请按下列顺序操作。资费与条款见 ",
        '<a href="events/index.html">活动·资费</a> 与 ',
        '<a href="legal/terms-magictrading-free-trial.html">7 日免费体验特别约定</a>。',
        "<strong>提交并完成 7 日体验须已登录为准会员或以上。</strong>",
        "</p>",
        '<ol class="notice-list" style="max-width: min(70rem, 100%); line-height: 1.72; padding-left: 1.35rem">',
        '<li style="margin-bottom: 0.5rem">点击 <strong>Whop</strong> 等渠道的链接进入 ',
        '<strong>官方网站 <a href="https://magicindicatorglobal.com/">https://magicindicatorglobal.com/</a></strong>。</li>',
        '<li style="margin-bottom: 0.5rem"><strong>准会员注册</strong>（无需短信，最少资料）— ',
        '<a href="registration/associate.html">准会员注册（一周免费资格）</a></li>',
        '<li style="margin-bottom: 0.5rem">登录后到 ',
        '<a href="billing/index.html?signup=1&amp;plan=event_1w_free">订阅·支付 → 7 日免费体验</a> 申请。',
        "填写<strong>TradingView（TRV）用户名</strong>或<strong>MT5 账号+服务器</strong>并完成条款与签名。",
        "</li>",
        '<li style="margin-bottom: 0.5rem">提交后<strong>记入系统台账与会员资料</strong>。管理员可在 ',
        '<a href="admin/monitor.html">套餐监控（管理）</a> 查看受理记录。</li>',
        '<li style="margin-bottom: 0.5rem"><strong>管理员</strong>根据申请进行 TradingView <strong>邀请与脚本配置</strong>等后续操作。</li>',
        '<li style="margin-bottom: 0.5rem">处理完成后向<strong>注册邮箱</strong>发送通知。若未收到请先查垃圾邮件，再通过 ',
        '<a href="contact/index.html">联系</a> 与我们沟通。</li>',
        "</ol>",
        '<p class="small" style="margin: 1rem 0 0; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "在套餐监控首页的<strong>近 7 日台账</strong>表中，可点击 TRV 用户名·MT5 标识·邮箱旁的<strong>复制</strong>按钮复制到剪贴板（需管理员登录）。",
        "</p>",
        "</section>",
        '<section class="ml-cloud-care" aria-labelledby="ml-cloud-care-title">',
        '<p class="ml-cloud-care__badge">附加选项 · 技术环境管理</p>',
        "<h2 id=\"ml-cloud-care-title\">MagicLine 24/7 云托管</h2>",
        '<p class="ml-cloud-care__lead">',
        "若您难以长期开启图表或希望减轻配置负担，可选择本附加服务。我们为 MagicLine 使用环境提供<strong>配置存档·运行巡检·告警连接</strong>等技术支持。",
        "<strong>定价（月 · USD）</strong>：Whop 通道 <strong>$2,999</strong> · MQL 通道 <strong>$3,499</strong>（MT5 · MagicLine 24/7 云托管）。与主许可证分开计费。",
        "</p>",
        '<div class="ml-cloud-care__grid" role="list">',
        '<article class="ml-cloud-care__card" role="listitem"><h3>配置备份与管理</h3>',
        "<p>保存您的 MagicLine 套餐与图表设置，必要时协助恢复。</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>环境稳定性检查</h3>',
        "<p>定期检查 MT5 与云端运行环境状态。</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>告警连接协助</h3>',
        "<p>确保已配置的 MagicLine 告警正常送达指定通道。</p></article>",
        "</div>",
        '<p class="ml-cloud-care__notice">仅为技术环境的辅助选项，投资决策仍由用户自行承担。</p>',
        "</section>",
        '<section class="home-payment-draft" id="payment-draft" aria-labelledby="payment-draft-h2">',
        '<p class="home-payment-draft__badge" role="presentation">运营说明 · 支付渠道</p>',
        '<h2 id="payment-draft-h2" class="home-payment-draft__title">支付四条路径</h2>',
        '<p class="home-payment-draft__lead">',
        "具体可用方式、流程与手续费以 ",
        '<a href="billing/index.html#payment-dual">订阅·支付</a> ',
        "及相关条款为准；以下为首页公布的<strong>运营原则</strong>。",
        "</p>",
        '<div class="home-payment-draft__grid" role="list">',
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">PayPal</h3>',
        '<p class="home-payment-draft__card-body">小额、活动或入会阶段优先引导<strong>卡支付（经 PayPal）</strong>。余额/先买后付等是否可用及费用以 PayPal 与结账页为准。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">美元电汇</h3>',
        '<p class="home-payment-draft__card-body"><strong>高额、正式套餐或海外客户</strong>可向<strong>全球收款账户</strong>直接汇款（在支付页选择币种与地区）。银行名、账号、SWIFT/IBAN 详见 ',
        '<a href="billing/index.html#wire-route-picker">支付页汇款指引</a> 与发票。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">链上加密</h3>',
        '<p class="home-payment-draft__card-body"><strong>USDT · USDC</strong>：仅在结算页选择<strong>Ledger 支持的网络</strong>（USDT：TRON、Solana、Polygon / USDC：同上另加 Arbitrum One）。',
        " <strong>TRON (TRC-20)</strong> 收款示例:",
        '<code style="font-size: 0.88em; word-break: break-all">TUBXMuAEGTN3WtM7NHVebe2MAYbuQTDjbw</code>',
        ' · 其他链请看 <a href="billing/index.html#crypto-deposit">订阅·支付 → 加密货币入金</a>。',
        " BTC·ETH 等主链按汇价折算且无需自选网络；其他币种原则上先报价再汇款。",
        " 对账采用<strong>订单级精确小数+尾标</strong>（",
        '<a href="billing/index.html#crypto-amount-signature">精确金额</a>、',
        '<a href="billing/index.html#crypto-price-basis">折算说明</a>）。',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">韩元法人转账</h3>',
        '<p class="home-payment-draft__card-body">境内韩元付款使用 <strong>友利银行 · 株式会社 Haengbokdodam Invest · 61001073818213</strong> 法人账户，按发票执行。美元发票换算韩元以支付页规则为准。',
        "</p></article>",
        "</div>",
        '<p class="home-payment-draft__foot"><a href="billing/index.html#payment-dual">各渠道详情请至订阅·支付页面 →</a></p>',
        '<p class="small" style="margin: 0.65rem 0 0; color: var(--ci-brown-muted); line-height: 1.62">',
        "跨境<strong>国际电汇</strong>可能需要数日。若在<strong>入账确认前</strong>提供清晰的银行凭证(MT103/受理回执等)，可先行酌情批准指标使用——详见 ",
        '<a href="billing/index.html#swift-gap-remedy"><strong>汇款空档·凭证预审（公开说明）→</strong></a>',
        "</p>",
        "</section>",
      ].join(""),
    },
    es: {
      skip: "Ir al contenido",
      navAria: "Menú principal",
      theme: "Tema",
      themeAria: "Cambiar claro/oscuro",
      languageAria: "Idioma",
      visitToday: "Hoy",
      visitTotal: "Total",
      nav: {
        home: "Inicio",
        guide: "Instalación",
        usage: "Uso",
        trv: "Config. TRV",
        mt5: "Config. MT5",
        downloads: "Descargas",
        register: "Registro",
        login: "Entrar",
        verify: "Verificación",
        billing: "Facturación",
        events: "Eventos",
        membership: "Membresía",
        reflection: "Reseñas",
        contact: "Contacto",
        community: "Comunidad",
        devJournal: "Ajuste del indicador",
        promo: "Prueba de promo",
        legal: "Legal",
        headDaily: "Informe HQ",
        admin: "Admin",
        integrations: "Integraciones",
        telegram: "Telegram Chat ID",
        tvr: "Guía R",
      },
      indexTitle: "Indicadores Magic · Magic Line",
      indexLead:
        "Un indicador simple para leer dirección, zonas y respuesta con más rapidez. Aplícalo al gráfico, elige tu plan y revisa la dirección de Magic Line.",
      homeVisitorHint:
        "Visitantes únicos del sitio (por fecha KST y un identificador de navegador).",
      officialSiteBannerLabel: "Sitio oficial",
      officialSiteBannerHint: "Para enlaces externos o marcadores, confirma esta URL.",
      homeMustReadHtml: [
        '<p class="ml-must-read__badge">Lectura obligatoria · Muy importante</p>',
        '<h2 class="ml-must-read__title" id="must-read-title">Lee esto antes de usar el indicador</h2>',
        '<p class="ml-must-read__lede">',
        "Este indicador <strong>no es</strong> una herramienta en la que solo debas seguir señales. Sin lo siguiente, es <strong>muy difícil obtener beneficios coherentes.</strong> Léelo en pocos minutos y recuérdalo frente al gráfico.",
        "</p>",
        '<aside class="ml-must-read__volume-callout" role="region" aria-labelledby="volume-tick-callout-quote">',
        '<p class="ml-must-read__volume-callout__quote" id="volume-tick-callout-quote">El precio puede engañar; el volumen, casi nunca.</p>',
        '<p class="ml-must-read__volume-callout__body">',
        "Eso también se aplica al leer mercados: el eje importante es donde <strong>los trades y la actividad se acumulan en ticks.</strong> ",
        "En lugar de fijarte solo en velas por tiempo, <strong>recomendamos encarecidamente usar gráficos de ticks cuando sea posible.</strong> ",
        "Para interpretar cada vela, <strong>combinaciones de 1000 ticks están especialmente recomendadas.</strong> ",
        'Consulta <a href="guide/usage.html">la guía de TradingView</a> y ',
        '<a href="guide/usage-mt5.html#tick-chart">gráficos tick en MT5</a>.',
        "</p>",
        "</aside>",
        '<ul class="ml-must-read__list">',
        "<li><strong>No hace falta entrar muy a menudo.</strong> Está bien ser <strong>más lento</strong> y operar <strong>menos veces.</strong> ",
        "Encaja mejor con este indicador cuando buscas entrar cuando sientas <strong>máximo margen de seguridad</strong>, con bandas, R y contexto alineados, lo más cercano posible a <strong>«un golpe limpio».</strong></li>",
        "<li>Si el mercado no coincide, igual necesitas <strong>stop-loss.</strong> No es fracaso; es <strong>reconocer que cambió tu premisa y apartarte.</strong></li>",
        "<li><strong>Reduce la codicia.</strong> Acumula <strong>ganancias más pequeñas</strong> cerca de la <strong>Magic Line (media/centro)</strong> o donde un <strong>trailing stop</strong> marca la salida: eso ayuda más a preservar la cuenta cuando el contexto cambia.</li>",
        "<li>La <strong>reversión a la media</strong> no es solo de algunos valores. Para <strong>cualquier mercado y símbolo</strong> recuerda la idea de fuerza que empuja hacia la media tras un movimiento. Este indicador se apoya en esa premisa.</li>",
        "<li>En el gráfico, las <strong>marcas compra/venta</strong> siguen las <strong>bandas inferior/superior (guías de entrada)</strong>; las salidas y stops a <strong>Magic Line cercana, objetivos y trail.</strong> (Puede no coincidir 1:1 con ejecución real).</li>",
        "<li><strong>Scripts distribuidos (TradingView, MarketFree…)</strong> deben <strong>añadirse por gráfico, símbolo y temporalidad.</strong> Campos como <code>license_pack</code> en JSON son sólo <strong>etiquetas de build</strong>, <strong>no</strong> indican si tu cuenta TV está pagada o «bloqueada».</li>",
        "<li><strong>Alertas y webhooks dependen del usuario.</strong> Tras cargar estrategia/indicador, desactiva <strong>Ajustes (engranaje) → Propiedades → Inputs → 「Use alert() Messages」</strong> para impedir <code>alert()</code> y así nada llega a servidores externos o Telegram. ",
        "Si está activado, crea reglas en <strong>Alertas</strong> y revisa ",
        '<a href="guide/magictrading-strategy-inputs-ko.html#signals">MagicTrading Signals</a>.</li>',
        "<li>Las <strong>posiciones simuladas en la pestaña Estrategia</strong> de TradingView están <strong>separadas</strong> del <strong>saldo real o bots externos.</strong> El gráfico puede mostrar sólo simulación.</li>",
        "</ul>",
        '<p class="ml-must-read__warn">',
        "Afinar opciones sin <strong>entender</strong> o perseguir sólo las <strong>señales</strong> aumenta pérdidas. Lee ",
        '<a href="guide/magictrading-strategy-inputs-ko.html">entradas y ajuste MagicTrading</a> y ',
        '<a href="guide/usage.html">uso del indicador</a> <strong>juntos.</strong>',
        "</p>",
        '<p class="ml-must-read__foot small">Sólo información educativa; no se garantizan ganancias. Los productos apalancados pueden generar pérdidas grandes.</p>',
      ].join(""),
      homeQuickStartHtml: [
        '<p class="ml-quick-start__badge">Inicio rápido MagicLine · Guía breve</p>',
        '<h2 id="ml-quick-start-title">Tres pasos, mantén lo simple</h2>',
        '<div class="ml-quick-start__grid" role="list">',
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">1</span>',
        "<h3>Colócalo en tu gráfico</h3>",
        "<p>",
        "<strong>TradingView:</strong> aplica MagicLine según tus velas o ticks; los <code>.ex5</code> en <strong>MT5 son sólo para gráficos de ticks</strong> (no hay build exclusivo para M1/M5).",
        "</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">2</span>',
        "<h3>Elige un plan adecuado</h3>",
        "<p>Selecciona un plan para tu estilo y completa el registro.</p>",
        "</article>",
        '<article class="ml-quick-start__card" role="listitem">',
        '<span class="ml-quick-start__num">3</span>',
        "<h3>Mira la señal y reacciona</h3>",
        "<p>Antes de analizar todo en detalle, confirma la dirección de Magic Line y las zonas.</p>",
        "</article>",
        "</div>",
        '<div class="ml-quick-start__why">',
        "<strong>¿Por qué lo simple?</strong>",
        "<span>Menos dudas, ejecución más rápida. Cuanto más claridad tengas en el núcleo, menor explicación hace falta.</span>",
        "</div>",
        '<p class="ml-quick-start__actions">',
        '<a class="btn" href="registration/index.html">Solicitar el indicador</a>',
        '<a class="btn btn--ghost" href="registration/sms-addon.html">Paquete SMS mensual</a>',
        '<a class="btn btn--ghost" href="guide/usage.html">Ver uso</a>',
        '<a class="btn btn--ghost" href="guide/magictrading-strategy-inputs-ko.html">Entradas MagicTrading</a>',
        "</p>",
      ].join(""),
      homeI18nFoldHtml: [
        '<section class="ml-quick-start" id="trv-1week-whop-flow" aria-labelledby="trv-1week-whop-title" style="margin-top: 2rem">',
        '<p class="ml-quick-start__badge">Whop y tráfico externo · prueba TRV 1 semana</p>',
        '<h2 id="trv-1week-whop-title">TradingView · prueba de 7 días — pasos</h2>',
        '<p class="small" style="margin: -0.25rem 0 1rem; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "Si llegaste desde Whop u otros enlaces, sigue estos pasos. Tarifas y legales: ",
        '<a href="events/index.html">Eventos y tarifas</a> · ',
        '<a href="legal/terms-magictrading-free-trial.html">Condiciones trial 7 días</a>. ',
        "<strong>Completa envío sólo iniciado sesión (miembro asociado o superior).</strong>",
        "</p>",
        '<ol class="notice-list" style="max-width: min(70rem, 100%); line-height: 1.72; padding-left: 1.35rem">',
        '<li style="margin-bottom: 0.5rem">Pulsa el enlace de <strong>Whop</strong> para entrar a ',
        '<strong>la web oficial <a href="https://magicindicatorglobal.com/">https://magicindicatorglobal.com/</a></strong>.</li>',
        '<li style="margin-bottom: 0.5rem"><strong>Registro asociado</strong> (sin SMS, datos mínimos) — ',
        '<a href="registration/associate.html">Alta asociada (trial 1 semana)</a></li>',
        '<li style="margin-bottom: 0.5rem">Tras iniciar sesión usa ',
        '<a href="billing/index.html?signup=1&amp;plan=event_1w_free">Facturación → trial gratis 7 días</a>. ',
        'Indica <strong>nombre usuario TradingView</strong> o <strong>número de cuenta MT5 + servidor</strong> y firma los términos.',
        "</li>",
        '<li style="margin-bottom: 0.5rem">El envío <strong>deja huella</strong> en el libro y perfil.',
        ' Los administradores siguen desde <a href="admin/monitor.html">monitor de planes</a>.</li>',
        '<li style="margin-bottom: 0.5rem">El equipo ejecuta <strong>invitaciones TradingView · provisiones Pine</strong> tras revisar cada caso.</li>',
        '<li style="margin-bottom: 0.5rem">Cuando hay novedades, escribimos al correo registrado. Si no llega mail, revisa spam y ',
        '<a href="contact/index.html">contacto</a>.</li>',
        "</ol>",
        '<p class="small" style="margin: 1rem 0 0; max-width: min(70rem, 100%); line-height: 1.62; color: var(--ci-brown-muted)">',
        "Los administradores copian rápidamente ID TRV · MT5 · email desde botones situados junto cada fila de los últimos 7 días.",
        "</p>",
        "</section>",
        '<section class="ml-cloud-care" aria-labelledby="ml-cloud-care-title">',
        '<p class="ml-cloud-care__badge">Opción técnica · gestión ambiental</p>',
        "<h2 id=\"ml-cloud-care-title\">MagicLine 24/7 cloud care</h2>",
        '<p class="ml-cloud-care__lead">',
        "Apoyo opcional cuando no puedas dejar grafos cargados todo el día o la gestión pesa.",
        ' Ayudamos con <strong>copias de ajustes, revisiones operativas y alertas enlazadas</strong>. ',
        '<strong>Cuota fija mensual USD</strong>: vía Whop <strong>$2,999</strong> · vía MQL <strong>$3,499</strong> ',
        '(MT5 · MagicLine cloud care independiente del core). ',
        "</p>",
        '<div class="ml-cloud-care__grid" role="list">',
        '<article class="ml-cloud-care__card" role="listitem"><h3>Copias &amp; ajustes</h3>',
        "<p>Custodia de tus configuraciones MagicLine MT5/TRV por si necesitas recuperarlas.</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>Salud ambiental</h3>',
        "<p>Vigilamos que las instancias MT5/cloud no se suspendan sin causa.</p></article>",
        '<article class="ml-cloud-care__card" role="listitem"><h3>Rutas de alerta</h3>',
        "<p>Gestionamos webhook/bot/channel para tus alertas de MagicLine cuando lo contratas.</p></article>",
        "</div>",
        '<p class="ml-cloud-care__notice">Orientación técnica solamente; tus decisiones de trading son exclusivamente tuyas.</p>',
        "</section>",
        '<section class="home-payment-draft" id="payment-draft" aria-labelledby="payment-draft-h2">',
        '<p class="home-payment-draft__badge" role="presentation">Pagos cuádruple vía</p>',
        '<h2 id="payment-draft-h2" class="home-payment-draft__title">Cuatro vías disponibles</h2>',
        '<p class="home-payment-draft__lead">Los medios efectivos están publicados en ',
        '<a href="billing/index.html#payment-dual">Facturación</a>; esto sólo sintetiza <strong>cómo operamos públicamente.</strong>',
        "</p>",
        '<div class="home-payment-draft__grid" role="list">',
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">PayPal</h3>',
        '<p class="home-payment-draft__card-body"><strong>Cobro inicial</strong> por tarjeta a través PayPal donde aplique.',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">Transferencia USD</h3>',
        '<p class="home-payment-draft__card-body"><strong>Importes grandes o suscripciones continuas:</strong>',
        '<a href="billing/index.html#wire-route-picker">beneficiarios publicados por moneda/región.</a>',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">Cripto on-chain</h3>',
        '<p class="home-payment-draft__card-body"><strong>USDT / USDC</strong> usando únicamente redes compatibles con Ledger según la tienda.',
        " (<strong>TRON ejemplo</strong>: ",
        '<code style="font-size: 0.88em; word-break: break-all">TUBXMuAEGTN3WtM7NHVebe2MAYbuQTDjbw</code>.)',
        ' Ver tabla en <a href="billing/index.html#crypto-deposit">Facturación → Cripto</a>; seguimos el esquema de <a href="billing/index.html#crypto-amount-signature">marcas sutiles por orden.</a>',
        "</p></article>",
        '<article class="home-payment-draft__card" role="listitem"><h3 class="home-payment-draft__card-title">KRW vía empresa</h3>',
        '<p class="home-payment-draft__card-body"><strong>Woori Bank · Haengbokdodam Invest Co., Ltd · 61001073818213</strong> sólo después de revisar orden y facturas emitidas desde Corea.',
        "</p></article>",
        "</div>",
        '<p class="home-payment-draft__foot"><a href="billing/index.html#payment-dual">Detalle oficial → Facturación</a></p>',
        '<p class="small" style="margin: 0.65rem 0 0; color: var(--ci-brown-muted); line-height: 1.62">Las transferencias Swift pueden tardar días hábiles. Si muestras comprobantes alineados con tus envíos antes de liquidar oficialmente ciertos cargos recurrentes puede habilitarse <strong>uso provisional tras revisión financiera,</strong>',
        '<a href="billing/index.html#swift-gap-remedy"><strong> ver guía abierta Swift → </strong></a>',
        "</p>",
        "</section>",
      ].join(""),
    },
  };

  /** 손번역이 없는 UI 코드는 en 블록을 깊게 복제해 메뉴·공통 카피를 제공 (페이지별 본문은 자동 번역). */
  (function augmentLocalesFromEnglish() {
    var basis = I18N.en;
    for (var u = 0; u < UX_SUPPORTED_LANG_LIST.length; u++) {
      var lc = UX_SUPPORTED_LANG_LIST[u].code;
      if (I18N[lc]) continue;
      I18N[lc] = {};
      for (var ky in basis) {
        if (!Object.prototype.hasOwnProperty.call(basis, ky)) continue;
        var v = basis[ky];
        if (v && typeof v === "object") {
          I18N[lc][ky] = JSON.parse(JSON.stringify(v));
        } else {
          I18N[lc][ky] = v;
        }
      }
    }
  })();

  /** `home-magicline-i18n.js` 가 노출하는 정적 매니페스트 HTML 을 각 로케일·영어폴백 로케일에 반영 */
  (function mergeHomeMagiclineMessageHtmlBundles() {
    try {
      var ext = typeof window !== "undefined" ? window.__MAGIC_HOME_MAGICLINE_HTML : null;
      if (!ext || typeof ext !== "object") return;
      var langs = ["en", "ja", "zh", "es"];
      var li = 0;
      for (; li < langs.length; li++) {
        var code = langs[li];
        if (!I18N[code]) continue;
        var html = ext[code] || ext.en;
        if (typeof html === "string" && html) I18N[code].homeMagiclineMessageHtml = html;
      }
      var enHtml = I18N.en && I18N.en.homeMagiclineMessageHtml;
      if (typeof enHtml !== "string" || !enHtml) return;
      for (var u = 0; u < UX_SUPPORTED_LANG_LIST.length; u++) {
        var lc = UX_SUPPORTED_LANG_LIST[u].code;
        if (lc === "ko") continue;
        if (!I18N[lc]) continue;
        if (!I18N[lc].homeMagiclineMessageHtml) I18N[lc].homeMagiclineMessageHtml = enHtml;
      }
    } catch (_eMer) {}
  })();

  /** `home-extra-i18n.js` 가 노출하는 data-magic-home-chunk 번들 및 임베드 보드 제목 테이블 */
  (function mergeHomeExtraHtmlBundles() {
    try {
      var ext = typeof window !== "undefined" ? window.__MAGIC_HOME_EXTRA_BUNDLES : null;
      if (!ext || typeof ext !== "object") return;
      var langs = ["en", "ja", "zh", "es"];
      var li = 0;
      for (; li < langs.length; li++) {
        var code = langs[li];
        if (!I18N[code]) continue;
        var row = ext[code] || ext.en;
        if (!row || typeof row !== "object") continue;
        if (row.chunks && typeof row.chunks === "object") {
          I18N[code].homeExtraChunks = {};
          for (var ck in row.chunks) {
            if (!Object.prototype.hasOwnProperty.call(row.chunks, ck)) continue;
            I18N[code].homeExtraChunks[ck] = row.chunks[ck];
          }
        }
        if (row.boardTitles && typeof row.boardTitles === "object") {
          I18N[code].homeEmbeddedBoardTitles = {};
          for (var tb in row.boardTitles) {
            if (!Object.prototype.hasOwnProperty.call(row.boardTitles, tb)) continue;
            I18N[code].homeEmbeddedBoardTitles[tb] = row.boardTitles[tb];
          }
        }
      }
      var enChunks = I18N.en && I18N.en.homeExtraChunks;
      var enSubs = I18N.en && I18N.en.homeEmbeddedBoardTitles;
      if (enChunks && typeof enChunks === "object") {
        for (var uex = 0; uex < UX_SUPPORTED_LANG_LIST.length; uex++) {
          var lcx = UX_SUPPORTED_LANG_LIST[uex].code;
          if (lcx === "ko") continue;
          if (!I18N[lcx]) continue;
          if (!I18N[lcx].homeExtraChunks) I18N[lcx].homeExtraChunks = {};
          for (var ky in enChunks) {
            if (!Object.prototype.hasOwnProperty.call(enChunks, ky)) continue;
            if (!I18N[lcx].homeExtraChunks[ky]) I18N[lcx].homeExtraChunks[ky] = enChunks[ky];
          }
        }
      }
      if (enSubs && typeof enSubs === "object") {
        for (var uey = 0; uey < UX_SUPPORTED_LANG_LIST.length; uey++) {
          var lcy = UX_SUPPORTED_LANG_LIST[uey].code;
          if (lcy === "ko") continue;
          if (!I18N[lcy]) continue;
          if (!I18N[lcy].homeEmbeddedBoardTitles) I18N[lcy].homeEmbeddedBoardTitles = {};
          for (var kt in enSubs) {
            if (!Object.prototype.hasOwnProperty.call(enSubs, kt)) continue;
            if (
              !Object.prototype.hasOwnProperty.call(I18N[lcy].homeEmbeddedBoardTitles, kt) ||
              I18N[lcy].homeEmbeddedBoardTitles[kt] === "" ||
              I18N[lcy].homeEmbeddedBoardTitles[kt] == null
            ) {
              I18N[lcy].homeEmbeddedBoardTitles[kt] = enSubs[kt];
            }
          }
        }
      }
    } catch (_eHex) {}
  })();

  /** ko 는 index.html 원문 유지·명시 로케일은 위에서 정의. 그 외(번역파일 추가 전) 에는 영어 홈 블록으로 채워 CSP 상 MyMemory 차단 시에도 본문이 한국어에 고착되지 않게 함. */
  (function propagateHomeHtmlBundlesFallbackFromEnglish() {
    var enPack = I18N.en;
    if (!enPack) return;
    for (var u = 0; u < UX_SUPPORTED_LANG_LIST.length; u++) {
      var lc = UX_SUPPORTED_LANG_LIST[u].code;
      if (lc === "ko") continue;
      var p = I18N[lc];
      if (!p) continue;
      if (enPack.homeExtraChunks && typeof enPack.homeExtraChunks === "object") {
        if (!p.homeExtraChunks) p.homeExtraChunks = {};
        for (var hx in enPack.homeExtraChunks) {
          if (!Object.prototype.hasOwnProperty.call(enPack.homeExtraChunks, hx)) continue;
          if (
            !Object.prototype.hasOwnProperty.call(p.homeExtraChunks, hx) ||
            p.homeExtraChunks[hx] === "" ||
            p.homeExtraChunks[hx] == null
          ) {
            p.homeExtraChunks[hx] = enPack.homeExtraChunks[hx];
          }
        }
      }
      if (enPack.homeEmbeddedBoardTitles && typeof enPack.homeEmbeddedBoardTitles === "object") {
        if (!p.homeEmbeddedBoardTitles) p.homeEmbeddedBoardTitles = {};
        for (var hb in enPack.homeEmbeddedBoardTitles) {
          if (!Object.prototype.hasOwnProperty.call(enPack.homeEmbeddedBoardTitles, hb)) continue;
          if (
            !Object.prototype.hasOwnProperty.call(p.homeEmbeddedBoardTitles, hb) ||
            p.homeEmbeddedBoardTitles[hb] === "" ||
            p.homeEmbeddedBoardTitles[hb] == null
          ) {
            p.homeEmbeddedBoardTitles[hb] = enPack.homeEmbeddedBoardTitles[hb];
          }
        }
      }
    }
    if (!enPack.homeMustReadHtml || !enPack.homeQuickStartHtml) return;
    for (var v = 0; v < UX_SUPPORTED_LANG_LIST.length; v++) {
      var lx = UX_SUPPORTED_LANG_LIST[v].code;
      if (lx === "ko") continue;
      var pk = I18N[lx];
      if (!pk) continue;
      if (!pk.homeMustReadHtml) pk.homeMustReadHtml = enPack.homeMustReadHtml;
      if (!pk.homeQuickStartHtml) pk.homeQuickStartHtml = enPack.homeQuickStartHtml;
      if (!pk.homeI18nFoldHtml && enPack.homeI18nFoldHtml) pk.homeI18nFoldHtml = enPack.homeI18nFoldHtml;
      if (!pk.homeMagiclineMessageHtml && enPack.homeMagiclineMessageHtml)
        pk.homeMagiclineMessageHtml = enPack.homeMagiclineMessageHtml;
    }
  })();

  var I18N_LANGS = UX_SUPPORTED_LANG_LIST;

  var I18N_HTML_LANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
  (function augmentHtmlLang() {
    for (var h = 0; h < I18N_LANGS.length; h++) {
      var code = I18N_LANGS[h].code;
      if (I18N_HTML_LANG[code]) continue;
      I18N_HTML_LANG[code] = code === "zh-TW" ? "zh-Hant" : code;
    }
  })();

  /**
   * 한국어 UI HTML/게시판 UGC 에 대해 선택 UI 언어로 자동 번역(MyMemory 무료 API + sessionStorage 캐시).
   * HTML 구조는 유지하고 텍스트 노드만 교체합니다.
   */
  (function initMagicAutoTranslate() {
    var STORAGE_PREFIX = "magic-i18n-tr:";
    /** MyMemory `langpair` 오른쪽(타깃 코드) 오버라이드 — 미지정 시 ISO 근사 */
    var MEMORY_TARGET_OVERRIDE = {
      zh: "zh-CN",
      "zh-TW": "zh-TW",
      "pt-BR": "pt",
      no: "nb",
    };

    /** @type {Record<string,string>} */
    var PAIR_MAP = {};
    (function buildPairMap() {
      for (var pi = 0; pi < I18N_LANGS.length; pi++) {
        var lcode = I18N_LANGS[pi].code;
        if (lcode === "ko") continue;
        var mmTgt = MEMORY_TARGET_OVERRIDE[lcode];
        if (!mmTgt && lcode.indexOf("-") > 0) {
          mmTgt = lcode.slice(0, lcode.indexOf("-"));
        }
        if (!mmTgt) mmTgt = lcode;
        PAIR_MAP[lcode] = "ko|" + mmTgt;
      }
    })();

    /** 라벨+input 같은 복합 마크업은 textContent 스냅샷 시 input이 깨지므로 제외 */
    function isComposeLabelUnsafe(el) {
      return !!(el.closest && el.closest(".magic-board__compose") && el.tagName === "LABEL");
    }

    /** textContent 로 스냅샷/strip 해도 되는 블록(단순 문자열 노드 중심) */
    function magicTranslateUsesPlainSnapshot(el) {
      if (!el || !el.classList) return false;
      if (isComposeLabelUnsafe(el)) return false;
      var tag = String(el.tagName || "").toLowerCase();
      if (tag === "textarea") return true;
      if (tag === "button") {
        return (
          el.classList.contains("magic-board__thread-toggle") ||
          el.classList.contains("board-thread-toggle") ||
          el.classList.contains("magic-submit") ||
          el.classList.contains("magic-save-auth") ||
          el.classList.contains("magic-paste-hint")
        );
      }
      var PLAIN = [
        "board-row__sub",
        "board-row__stats",
        "board-row__cat",
        "board-empty",
        "board-thread-deny",
        "board-thread-meta",
        "magic-board__item-title",
        "magic-board__item-stats",
        "magic-board__item-meta",
        "magic-board__hl-card-title",
        "magic-board__hl-card-meta",
        "magic-board__hl-label",
        "magic-board__hint",
        "magic-board__head-title",
        "magic-board__head-views",
        "magic-board__msg",
        "magic-board__admin-only-hint",
        "magic-board__reply-deny",
        "board-hl-card__title",
        "board-hl-card__meta",
      ];
      for (var i = 0; i < PLAIN.length; i++) {
        if (el.classList.contains(PLAIN[i])) return true;
      }
      return false;
    }

    /** @returns {HTMLElement[]} */
    function collectRoots() {
      var out = [];
      var seen = new Set();
      function add(el) {
        if (!el || seen.has(el)) return;
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        seen.add(el);
        out.push(el);
      }

      document.querySelectorAll("[data-magic-auto-translate]").forEach(add);
      add(document.getElementById("cms-home-slot"));
      add(document.getElementById("board-status"));

      document.querySelectorAll(".magic-board__item-body").forEach(add);
      document.querySelectorAll(".magic-board__item-title").forEach(add);
      document.querySelectorAll(".magic-board__item-stats").forEach(add);
      document.querySelectorAll(".magic-board__item-meta").forEach(add);
      document.querySelectorAll(".magic-board__hl-card-title").forEach(add);
      document.querySelectorAll(".magic-board__hl-card-meta").forEach(add);
      document.querySelectorAll(".magic-board__hl-label").forEach(add);
      document.querySelectorAll(".magic-board__hint").forEach(add);
      document.querySelectorAll(".magic-board__head-title").forEach(add);
      document.querySelectorAll(".magic-board__head-views").forEach(add);
      document.querySelectorAll(".magic-board__msg").forEach(add);
      document.querySelectorAll(".magic-board__admin-only-hint").forEach(add);
      document.querySelectorAll(".magic-board__reply-body").forEach(add);
      document.querySelectorAll(".magic-board__reply-deny").forEach(add);
      document.querySelectorAll(".magic-board__thread-toggle").forEach(add);
      document.querySelectorAll(".magic-save-auth").forEach(add);
      document.querySelectorAll(".magic-submit").forEach(add);
      document.querySelectorAll(".magic-paste-hint").forEach(add);

      document.querySelectorAll(".board-thread-body").forEach(add);
      document.querySelectorAll(".board-thread-meta").forEach(add);
      document.querySelectorAll(".board-thread-op-body").forEach(add);
      document.querySelectorAll(".board-row__sub").forEach(add);
      document.querySelectorAll(".board-row__title-text").forEach(add);
      document.querySelectorAll(".board-row__stats").forEach(add);
      document.querySelectorAll(".board-row__cat").forEach(add);
      document.querySelectorAll(".board-thread-toggle").forEach(add);
      document.querySelectorAll(".board-thread-deny").forEach(add);
      document.querySelectorAll(".board-empty").forEach(add);
      document.querySelectorAll(".board-hl-label").forEach(add);
      document.querySelectorAll(".board-hl-card__title").forEach(add);
      document.querySelectorAll(".board-hl-card__meta").forEach(add);

      return out.filter(function (el) {
        if (!el.closest) return true;
        if (el.closest("#cms-home-slot[hidden], .cms-home-slot[hidden]")) return false;
        return true;
      });
    }

    function hasHangul(s) {
      return /[\uAC00-\uD7AF\u3131-\u318E]/.test(String(s || ""));
    }

    function cacheKey(pair, chunk) {
      return STORAGE_PREFIX + pair + "::" + String(chunk.length) + "::" + simpleHash(chunk);
    }

    function simpleHash(str) {
      var h = 5381;
      for (var i = 0; i < str.length; i++) {
        h = (h * 33) ^ str.charCodeAt(i);
      }
      return (h >>> 0).toString(36);
    }

    function snapshotKo(el, isPlain) {
      if (el.__magicKoSnap != null) return;
      if (isPlain) el.__magicKoSnap = String(el.textContent || "");
      else el.__magicKoSnap = String(el.innerHTML || "");
    }

    function restoreFromKo(el, isPlain) {
      var snap = el.__magicKoSnap;
      if (snap == null) return;
      if (isPlain) el.textContent = snap;
      else el.innerHTML = snap;
      el.__magicTrBusy = false;
    }

    function readChunkCache(pair, chunk) {
      try {
        return sessionStorage.getItem(cacheKey(pair, chunk)) || "";
      } catch (e) {
        return "";
      }
    }

    function writeChunkCache(pair, chunk, translated) {
      try {
        sessionStorage.setItem(cacheKey(pair, chunk), translated);
      } catch (e) {}
    }

    /** MyMemory 무료 한도 초과 등 API 경고가 translatedText 로 오면 DOM 에 찍히므로 원문 유지 */
    function isMyMemoryGarbageTranslation(s) {
      var u = String(s || "").toUpperCase();
      if (u.indexOf("MYMEMORY WARNING") !== -1) return true;
      if (u.indexOf("YOU USED ALL AVAILABLE FREE TRANSLATIONS") !== -1) return true;
      if (u.indexOf("VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS") !== -1) return true;
      if (u.indexOf("NEXT AVAILABLE IN") !== -1 && u.indexOf("MYMEMORY") !== -1 && u.indexOf("TRANSLATIONS") !== -1)
        return true;
      return false;
    }

    /** @returns {Promise<string>} */
    function translateChunk(pair, chunk) {
      chunk = String(chunk).trim();
      if (!chunk || !pair) return Promise.resolve(chunk);
      if (!hasHangul(chunk)) return Promise.resolve(chunk);
      var c = readChunkCache(pair, chunk);
      if (c && !isMyMemoryGarbageTranslation(c)) return Promise.resolve(c);
      if (c && isMyMemoryGarbageTranslation(c)) {
        try {
          sessionStorage.removeItem(cacheKey(pair, chunk));
        } catch (eDiscard) {}
      }
      var url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(chunk.slice(0, 480)) +
        "&langpair=" +
        encodeURIComponent(pair);

      return fetch(url, { credentials: "omit", cache: "no-store", mode: "cors" })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var out =
            j &&
            j.responseData &&
            typeof j.responseData.translatedText === "string"
              ? j.responseData.translatedText
              : "";
          if (!out || !String(out).trim()) return chunk;
          if (isMyMemoryGarbageTranslation(out)) return chunk;
          var low = String(out).toLowerCase();
          if (low.indexOf("query too long") !== -1) return chunk;
          if (low.indexOf("invalid language pair") !== -1) return chunk;
          writeChunkCache(pair, chunk, out);
          return out;
        })
        .catch(function () {
          return chunk;
        });
    }

    function throttleWait(ms) {
      return new Promise(function (res) {
        setTimeout(res, ms);
      });
    }

    /** @returns {Promise<void>} */
    function translateTextNodes(el, pair) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      /** @type {Text[]} */
      var nodes = [];
      var cur;
      while ((cur = walker.nextNode())) {
        /** @type {Text} */
        var tn = /** @type {any} */ (cur);
        if (!tn.nodeValue || !String(tn.nodeValue).trim()) continue;
        if (!hasHangul(tn.nodeValue)) continue;
        nodes.push(tn);
      }

      /** @returns {Promise<void>} */
      function drain(i) {
        if (i >= nodes.length) return Promise.resolve();
        var node = nodes[i];
        var original = node.nodeValue;
        return translateChunk(pair, original)
          .then(function (translated) {
            if (translated !== original && translated) node.nodeValue = translated;
            return throttleWait(140);
          })
          .then(function () {
            return drain(i + 1);
          });
      }

      return drain(0);
    }

    /** @returns {Promise<void>} */
    function translateRoot(el, pair) {
      var isPlainCell = magicTranslateUsesPlainSnapshot(el);

      snapshotKo(el, isPlainCell);

      var snap = el.__magicKoSnap;
      if (!snap || !snap.trim()) {
        el.__magicTrBusy = false;
        return Promise.resolve();
      }

      restoreFromKo(el, isPlainCell);
      el.__magicTrBusy = true;
      var p = translateTextNodes(el, pair);
      p.then(function () {
        el.__magicTrBusy = false;
      });
      return p;
    }

    var refreshTimer = null;

    function flushRefresh(lang, rootsHint) {
      refreshTimer = null;
      lang = PAIR_MAP[lang] ? lang : "ko";
      var pair = PAIR_MAP[lang];
      var roots = rootsHint != null && rootsHint.length ? rootsHint : collectRoots();
      /** MyMemory 대신 정적 HTML 번들이 있는 메인 블록은 자동 번역 대상에서 빼서(원인: CSP 등으로 외부 API 실패) 헤더만 바뀌는 현상을 방지 */
      roots = roots.filter(function (el) {
        return !magicHomeBlockUsesStaticBundle(lang, el);
      });
      /** @returns {Promise<void>} */
      var chain = Promise.resolve();
      roots.forEach(function (el, idx) {
        chain = chain.then(function () {
          if (!pair) {
            var isPlainCell = magicTranslateUsesPlainSnapshot(el);
            snapshotKo(el, isPlainCell);
            restoreFromKo(el, isPlainCell);
            return Promise.resolve();
          }
          var isPlainCell = magicTranslateUsesPlainSnapshot(el);

          snapshotKo(el, isPlainCell);
          if (!el.__magicKoSnap || !String(el.__magicKoSnap).trim()) return Promise.resolve();
          return translateRoot(el, pair);
        });

        chain = chain.then(function () {
          return throttleWait(idx % 6 === 0 ? 220 : 0);
        });
      });
    }

    function scheduleTranslateRoots(lang, rootsHint) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        flushRefresh(lang, rootsHint != null ? rootsHint : null);
      }, 80);
    }

    /** @returns {HTMLElement[]} */
    function normalizeNodesHint(hint) {
      if (hint == null) return [];
      if (hint.nodeType === Node.ELEMENT_NODE) return [hint];
      if (hint.length != null) {
        /** @type {HTMLElement[]} */
        var out = [];
        for (var i = 0; i < hint.length; i++) {
          if (hint[i]) out.push(hint[i]);
        }
        return out;
      }
      return [];
    }

    /** embed / boards 가 노드를 붙일 때 선택적으로 호출 */
    function notifyUgcNodes(hint) {
      var lang = "";
      try {
        lang =
          typeof window.localStorage !== "undefined"
            ? localStorage.getItem(LANG_KEY) || "ko"
            : "ko";
      } catch (e) {
        lang = "ko";
      }
      if (!PAIR_MAP[lang]) return;
      var roots = normalizeNodesHint(hint);
      if (!roots.length) scheduleTranslateRoots(lang, null);
      else scheduleTranslateRoots(lang, roots);
    }

    window.MagicContentTranslate = {
      refreshAfterLangSwitch: function (langCode) {
        scheduleTranslateRoots(langCode, null);
      },
      onMount: notifyUgcNodes,
      ping: notifyUgcNodes,
    };
  })();

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
    if (s.indexOf("board=developer_journal") >= 0) return "devJournal";
    if (s.indexOf("board=indicator_optimizing") >= 0) return "devJournal";
    if (s.indexOf("board=event_promo_shoutout") >= 0) return "promo";
    if (s.indexOf("usage-trv") >= 0) return "trv";
    if (s.indexOf("usage-mt5") >= 0) return "mt5";
    if (s.indexOf("guide/usage") >= 0 || s.indexOf("/guide/usage") >= 0) return "usage";
    if (s.indexOf("guide/") >= 0 || s.indexOf("/guide") >= 0) return "guide";
    if (s.indexOf("downloads") >= 0) return "downloads";
    if (/login\.html/i.test(String(u.pathname || ""))) return "login";
    if (s.indexOf("registration") >= 0) return "register";
    if (s.indexOf("verify") >= 0) return "verify";
    if (s.indexOf("billing") >= 0) return "billing";
    if (s.indexOf("events") >= 0) return "events";
    if (s.indexOf("membership") >= 0) return "membership";
    if (s.indexOf("reflection") >= 0) return "reflection";
    if (s.indexOf("contact") >= 0) return "contact";
    if (s.indexOf("boards") >= 0) return "community";
    if (s.indexOf("legal") >= 0) return "legal";
    if (s.indexOf("head-daily-report") >= 0) return "headDaily";
    if (s.indexOf("admin") >= 0) return "admin";
    if (s.indexOf("integrations") >= 0) return "integrations";
    if (s.indexOf("index.html") >= 0) return "home";
    return "home";
  }

  /** index.html 필독·퀵스타트·fold 블록 한국어 원본(최초 DOM 에서 누락 분만 채움). */
  function captureMagicHomeKoSnapshotsOnce() {
    try {
      var g = (window.__MAGIC_HOME_KO_HTML = window.__MAGIC_HOME_KO_HTML || {});
      var mr = document.getElementById("must-read-philosophy");
      var qs = document.getElementById("home-quick-start");
      var fold = document.getElementById("magic-home-i18n-fold");
      var mln = document.getElementById("magicline-message");
      if (mr && !g.mustRead) g.mustRead = mr.innerHTML;
      if (qs && !g.quickStart) g.quickStart = qs.innerHTML;
      if (fold && !g.fold) g.fold = fold.innerHTML;
      if (mln && !g.magiclineMsg) g.magiclineMsg = mln.innerHTML;
      if (!g.homeChunks) g.homeChunks = {};
      var chunkNodes = document.querySelectorAll("[data-magic-home-chunk]");
      for (var ci = 0; ci < chunkNodes.length; ci++) {
        var chunkEl = chunkNodes[ci];
        var chunkKey =
          chunkEl && chunkEl.getAttribute ? chunkEl.getAttribute("data-magic-home-chunk") : "";
        if (!chunkKey || g.homeChunks[chunkKey]) continue;
        g.homeChunks[chunkKey] = chunkEl.innerHTML;
      }
      if (!g.boardTitleKoByCategory) g.boardTitleKoByCategory = {};
      var boardNodes = document.querySelectorAll("[data-magic-board]");
      for (var bi = 0; bi < boardNodes.length; bi++) {
        var bd = boardNodes[bi];
        var cat = bd && bd.getAttribute ? bd.getAttribute("data-category") || "" : "";
        if (!cat || g.boardTitleKoByCategory[cat] != null) continue;
        var rawTitle = bd.getAttribute ? bd.getAttribute("data-title") : "";
        if (rawTitle != null && String(rawTitle) !== "") g.boardTitleKoByCategory[cat] = rawTitle;
      }
    } catch (e) {}
  }

  /**
   * 해당 언어에 메인 블록 정적 HTML 이 있으면 MyMemory 자동번역 대신 사용(배포 사이트 CSP 가 api.mymemory… 를 막는 경우 대비).
   * @param {string} langCode
   * @param {Element} el
   * @returns {boolean}
   */
  function magicHomeBlockUsesStaticBundle(langCode, el) {
    if (!el || langCode === "ko") return false;
    var pack = I18N[langCode];
    if (!pack) return false;
    var chunkHost = el.closest && el.closest("[data-magic-home-chunk]");
    if (chunkHost) {
      var chunkKey =
        chunkHost.getAttribute &&
        chunkHost.getAttribute("data-magic-home-chunk");
      var extra = pack.homeExtraChunks;
      if (
        chunkKey &&
        extra &&
        typeof extra[chunkKey] === "string" &&
        extra[chunkKey].length
      )
        return true;
    }
    if (!el.id) return false;
    if (el.id === "must-read-philosophy" && pack.homeMustReadHtml) return true;
    if (el.id === "home-quick-start" && pack.homeQuickStartHtml) return true;
    if (el.id === "magic-home-i18n-fold" && pack.homeI18nFoldHtml) return true;
    if (el.id === "magicline-message" && pack.homeMagiclineMessageHtml) return true;
    return false;
  }

  /**
   * [data-magic-home-chunk] 정적 번들 적용(MyMemory 회피·CSP 호환).
   * @param {string} lang
   */
  function applyMagicHomeExtraChunks(lang) {
    captureMagicHomeKoSnapshotsOnce();
    var snap = window.__MAGIC_HOME_KO_HTML || {};
    var pack = I18N[lang];
    var extras = document.querySelectorAll("[data-magic-home-chunk]");
    for (var xi = 0; xi < extras.length; xi++) {
      var xn = extras[xi];
      var xkey = xn.getAttribute && xn.getAttribute("data-magic-home-chunk");
      if (!xkey) continue;
      if (lang === "ko") {
        if (snap.homeChunks && snap.homeChunks[xkey]) xn.innerHTML = snap.homeChunks[xkey];
      } else {
        var xh = pack && pack.homeExtraChunks && pack.homeExtraChunks[xkey];
        if (typeof xh === "string" && xh.length) xn.innerHTML = xh;
      }
    }
  }

  /**
   * 홈 내 [data-magic-board] 헤더·data-title 을 선택 언어로 맞춤(언어 재선택 시 머리글 동기화).
   * @param {string} lang
   */
  function applyEmbeddedHomeBoardLocales(lang) {
    captureMagicHomeKoSnapshotsOnce();
    var snap = window.__MAGIC_HOME_KO_HTML || {};
    var pack = I18N[lang];
    var baseline = I18N.en && I18N.en.homeEmbeddedBoardTitles;
    var brd = document.querySelectorAll("[data-magic-board]");
    for (var bi = 0; bi < brd.length; bi++) {
      var bd = brd[bi];
      var cat = bd.getAttribute && bd.getAttribute("data-category");
      var ttl = "";
      if (lang === "ko") {
        if (
          snap.boardTitleKoByCategory &&
          cat &&
          snap.boardTitleKoByCategory[cat] != null &&
          snap.boardTitleKoByCategory[cat] !== ""
        )
          ttl = snap.boardTitleKoByCategory[cat];
      } else {
        ttl =
          (pack && cat && pack.homeEmbeddedBoardTitles && pack.homeEmbeddedBoardTitles[cat]) ||
          (baseline && cat && baseline[cat]) ||
          "";
      }
      if (!ttl) continue;
      bd.setAttribute("data-title", ttl);
      var ht = bd.querySelector && bd.querySelector(".magic-board__head-title");
      if (ht) ht.textContent = ttl;
    }
  }

  /**
   * MagicContentTranslate 가 한글 스냅샷을 쓰도록 __magicKoSnap 을 유지(zh 정적 표시 후 en 등으로 바꿀 때도 원문이 한국어).
   * @param {string} lang
   */
  function applyMagicHomeMainBundles(lang) {
    captureMagicHomeKoSnapshotsOnce();
    var pack = I18N[lang];
    var snap = window.__MAGIC_HOME_KO_HTML || {};
    var mr = document.getElementById("must-read-philosophy");
    var qs = document.getElementById("home-quick-start");
    var foldEl = document.getElementById("magic-home-i18n-fold");
    var mlMsg = document.getElementById("magicline-message");

    if (lang === "ko") {
      if (mr && snap.mustRead) {
        mr.innerHTML = snap.mustRead;
        mr.__magicKoSnap = snap.mustRead;
      }
      if (qs && snap.quickStart) {
        qs.innerHTML = snap.quickStart;
        qs.__magicKoSnap = snap.quickStart;
      }
      if (foldEl && snap.fold) {
        foldEl.innerHTML = snap.fold;
        foldEl.__magicKoSnap = snap.fold;
      }
      if (mlMsg && snap.magiclineMsg) {
        mlMsg.innerHTML = snap.magiclineMsg;
        mlMsg.__magicKoSnap = snap.magiclineMsg;
      }
      applyMagicHomeExtraChunks(lang);
      applyEmbeddedHomeBoardLocales(lang);
      return;
    }
    if (pack && pack.homeMustReadHtml && mr) {
      mr.innerHTML = pack.homeMustReadHtml;
      if (snap.mustRead) mr.__magicKoSnap = snap.mustRead;
    }
    if (pack && pack.homeQuickStartHtml && qs) {
      qs.innerHTML = pack.homeQuickStartHtml;
      if (snap.quickStart) qs.__magicKoSnap = snap.quickStart;
    }
    if (pack && pack.homeI18nFoldHtml && foldEl) {
      foldEl.innerHTML = pack.homeI18nFoldHtml;
      if (snap.fold) foldEl.__magicKoSnap = snap.fold;
    }
    if (pack && pack.homeMagiclineMessageHtml && mlMsg) {
      mlMsg.innerHTML = pack.homeMagiclineMessageHtml;
      if (snap.magiclineMsg) mlMsg.__magicKoSnap = snap.magiclineMsg;
    }
    applyMagicHomeExtraChunks(lang);
    applyEmbeddedHomeBoardLocales(lang);
  }

  function normalizeGuideLangCode(code) {
    var raw = String(code || "ko").toLowerCase().replace(/_/g, "-");
    if (raw === "ko") return "ko";
    var bundles = typeof window !== "undefined" ? window.__MAGIC_GUIDE_DOC_BUNDLES : null;
    if (bundles && typeof bundles === "object") {
      if (bundles[raw]) return raw;
      var base = raw.split("-")[0];
      if (bundles[base]) return base;
    }
    return "en";
  }

  function captureGuideKoSnapshotOnce() {
    try {
      var root = document.getElementById("guide-doc-i18n-root");
      if (!root) return;
      var g = (window.__MAGIC_GUIDE_KO_HTML = window.__MAGIC_GUIDE_KO_HTML || {});
      var page = root.getAttribute("data-magic-guide-page") || "index";
      if (!g[page]) g[page] = root.innerHTML;
    } catch (_eGK) {}
  }

  /** guide/index 등 data-magic-guide-page 정적 블록 (MyMemory·CSP 없이 선택 언어 유지). */
  function applyMagicGuideDocBundles(lang) {
    var root = document.getElementById("guide-doc-i18n-root");
    if (!root) return;
    captureGuideKoSnapshotOnce();
    var page = root.getAttribute("data-magic-guide-page") || "index";
    var snap = window.__MAGIC_GUIDE_KO_HTML || {};
    var bundles =
      typeof window !== "undefined" && window.__MAGIC_GUIDE_DOC_BUNDLES
        ? window.__MAGIC_GUIDE_DOC_BUNDLES
        : null;

    function pickTranslatedHtml(code) {
      if (!bundles || typeof bundles !== "object") return null;
      var gl = normalizeGuideLangCode(code);
      if (!bundles[gl] || typeof bundles[gl] !== "object") return bundles.en ? bundles.en[page] : null;
      var h = bundles[gl][page];
      return typeof h === "string" && h.trim()
        ? h
        : bundles.en && bundles.en[page]
          ? bundles.en[page]
          : null;
    }

    var glResolved = normalizeGuideLangCode(lang);
    if (glResolved === "ko") {
      if (snap && snap[page]) root.innerHTML = snap[page];
      return;
    }
    var html = pickTranslatedHtml(lang);
    if (typeof html === "string" && html.trim()) root.innerHTML = html;
  }

  function applyI18n(lang) {
    if (!I18N[lang]) lang = "ko";
    var t = I18N[lang];
    captureMagicHomeKoSnapshotsOnce();
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

    var qLoginChrome = document.getElementById("ux-chrome-login");
    if (qLoginChrome && t.nav && t.nav.login) qLoginChrome.textContent = t.nav.login;

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

    var uxLogin = document.getElementById("ux-login-link");
    if (uxLogin && t.nav && t.nav.login) {
      uxLogin.textContent = t.nav.login;
    }

    var visitTodayLabel = document.getElementById("ux-visit-today-label");
    if (visitTodayLabel) visitTodayLabel.textContent = t.visitToday || I18N.ko.visitToday;
    var visitTotalLabel = document.getElementById("ux-visit-total-label");
    if (visitTotalLabel) visitTotalLabel.textContent = t.visitTotal || I18N.ko.visitTotal;
    var hVisitTodayL = document.getElementById("home-visit-today-label");
    if (hVisitTodayL) hVisitTodayL.textContent = t.visitToday || I18N.ko.visitToday;
    var hVisitTotalL = document.getElementById("home-visit-total-label");
    if (hVisitTotalL) hVisitTotalL.textContent = t.visitTotal || I18N.ko.visitTotal;

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

    applyMagicHomeMainBundles(lang);
    applyMagicGuideDocBundles(lang);
    try {
      if (typeof window.__magicBoardsOnLangApplied === "function") {
        window.__magicBoardsOnLangApplied(lang);
      }
    } catch (_magicBoardsLang) {}

    if (window.MagicContentTranslate && window.MagicContentTranslate.refreshAfterLangSwitch) {
      window.MagicContentTranslate.refreshAfterLangSwitch(lang);
    }
  }

  function apiBase() {
    var meta = document.querySelector('meta[name="api-base"]');
    return ((meta && meta.content) || window.location.origin || "").replace(/\/$/, "");
  }

  function getVisitorId() {
    var existing = "";
    try {
      existing = localStorage.getItem(VISITOR_ID_KEY) || "";
    } catch (e) {}
    if (/^[a-zA-Z0-9._:-]{16,96}$/.test(existing)) return existing;

    var id = "";
    try {
      if (window.crypto && window.crypto.randomUUID) id = window.crypto.randomUUID();
    } catch (e1) {}
    if (!id) {
      id =
        "v-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 12) +
        Math.random().toString(36).slice(2, 12);
    }
    try {
      localStorage.setItem(VISITOR_ID_KEY, id);
    } catch (e2) {}
    return id;
  }

  function setVisitCounter(today, total) {
    var t = document.getElementById("ux-visit-today");
    var a = document.getElementById("ux-visit-total");
    if (t && Number.isFinite(Number(today))) t.textContent = Number(today).toLocaleString("ko-KR");
    if (a && Number.isFinite(Number(total))) a.textContent = Number(total).toLocaleString("ko-KR");
    var ht = document.getElementById("home-visit-today");
    var ha = document.getElementById("home-visit-total");
    if (ht && Number.isFinite(Number(today))) ht.textContent = Number(today).toLocaleString("ko-KR");
    if (ha && Number.isFinite(Number(total))) ha.textContent = Number(total).toLocaleString("ko-KR");
  }

  function markVisitMuted() {
    var box = document.getElementById("ux-visit-counter");
    var strip = document.getElementById("home-visitor-strip");
    if (box) box.classList.add("is-muted");
    if (strip) strip.classList.add("is-muted");
  }

  function markVisitLoaded() {
    var box = document.getElementById("ux-visit-counter");
    var strip = document.getElementById("home-visitor-strip");
    if (box) box.classList.add("is-loaded");
    if (strip) strip.classList.add("is-loaded");
  }

  /** POST 집계가 404 등으로 막힐 때 GET 스냅샷 필드(site_visitors_*)로만 표시(가능하면 배포 후 POST도 정상화). */
  function syncVisitCounterFromTrustSnapshot(apiBaseResolved) {
    return fetchWithRetry(
      apiBaseResolved + "/api/public/trust-snapshot",
      { method: "GET", credentials: "omit", cache: "no-store" },
      2
    )
      .then(function (r) {
        if (!r.ok) throw new Error("trust snapshot " + r.status);
        return r.json();
      })
      .then(function (j) {
        // ok:false(Mongo 미설정 등)·본문 깨짐이어도 하이픈 대신 0이라도 채워 둠(카운팅 실패 ≠ 숫자 미표시).
        if (!j || j.ok === false) {
          setVisitCounter(0, 0);
          markVisitLoaded();
          return;
        }
        // 구 API는 site_visitors_* 키가 없음(undefined) -> 0
        var t = j.site_visitors_today;
        var u = j.site_visitors_total;
        setVisitCounter(
          t != null && Number.isFinite(Number(t)) ? Number(t) : 0,
          u != null && Number.isFinite(Number(u)) ? Number(u) : 0
        );
        markVisitLoaded();
      })
      .catch(function () {
        setVisitCounter(0, 0);
        markVisitLoaded();
      });
  }

  function syncVisitCounter() {
    var box = document.getElementById("ux-visit-counter");
    var strip = document.getElementById("home-visitor-strip");
    if ((!box && !strip) || !window.fetch) return;
    var base = apiBase();
    if (!base) {
      if (box || strip) {
        setVisitCounter(0, 0);
        markVisitLoaded();
      }
      return;
    }
    fetchWithRetry(
      base + "/api/site-visits",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: getVisitorId(),
          page_path: window.location.pathname || "/",
        }),
        keepalive: true,
      },
      2
    )
      .then(function (r) {
        if (!r.ok) throw new Error("visit counter api " + r.status);
        return r.json();
      })
      .then(function (j) {
        var td = j && j.today_visitors;
        var tt = j && j.total_visitors;
        setVisitCounter(
          td != null && Number.isFinite(Number(td)) ? Number(td) : 0,
          tt != null && Number.isFinite(Number(tt)) ? Number(tt) : 0
        );
        markVisitLoaded();
      })
      .catch(function () {
        syncVisitCounterFromTrustSnapshot(base);
      });
  }

  function readMagicAuthSession() {
    try {
      var o = JSON.parse(localStorage.getItem("magic_auth") || "{}");
      var email = String(o.email || "").trim();
      if (!email || email === "guest@local") {
        var tok = String(localStorage.getItem("magic_member_jwt") || "").trim();
        var parts = tok.split(".");
        if (parts.length >= 2) {
          var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          var pad = b64.length % 4;
          if (pad) b64 += new Array(5 - pad).join("=");
          var p = JSON.parse(
            decodeURIComponent(
              atob(b64)
                .split("")
                .map(function (c) {
                  return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
                })
                .join("")
            )
          );
          if (p && p.sub && (!p.exp || Number(p.exp) > Math.floor(Date.now() / 1000))) {
            return {
              email: String(p.sub).trim(),
              role: String(p.role || "free").toLowerCase(),
              display_name: "",
              picture: "",
            };
          }
        }
        return null;
      }
      return {
        email: email,
        role: String(o.role || "guest").toLowerCase(),
        display_name: String(o.display_name || o.name || "").trim(),
        picture: String(o.picture || o.google_picture || "").trim(),
      };
    } catch (e) {
      return null;
    }
  }

  function authDisplayName(session) {
    if (!session) return "";
    var name = String(session.display_name || "").trim();
    if (name) return name;
    return String(session.email || "").split("@")[0] || "회원";
  }

  function initialsForAuth(session) {
    var n = authDisplayName(session);
    return (n || "M").slice(0, 1).toUpperCase();
  }

  function renderChromeAuthState() {
    var box = document.getElementById("ux-auth-state");
    if (!box) return;
    var session = readMagicAuthSession();
    var loginHref = box.getAttribute("data-login-href") || "/registration/login.html";
    var cur = getUiLang();
    var loginLbl =
      I18N[cur] && I18N[cur].nav && I18N[cur].nav.login
        ? I18N[cur].nav.login
        : I18N.ko.nav.login || "로그인";
    if (!session) {
      box.className = "ux-auth-state";
      box.innerHTML =
        '<a href="' +
        String(loginHref).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
        '" class="ux-chrome-btn ux-chrome-btn--quick" id="ux-chrome-login">' +
        loginLbl +
        "</a>";
      return;
    }
    var name = authDisplayName(session);
    var pic = session.picture
      ? '<img class="ux-auth-state__avatar" src="' +
        String(session.picture).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
        '" alt="" referrerpolicy="no-referrer" />'
      : '<span class="ux-auth-state__avatar ux-auth-state__avatar--text" aria-hidden="true">' +
        initialsForAuth(session) +
        "</span>";
    box.className = "ux-auth-state is-logged-in";
    box.innerHTML =
      '<span class="ux-auth-state__profile" title="' +
      String(session.email).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
      '">' +
      pic +
      '<span class="ux-auth-state__name">' +
      String(name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") +
      "</span></span>" +
      '<button type="button" class="ux-chrome-btn ux-chrome-btn--quick" id="ux-chrome-logout">로그아웃</button>';
    var logout = document.getElementById("ux-chrome-logout");
    if (logout) {
      logout.addEventListener("click", function () {
        if (window.MagicAuth && typeof window.MagicAuth.clear === "function") {
          window.MagicAuth.clear();
        } else {
          try {
            localStorage.removeItem("magic_auth");
            localStorage.removeItem("magic_member_jwt");
          } catch (e) {}
          window.dispatchEvent(new CustomEvent("magic-auth-changed"));
        }
        renderChromeAuthState();
        toast("로그아웃되었습니다.", { duration: 2200 });
      });
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

    var loginHref = "/registration/login.html";
    try {
      var nLinks = nav.querySelectorAll("a[href]");
      for (var nix = 0; nix < nLinks.length; nix++) {
        var hh = nLinks[nix].getAttribute("href") || "";
        if (/login\.html/i.test(hh)) {
          loginHref = hh;
          break;
        }
      }
    } catch (_navLogin) {}

    var loginLbl =
      I18N[cur] && I18N[cur].nav && I18N[cur].nav.login
        ? I18N[cur].nav.login
        : I18N.ko.nav && I18N.ko.nav.login
          ? I18N.ko.nav.login
          : "로그인";

    bar.innerHTML =
      '<div class="ux-chrome-bar__inner">' +
      '<div class="ux-visit-counter" id="ux-visit-counter" aria-live="polite" title="하루 방문자수 / 누적 방문자수">' +
      '<span class="ux-visit-counter__item"><span id="ux-visit-today-label">' +
      ((I18N[cur] && I18N[cur].visitToday) || I18N.ko.visitToday) +
      '</span> <strong id="ux-visit-today">-</strong></span>' +
      '<span class="ux-visit-counter__sep" aria-hidden="true">/</span>' +
      '<span class="ux-visit-counter__item"><span id="ux-visit-total-label">' +
      ((I18N[cur] && I18N[cur].visitTotal) || I18N.ko.visitTotal) +
      '</span> <strong id="ux-visit-total">-</strong></span>' +
      "</div>" +
      '<span class="ux-auth-state" id="ux-auth-state" data-login-href="' +
      String(loginHref).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
      '"><a href="' +
      String(loginHref).replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
      '" class="ux-chrome-btn ux-chrome-btn--quick" id="ux-chrome-login">' +
      loginLbl +
      "</a></span>" +
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
    renderChromeAuthState();
    window.addEventListener("magic-auth-changed", renderChromeAuthState);
    window.addEventListener("storage", function (ev) {
      if (!ev || ev.key === "magic_auth" || ev.key === "magic_member_jwt") renderChromeAuthState();
    });

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
    renderChromeAuthState();
    syncVisitCounter();
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
    /** 초기 번역 블록: 네비가 없어 initChromeBar 가 조기 종료되어도 정적 매니페스트·필독 HTML 이 언어에 맞게 적용되게 함 */
    try {
      if (
        document.getElementById("magicline-message") ||
        document.getElementById("must-read-philosophy") ||
        document.getElementById("home-quick-start") ||
        document.getElementById("magic-home-i18n-fold") ||
        document.querySelector("[data-magic-home-chunk]") ||
        document.querySelector("[data-magic-board]")
      ) {
        captureMagicHomeKoSnapshotsOnce();
        applyMagicHomeMainBundles(getUiLang());
      }
    } catch (_eHomeBundles) {}
    try {
      if (document.getElementById("guide-doc-i18n-root")) {
        captureGuideKoSnapshotOnce();
        applyMagicGuideDocBundles(getUiLang());
      }
    } catch (_eGuideBundles) {}
  });

  /** 결제 편의: 전체 카드번호·CVC는 절대 저장하지 않음(PCI). 마스크·브랜드 등만 localStorage. */
  var CARD_MASK_KEY = "happyinvest-checkout-card-mask-v1";

  function normalizeLast4(s) {
    var d = String(s || "").replace(/\D/g, "");
    if (d.length >= 4) return d.slice(-4);
    return "";
  }

  function extractMaskFromPayPalOrderDetails(details) {
    if (!details || typeof details !== "object") return null;
    var ps = details.payment_source;
    if (!ps || typeof ps !== "object") return null;
    var card = ps.card;
    if (card && typeof card === "object") {
      var last4 = normalizeLast4(
        card.last_digits || card.last_4_digits || (card.attributes && card.attributes.last_digits)
      );
      if (last4.length === 4) {
        var exp = "";
        if (card.expiry) exp = String(card.expiry);
        else if (card.attributes && card.attributes.expiry) exp = String(card.attributes.expiry);
        return {
          last4: last4,
          brand: String(card.brand || card.brand_code || card.type || "").trim(),
          exp: exp,
          name: card.name ? String(card.name).trim() : "",
          kind: "card",
          source: "paypal_order",
        };
      }
    }
    if (ps.paypal && typeof ps.paypal === "object") {
      return {
        kind: "paypal_wallet",
        email: details.payer && details.payer.email_address ? String(details.payer.email_address) : "",
        accountId: ps.paypal.account_id ? String(ps.paypal.account_id) : "",
        source: "paypal_order",
      };
    }
    return null;
  }

  function saveCheckoutCardMask(payload) {
    if (!payload) return;
    try {
      localStorage.setItem(
        CARD_MASK_KEY,
        JSON.stringify(
          Object.assign(
            {
              savedAt: new Date().toISOString(),
            },
            payload
          )
        )
      );
    } catch (e) {}
  }

  function getCheckoutCardMask() {
    try {
      var s = localStorage.getItem(CARD_MASK_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  function clearCheckoutCardMask() {
    try {
      localStorage.removeItem(CARD_MASK_KEY);
    } catch (e) {}
  }

  /** PayPal JS SDK capture 콜백 주문 객체 */
  function saveCheckoutCardMaskFromPayPalDetails(details, consent) {
    if (!consent) return;
    var m = extractMaskFromPayPalOrderDetails(details);
    if (m) saveCheckoutCardMask(m);
  }

  /** 서버 캡처 API JSON 또는 중첩 PayPal 응답(있을 때만) */
  function saveCheckoutCardMaskFromCapturePayload(payload, consent) {
    if (!consent || !payload || typeof payload !== "object") return;
    var last4 = normalizeLast4(payload.card_last4 || payload.card_last_digits || payload.last_digits);
    var brand = String(payload.card_brand || payload.card_brand_name || "").trim();
    var exp = String(payload.card_expiry || payload.card_exp || "").trim();
    if (last4.length !== 4 && payload.payment_source && payload.payment_source.card) {
      var c = payload.payment_source.card;
      last4 = normalizeLast4(c.last_digits || c.last_4_digits);
      if (!brand) brand = String(c.brand || "").trim();
      if (!exp && c.expiry) exp = String(c.expiry);
    }
    if (last4.length === 4) {
      saveCheckoutCardMask({ last4: last4, brand: brand, exp: exp, kind: "card", source: "api_capture" });
    }
  }

  function formatSavedCardHintLine() {
    var m = getCheckoutCardMask();
    if (!m) return "";
    if (m.kind === "paypal_wallet") {
      var em = m.email || "";
      return em ? "저장됨 · PayPal 계정 (" + em + ")(이 브라우저 요약)" : "저장됨 · PayPal 지갑(이 브라우저 요약)";
    }
    if (m.last4) {
      var bits = [];
      if (m.brand) bits.push(m.brand);
      bits.push("•••• " + m.last4);
      if (m.exp) bits.push(m.exp);
      return "저장된 결제 식별: " + bits.join(" · ") + " (CVC·전체 카드번호 미저장)";
    }
    return "";
  }

  window.HappyUX = {
    toast: toast,
    fetchWithRetry: fetchWithRetry,
    getVisitorId: getVisitorId,
    getLang: getUiLang,
    setLang: function (code) {
      applyI18n(code);
    },
    applyI18n: applyI18n,
    getCheckoutCardMask: getCheckoutCardMask,
    clearCheckoutCardMask: clearCheckoutCardMask,
    formatSavedCardHintLine: formatSavedCardHintLine,
    saveCheckoutCardMaskFromPayPalDetails: saveCheckoutCardMaskFromPayPalDetails,
    saveCheckoutCardMaskFromCapturePayload: saveCheckoutCardMaskFromCapturePayload,
  };
})();
