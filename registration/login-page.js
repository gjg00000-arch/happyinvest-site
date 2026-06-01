(function () {
  var form = document.getElementById("member-login-form");
  var alertEl = document.getElementById("login-alert");
  var submitBtn = document.getElementById("login-submit");
  var apiLabel = document.getElementById("api-base-label");
  var googleStatus = document.getElementById("google-prefill-status");
  var googleButton = document.getElementById("google-signin-button");

  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return ((m && m.content) || window.location.origin || "").replace(/\/+$/, "");
  }

  if (apiLabel) apiLabel.textContent = apiBase();

  function safeNextUrl(raw) {
    var fb = "../integrations/index.html";
    try {
      var q = String(raw || "").trim();
      if (!q) return fb;
      var t = new URL(q, window.location.href);
      if (t.origin !== window.location.origin) return fb;
      var parts = window.location.pathname.split("/").filter(Boolean);
      var depth = parts.length ? parts.length - 1 : 0;
      var prefix = depth ? "../".repeat(depth) : "./";
      var p = t.pathname || "/";
      if (p.charAt(0) === "/") p = p.slice(1);
      return prefix + p + (t.search || "") + (t.hash || "");
    } catch (_e) {
      return fb;
    }
  }

  function showAlert(msg, isError) {
    if (!alertEl) return;
    alertEl.hidden = false;
    alertEl.textContent = msg || "";
    alertEl.className = "reg-alert" + (isError ? " reg-alert--error" : " reg-alert--ok");
  }

  function hideAlert() {
    if (!alertEl) return;
    alertEl.hidden = true;
    alertEl.textContent = "";
  }

  function readGoogleClientId() {
    var m = document.querySelector('meta[name="google-client-id"]');
    return (m && String(m.content || "").trim()) || "";
  }

  function isValidGoogleClientId(clientId) {
    return String(clientId || "").trim() === "987937579183-4mrq96rt0rqofvsb8hmp353s48np9j2a.apps.googleusercontent.com";
  }

  function setGoogleStatus(msg, isError) {
    if (!googleStatus) return;
    googleStatus.textContent = msg || "";
    googleStatus.style.color = isError ? "#b42318" : "";
  }

  async function googleLogin(credential) {
    if (!credential) throw new Error("Google credential이 없습니다.");
    var res = await fetch(apiBase() + "/api/auth/google/register-or-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ credential: credential }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(data.error || "Google 로그인에 실패했습니다.");
    }
    if (window.MagicAuth && data.user) {
      MagicAuth.saveLoginResponse(data);
    }
    showAlert("Google 로그인되었습니다. 잠시 후 이동합니다.", false);
    var qp = new URLSearchParams(location.search || "");
    var dest = safeNextUrl(qp.get("next"));
    setTimeout(function () {
      window.location.href = dest;
    }, 400);
  }

  function initGoogleLogin() {
    if (!googleButton) return;
    var clientId = readGoogleClientId();
    if (!isValidGoogleClientId(clientId)) {
      setGoogleStatus("Google Client ID가 설정되지 않았습니다.", true);
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      setGoogleStatus("Google 스크립트 로딩 중입니다. 잠시 후 새로고침해 주세요.", true);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: function (resp) {
        setGoogleStatus("Google 계정 확인 중...", false);
        googleLogin(resp && resp.credential).catch(function (err) {
          setGoogleStatus(err && err.message ? err.message : "Google 로그인에 실패했습니다.", true);
        });
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(googleButton, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      width: 300,
    });
    setGoogleStatus("Google 버튼으로 로그인할 수 있습니다.", false);
  }

  window.setTimeout(initGoogleLogin, 500);

  if (!form || !submitBtn) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideAlert();

    var email = document.getElementById("login-email");
    var password = document.getElementById("login-password");
    var em = email && email.value ? String(email.value).trim() : "";
    var pw = password ? String(password.value || "") : "";
    if (!em || !pw) {
      showAlert("이메일과 비밀번호를 입력해 주세요.", true);
      return;
    }

    submitBtn.disabled = true;
    try {
      var res = await fetch(apiBase() + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: em, password: pw }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        showAlert(data.error || "로그인에 실패했습니다. (" + res.status + ")", true);
        return;
      }
      if (window.MagicAuth && data.user) {
        MagicAuth.saveLoginResponse(data);
      }
      showAlert("로그인되었습니다. 잠시 후 이동합니다.", false);
      var qp = new URLSearchParams(location.search || "");
      var dest = safeNextUrl(qp.get("next"));
      setTimeout(function () {
        window.location.href = dest;
      }, 400);
    } catch (err) {
      showAlert(
        "네트워크 오류: 주소(" + apiBase() + ")와 브라우저 개발 도구(Network)에서 응답을 확인해 주세요.",
        true
      );
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
