/**
 * 브라우저 표시용 세션.
 * 회원 JWT는 localStorage.magic_member_jwt에 보관하고, API 권한 확인은 서버 JWT 검증으로 정리한다.
 * localStorage.magic_auth = { email, role } 는 정적 화면 표시와 개발 점검용 보조값이다.
 */
(function () {
  var KEY = "magic_auth";
  var LANG_KEY = "happyinvest-lang";
  var SUPPORTED_LANG = { ko: 1, en: 1, ja: 1, zh: 1, es: 1 };
  var _langSyncStarted = false;

  function get() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        email: String(o.email || "").trim() || "guest@local",
        role: String(o.role || "guest").toLowerCase(),
      };
    } catch (e) {
      return { email: "guest@local", role: "guest" };
    }
  }

  function set(email, role, opts) {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        email: email || "guest@local",
        role: role || "guest",
      })
    );
    var preferred = opts && opts.preferred_language != null ? opts.preferred_language : "";
    if (preferred) applyPreferredLanguage(preferred);
  }

  function normalizeLang(code) {
    var c = String(code || "")
      .trim()
      .toLowerCase();
    return SUPPORTED_LANG[c] ? c : "";
  }

  function applyPreferredLanguage(code) {
    var lang = normalizeLang(code);
    if (!lang) return false;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (e) {}
    try {
      if (window.HappyUX && typeof window.HappyUX.applyI18n === "function") {
        window.HappyUX.applyI18n(lang);
      } else {
        document.documentElement.setAttribute("lang", lang === "zh" ? "zh-Hans" : lang);
      }
    } catch (e) {}
    return true;
  }

  function syncPreferredLanguageFromProfile(apiBase) {
    var a = get();
    if (!a.email || a.email === "guest@local") return Promise.resolve(false);
    var base = String(apiBase || "")
      .trim()
      .replace(/\/+$/, "");
    if (!base) {
      var m = document.querySelector('meta[name="api-base"]');
      base = ((m && m.content) || window.location.origin || "").replace(/\/+$/, "");
    }
    if (!base) return Promise.resolve(false);
    return fetch(base + "/api/me/profile", { headers: headers(), cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) return false;
        var u = x.j && x.j.user;
        if (!u) return false;
        return applyPreferredLanguage(u.preferred_language);
      })
      .catch(function () {
        return false;
      });
  }

  function startAutoLanguageSync() {
    if (_langSyncStarted) return;
    _langSyncStarted = true;
    if (get().email === "guest@local") return;
    var run = function () {
      syncPreferredLanguageFromProfile();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
      return;
    }
    run();
  }

  function headers() {
    var a = get();
    return {
      "X-User-Id": a.email,
      "X-User-Role": a.role,
    };
  }

  window.MagicAuth = {
    get: get,
    set: set,
    headers: headers,
    applyPreferredLanguage: applyPreferredLanguage,
    syncPreferredLanguageFromProfile: syncPreferredLanguageFromProfile,
    startAutoLanguageSync: startAutoLanguageSync,
  };

  startAutoLanguageSync();
})();
