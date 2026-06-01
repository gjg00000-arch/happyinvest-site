(function () {
  var form = document.getElementById("associate-registration-form");
  var alertEl = document.getElementById("associate-reg-alert");
  var submitBtn = document.getElementById("associate-reg-submit");
  var apiLabel = document.getElementById("api-base-label");
  var googlePrefillStatus = document.getElementById("google-prefill-status");
  var googleSigninButton = document.getElementById("google-signin-button");

  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return (m && m.content) || window.location.origin.replace(/\/$/, "");
  }

  if (apiLabel) apiLabel.textContent = apiBase();

  var countryCodeEl = document.getElementById("country_code");

  function guessCountryCode() {
    var langs = [];
    if (navigator.languages && navigator.languages.length) langs = navigator.languages.slice();
    if (navigator.language) langs.push(navigator.language);
    for (var i = 0; i < langs.length; i++) {
      var s = String(langs[i] || "").trim();
      if (!s) continue;
      var m = s.match(/-([A-Za-z]{2})$/);
      if (m && m[1]) return m[1].toUpperCase();
    }
    return "KR";
  }

  if (countryCodeEl) {
    var guessed = guessCountryCode();
    var hasOption = false;
    for (var c = 0; c < countryCodeEl.options.length; c++) {
      if (countryCodeEl.options[c].value === guessed) {
        hasOption = true;
        break;
      }
    }
    countryCodeEl.value = hasOption ? guessed : "KR";
  }

  function showAlert(msg, isError) {
    if (!alertEl) return;
    alertEl.hidden = false;
    alertEl.textContent = msg;
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

  function setGooglePrefillStatus(msg, isError) {
    if (!googlePrefillStatus) return;
    googlePrefillStatus.textContent = msg || "";
    googlePrefillStatus.style.color = isError ? "#b42318" : "";
  }

  function prefillFromGoogleCredential(credential) {
    var payload = parseJwtPayload(credential);
    if (!payload) {
      setGooglePrefillStatus("Google 정보 해석에 실패했습니다. 다시 시도해 주세요.", true);
      return;
    }
    var email = payload.email ? String(payload.email).trim() : "";
    var name = payload.name ? String(payload.name).trim() : "";
    var emailEl = document.getElementById("email");
    var nameEl = document.getElementById("display_name");
    if (emailEl && email && !emailEl.value.trim()) emailEl.value = email;
    if (nameEl && name && !nameEl.value.trim()) nameEl.value = name;
    setGooglePrefillStatus("Google 계정 정보로 기본 입력을 채웠습니다. 약관 동의 후 가입을 완료하세요.", false);
  }

  async function tryGoogleRegisterOrLogin(credential) {
    var smsChoiceEl = document.getElementById("associate_sms_addon_choice");
    var res = await fetch(apiBase() + "/api/auth/google/register-or-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: credential,
        signup_plan_choice: "none",
        sms_addon_choice: smsChoiceEl && smsChoiceEl.value ? String(smsChoiceEl.value).trim() : "none",
      }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(data.error || "Google 가입/로그인에 실패했습니다.");
    }
    if (window.MagicAuth && data.user) {
      MagicAuth.saveLoginResponse(data);
    }
    showAlert("Google 계정으로 준회원 가입/로그인되었습니다. 1주 무료 플랜은 구독·결제 페이지에서 신청할 수 있습니다.", false);
  }

  function initGooglePrefill() {
    var clientId = readGoogleClientId();
    if (!isValidGoogleClientId(clientId)) {
      setGooglePrefillStatus("Google 자동입력을 쓰려면 meta google-client-id 에 Client ID를 넣어 주세요.", true);
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      setGooglePrefillStatus("Google 스크립트 로딩 중입니다. 잠시 후 새로고침해 주세요.", true);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async function (resp) {
        var credential = resp && resp.credential;
        prefillFromGoogleCredential(credential);
        setGooglePrefillStatus("Google 계정 확인 중...", false);
        try {
          await tryGoogleRegisterOrLogin(credential);
          setGooglePrefillStatus("Google 가입/로그인이 완료되었습니다.", false);
        } catch (err) {
          setGooglePrefillStatus(
            (err && err.message ? err.message : "Google 즉시가입에 실패했습니다.") + " 입력값 자동채움으로 계속 진행하세요.",
            true
          );
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    if (googleSigninButton) {
      window.google.accounts.id.renderButton(googleSigninButton, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 300,
      });
    }
    setGooglePrefillStatus("Google 버튼으로 로그인하면 이메일/이름이 자동 입력됩니다.", false);
  }

  if (window.google && window.google.accounts && window.google.accounts.id) {
    initGooglePrefill();
  } else {
    window.setTimeout(initGooglePrefill, 500);
  }

  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideAlert();

    var pw = document.getElementById("password").value;
    var pw2 = document.getElementById("password2").value;
    if (pw !== pw2) {
      showAlert("비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
      return;
    }

    var agreeTerms = document.getElementById("agree_terms").checked;
    var agreePrivacy = document.getElementById("agree_privacy").checked;
    if (!agreeTerms || !agreePrivacy) {
      showAlert("필수 약관에 모두 동의해 주세요.", true);
      return;
    }

    submitBtn.disabled = true;
    try {
      var body = {
        member_tier: "associate",
        email: document.getElementById("email").value.trim(),
        password: pw,
        display_name: document.getElementById("display_name").value.trim(),
        country_code: countryCodeEl ? String(countryCodeEl.value || "").trim().toUpperCase() : "KR",
        agree_terms: true,
        agree_privacy: true,
        signup_plan_choice: "none",
        sms_addon_choice: (function () {
          var el = document.getElementById("associate_sms_addon_choice");
          var v = el && el.value ? String(el.value).trim() : "none";
          return v || "none";
        })(),
      };

      var res = await fetch(apiBase() + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        showAlert(data.error || "가입 처리에 실패했습니다. (" + res.status + ")", true);
        return;
      }
      if (window.MagicAuth && data.user) {
        MagicAuth.saveLoginResponse(data);
      }
      showAlert(
        "준회원 가입이 완료되었습니다. 1주 무료(프리) 플랜은 로그인 후 구독·결제 페이지에서 TRV 또는 MT5 식별로 신청할 수 있습니다.",
        false
      );
      form.reset();
    } catch (err) {
      showAlert("네트워크 오류: API 주소(" + apiBase() + ")와 서버 실행 여부를 확인하세요.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
