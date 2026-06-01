/**
 * 관리자 로그인만 담당 (admin-app.js 로드/실행 실패 시에도 동작).
 * 로그인 성공 시 sessionStorage 에 토큰 저장 후 새로고침 → admin-app 의 trySession 이 이어 받음.
 */
(function () {
  window.__MAGIC_ADMIN_LOGIN_INLINE__ = true;
  var metaApi = (document.querySelector('meta[name="api-base"]') || {}).content || "";
  var isLocal =
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  var isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(location.hostname || "");
  var API = isLocal
    ? "http://localhost:3000"
    : isIpHost
    ? location.origin
    : metaApi || location.origin || "https://magicindicatorglobal.com";

  function setErr(msg) {
    var e = document.getElementById("admin-login-err");
    if (!e) return;
    e.textContent = msg || "";
    e.style.display = msg ? "block" : "none";
  }

  function apiLogin(email, password) {
    return fetch(API + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (r) {
        return r.text().then(function (text) {
          var j = {};
          if (!text && !r.ok) {
            j = { error: "Empty body HTTP " + r.status };
          } else if (text) {
            if (
              r.status === 403 &&
              (text.indexOf("could not be satisfied") !== -1 ||
                text.indexOf("Bad request") !== -1 ||
                text.indexOf("HTTP request method") !== -1)
            ) {
              j = {
                error:
                  "[CloudFront] POST(API)가 이 도메인에서 막혀 있습니다. AWS CloudFront에서 경로 /api/* 를 Node API 오리진으로 보내고 허용 메서드에 POST·OPTIONS를 넣거나, api.서브도메인을 API 전용으로 두고 이 페이지의 meta api-base 를 그 주소로 바꿔 주세요.",
              };
            } else
            try {
              j = JSON.parse(text);
            } catch (e) {
              j = {
                error:
                  "Not JSON, HTTP " +
                  r.status +
                  ". CloudFront may block POST; check Network tab response.",
              };
            }
          }
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          status: 0,
          j: { error: (err && err.message) || "네트워크 오류" },
        };
      });
  }

  function onSubmit(ev) {
    ev.preventDefault();
    setErr("");
    var emailEl = document.getElementById("admin-email");
    var passEl = document.getElementById("admin-password");
    var email = emailEl ? emailEl.value : "";
    var password = passEl ? passEl.value : "";
    apiLogin(email, password).then(function (x) {
      if (!x.ok) {
        setErr((x.j && x.j.error) || "로그인 실패 (HTTP " + x.status + ")");
        return;
      }
      if (!x.j || !x.j.token) {
        setErr("응답에 token이 없습니다. Network 탭에서 /api/admin/login 본문을 확인하세요.");
        return;
      }
      try {
        sessionStorage.setItem("magic_admin_token", x.j.token);
      } catch (e) {}
      window.location.reload();
    });
  }

  function init() {
    var f = document.getElementById("admin-login-form");
    if (f) f.addEventListener("submit", onSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
