/**
 * 브라우저 표시용 세션.
 * 회원 JWT는 localStorage.magic_member_jwt에 보관하고, API 권한 확인은 서버 JWT 검증으로 정리한다.
 * localStorage.magic_auth = { email, role } 는 정적 화면 표시와 개발 점검용 보조값이다.
 */
(function () {
  var KEY = "magic_auth";
  var TOKEN_KEY = "magic_member_jwt";
  var REFRESH_KEY = "magic_member_refresh_jwt";
  var LANG_KEY = "happyinvest-lang";
  var SUPPORTED_LANG = { ko: 1, en: 1, ja: 1, zh: 1, es: 1 };
  var REFRESH_SKEW_SECONDS = 3 * 24 * 60 * 60;
  var _langSyncStarted = false;
  var _sessionSyncStarted = false;
  var _refreshPromise = null;
  var _authFetchInstalled = false;
  var _authFetchNative = null;

  function parseJwtPayload(token) {
    try {
      var parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var pad = b64.length % 4;
      if (pad) b64 += new Array(5 - pad).join("=");
      var json = decodeURIComponent(
        atob(b64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(json);
    } catch (_err) {
      return null;
    }
  }

  function getToken() {
    try {
      return String(localStorage.getItem(TOKEN_KEY) || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function getRefreshToken() {
    try {
      return String(localStorage.getItem(REFRESH_KEY) || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function isTokenUsable(token) {
    var p = parseJwtPayload(token);
    if (!p || !p.sub) return false;
    if (!p.exp) return true;
    return Number(p.exp) > Math.floor(Date.now() / 1000) + 30;
  }

  function tokenNeedsRefresh(token) {
    var p = parseJwtPayload(token);
    if (!p || !p.exp) return false;
    return Number(p.exp) <= Math.floor(Date.now() / 1000) + REFRESH_SKEW_SECONDS;
  }

  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return ((m && m.content) || window.location.origin || "").replace(/\/+$/, "");
  }

  function writeSession(user, token, refreshToken) {
    var email = user && user.email ? String(user.email).trim().toLowerCase() : "";
    var role = user && user.role ? String(user.role).toLowerCase() : "guest";
    if (!email || email === "guest@local") return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          email: email,
          role: role || "guest",
          display_name: user.display_name || user.name || "",
          picture: user.picture || user.google_picture || "",
        })
      );
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    } catch (_e) {}
    window.dispatchEvent(new CustomEvent("magic-auth-changed", { detail: get() }));
  }

  function rehydrateFromToken() {
    var token = getToken();
    if (!isTokenUsable(token)) return false;
    var p = parseJwtPayload(token);
    if (!p || !p.sub) return false;
    try {
      var current = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (String(current.email || "").trim()) return true;
      writeSession({ email: p.sub, role: p.role || "free" }, token, getRefreshToken());
      return true;
    } catch (_e) {
      writeSession({ email: p.sub, role: p.role || "free" }, token, getRefreshToken());
      return true;
    }
  }

  function get() {
    try {
      var storedToken = getToken();
      if (storedToken && !isTokenUsable(storedToken) && !isTokenUsable(getRefreshToken())) {
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_KEY);
        } catch (_eToken) {}
      }
      rehydrateFromToken();
      var o = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        email: String(o.email || "").trim() || "guest@local",
        role: String(o.role || "guest").toLowerCase(),
        display_name: String(o.display_name || o.name || "").trim(),
        picture: String(o.picture || o.google_picture || "").trim(),
      };
    } catch (e) {
      return { email: "guest@local", role: "guest", display_name: "", picture: "" };
    }
  }

  function set(email, role, opts) {
    opts = opts || {};
    writeSession(
      {
        email: email || "guest@local",
        role: role || "guest",
        display_name: opts.display_name || opts.name || "",
        picture: opts.picture || opts.google_picture || "",
      },
      opts.token || opts.access_token || "",
      opts.refresh_token || opts.refreshToken || ""
    );
    var preferred = opts.preferred_language != null ? opts.preferred_language : "";
    if (preferred) applyPreferredLanguage(preferred);
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("magic-auth-changed", { detail: get() }));
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
    return ensureFreshToken(base).then(function () {
      return fetch(base + "/api/me/profile", { headers: headers(), cache: "no-store" });
    })
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

  function saveLoginResponse(data) {
    if (!data || !data.user) return false;
    writeSession(data.user, data.access_token || data.token || "", data.refresh_token || "");
    if (data.user.preferred_language) applyPreferredLanguage(data.user.preferred_language);
    return true;
  }

  function rawFetch(input, init) {
    var f = _authFetchNative || (window.fetch && window.fetch.bind(window));
    if (!f) return Promise.reject(new Error("fetch unavailable"));
    return f(input, init);
  }

  function ensureFreshToken(base, opts) {
    opts = opts || {};
    var token = getToken();
    var refreshToken = getRefreshToken();
    if (!opts.force && token && isTokenUsable(token) && !tokenNeedsRefresh(token)) {
      rehydrateFromToken();
      return Promise.resolve(get());
    }
    if (_refreshPromise) return _refreshPromise;
    var resolvedBase = String(base || apiBase()).replace(/\/+$/, "");
    if (!resolvedBase || (!token && !refreshToken)) return Promise.resolve(get());
    var refreshHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (!refreshToken && token && isTokenUsable(token)) refreshHeaders.Authorization = "Bearer " + token;
    _refreshPromise = rawFetch(resolvedBase + "/api/auth/refresh", {
      method: "POST",
      headers: refreshHeaders,
      body: JSON.stringify({ refresh_token: refreshToken || undefined }),
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          if (opts.force) clear();
          return get();
        }
        saveLoginResponse(x.j);
        return get();
      })
      .catch(function () {
        return get();
      })
      .finally(function () {
        _refreshPromise = null;
      });
    return _refreshPromise;
  }

  function syncSessionProfile(base) {
    var token = getToken();
    if (!isTokenUsable(token)) {
      if (token) clear();
      return Promise.resolve(false);
    }
    var resolvedBase = String(base || apiBase()).replace(/\/+$/, "");
    if (!resolvedBase) return Promise.resolve(false);
    return ensureFreshToken(resolvedBase)
      .then(function () {
        var fresh = getToken();
        if (!isTokenUsable(fresh)) return false;
        return rawFetch(resolvedBase + "/api/auth/session", {
          method: "GET",
          headers: headers(),
          credentials: "omit",
          cache: "no-store",
        });
      })
      .then(function (r) {
        if (!r) return false;
        if (r.status === 401) {
          clear();
          return false;
        }
        return r.json().then(function (j) {
          if (!r.ok || !j || !j.user) return false;
          writeSession(j.user, getToken(), getRefreshToken());
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function sameApiRequest(url) {
    try {
      var parsed = new URL(url, window.location.href);
      var base = new URL(apiBase() || window.location.origin, window.location.href);
      return parsed.pathname.indexOf("/api/") === 0 && parsed.origin === base.origin;
    } catch (_e) {
      return false;
    }
  }

  function installAuthFetch() {
    if (_authFetchInstalled || !window.fetch) return;
    _authFetchInstalled = true;
    _authFetchNative = window.fetch.bind(window);
    function plainHeaders(h) {
      var out = {};
      if (!h) return out;
      if (typeof Headers !== "undefined" && h instanceof Headers) {
        h.forEach(function (v, k) {
          out[k] = v;
        });
        return out;
      }
      return Object.assign(out, h);
    }
    window.fetch = function (input, init) {
      var requestUrl = typeof input === "string" ? input : input && input.url;
      init = init || {};
      if (!sameApiRequest(requestUrl || "")) return _authFetchNative(input, init);
      var skipAuthRefresh = /\/api\/auth\/(refresh|login|google\/register-or-login|register|phone\/request-code|totp\/enroll)\b/.test(
        new URL(requestUrl || "", window.location.href).pathname
      );
      var proceed = function () {
        var mergedHeaders = Object.assign({}, skipAuthRefresh ? {} : headers(), plainHeaders(init.headers));
        var nextInit = Object.assign({}, init, { headers: mergedHeaders, credentials: init.credentials || "omit" });
        return _authFetchNative(input, nextInit).then(function (res) {
          if (res && res.status === 401 && getToken()) {
            clear();
            window.dispatchEvent(new CustomEvent("magic-auth-unauthorized"));
          }
          return res;
        });
      };
      if (skipAuthRefresh) return proceed();
      return ensureFreshToken().then(proceed);
    };
  }

  function startAutoSessionSync() {
    if (_sessionSyncStarted) return;
    _sessionSyncStarted = true;
    rehydrateFromToken();
    var token = getToken();
    if (token && !isTokenUsable(token) && !isTokenUsable(getRefreshToken())) {
      clear();
      return;
    }
    if (token && tokenNeedsRefresh(token)) ensureFreshToken().then(function () { syncSessionProfile(); });
    else if (token) syncSessionProfile();
  }

  function headers() {
    var a = get();
    var h = {
      "X-User-Id": a.email,
      "X-User-Role": a.role,
    };
    var tok = getToken();
    if (tok && isTokenUsable(tok)) h.Authorization = "Bearer " + tok;
    return h;
  }

  window.MagicAuth = {
    get: get,
    set: set,
    saveLoginResponse: saveLoginResponse,
    ensureFreshToken: ensureFreshToken,
    syncSessionProfile: syncSessionProfile,
    getToken: getToken,
    getRefreshToken: getRefreshToken,
    clear: clear,
    headers: headers,
    applyPreferredLanguage: applyPreferredLanguage,
    syncPreferredLanguageFromProfile: syncPreferredLanguageFromProfile,
    startAutoLanguageSync: startAutoLanguageSync,
  };

  installAuthFetch();
  startAutoSessionSync();
  startAutoLanguageSync();
})();
