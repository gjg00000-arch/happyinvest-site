(function () {
  var form = document.getElementById("registration-form");
  var alertEl = document.getElementById("reg-alert");
  var submitBtn = document.getElementById("reg-submit");
  var apiLabel = document.getElementById("api-base-label");
  var googlePrefillStatus = document.getElementById("google-prefill-status");
  var googleSigninButton = document.getElementById("google-signin-button");

  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return (m && m.content) || window.location.origin.replace(/\/$/, "");
  }

  if (apiLabel) apiLabel.textContent = apiBase();

  function readGoogleClientId() {
    var m = document.querySelector('meta[name="google-client-id"]');
    return (m && String(m.content || "").trim()) || "";
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
    setGooglePrefillStatus("Google 계정 정보로 기본 입력을 채웠습니다. 나머지 항목을 입력해 가입을 완료하세요.", false);
  }

  async function tryGoogleRegisterOrLogin(credential) {
    var choice = signupPlanChoice();
    var res = await fetch(apiBase() + "/api/auth/google/register-or-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: credential,
        signup_plan_choice: choice,
      }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(data.error || "Google 가입/로그인에 실패했습니다.");
    }
    try {
      localStorage.setItem("magic_member_jwt", data.token || "");
    } catch (_err) {}
    if (window.MagicAuth && data.user) {
      window.MagicAuth.set(data.user.email, data.user.role || "guest");
    }
    if (choice === "none") {
      showAlert("Google 계정으로 가입/로그인되었습니다. 추가 프로필은 마이페이지에서 입력할 수 있습니다.", false);
      return;
    }
    showAlert("Google 가입/로그인이 완료되었습니다. 선택한 플랜 결제창으로 이동합니다.", false);
    setTimeout(function () {
      window.location.href = billingUrlForChoice(choice);
    }, 350);
  }

  function initGooglePrefill() {
    var clientId = readGoogleClientId();
    if (!clientId) {
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
        setGooglePrefillStatus("Google 계정 확인 중…", false);
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

  var sendCodeBtn = document.getElementById("phone-send-code");
  var cooldownEl = document.getElementById("phone-cooldown");
  var cooldownTimer = null;
  var signupChoiceEl = document.getElementById("signup_plan_choice");
  var googleOtpBlock = document.getElementById("google-otp-block");
  var googleOtpGenerateBtn = document.getElementById("google-otp-generate");
  var googleOtpStatus = document.getElementById("google-otp-status");
  var googleOtpQr = document.getElementById("google-otp-qr");
  var googleOtpSecret = document.getElementById("google_otp_secret");
  var googleOtpSetupId = document.getElementById("google_otp_setup_id");
  var googleOtpCode = document.getElementById("google_otp_code");
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

  function setCooldown(sec) {
    if (sendCodeBtn) sendCodeBtn.disabled = sec > 0;
    if (cooldownEl) {
      if (sec > 0) {
        cooldownEl.textContent = sec + "초 후에 다시 요청할 수 있습니다.";
      } else {
        cooldownEl.textContent = "";
      }
    }
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (sec > 0) {
      var left = sec;
      cooldownTimer = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
          setCooldown(0);
        } else if (cooldownEl) {
          cooldownEl.textContent = left + "초 후에 다시 요청할 수 있습니다.";
        }
      }, 1000);
    }
  }

  if (sendCodeBtn) {
    sendCodeBtn.addEventListener("click", async function () {
      var phoneEl = document.getElementById("phone");
      var phone = phoneEl ? phoneEl.value.trim() : "";
      if (!phone) {
        showAlert("휴대폰 번호를 먼저 입력하세요.", true);
        if (phoneEl) phoneEl.focus();
        return;
      }
      showAlert("인증번호 발송 중…", false);
      sendCodeBtn.disabled = true;
      try {
        var res = await fetch(apiBase() + "/api/auth/phone/request-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone, purpose: "register" }),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          showAlert(data.error || "발송에 실패했습니다. (" + res.status + ")", true);
          if (res.status === 429 && data.next_allowed_at) {
            var left = Math.ceil(
              (new Date(data.next_allowed_at).getTime() - Date.now()) / 1000
            );
            if (left > 0) setCooldown(left);
            else sendCodeBtn.disabled = false;
          } else {
            sendCodeBtn.disabled = false;
          }
          return;
        }
        var extra = data.mock_code ? " (개발: 코드 " + data.mock_code + ")" : "";
        showAlert((data.message || "인증번호를 발송했습니다.") + extra, false);
        setCooldown(60);
        var otpEl = document.getElementById("phone_otp");
        if (otpEl) otpEl.focus();
      } catch (err) {
        showAlert("네트워크 오류: " + (err && err.message ? err.message : err), true);
        sendCodeBtn.disabled = false;
      }
    });
  }

  function showAlert(msg, isError) {
    alertEl.hidden = false;
    alertEl.textContent = msg;
    alertEl.className = "reg-alert" + (isError ? " reg-alert--error" : " reg-alert--ok");
  }

  function hideAlert() {
    alertEl.hidden = true;
    alertEl.textContent = "";
  }

  function signupPlanChoice() {
    var v = signupChoiceEl ? String(signupChoiceEl.value || "").trim() : "";
    if (!v) return "regular_default";
    return v;
  }

  function isRegularChoice(choice) {
    return String(choice || "") === "regular_default";
  }

  function setGoogleOtpStatus(msg, isError) {
    if (!googleOtpStatus) return;
    googleOtpStatus.textContent = msg || "";
    googleOtpStatus.style.color = isError ? "#b42318" : "";
  }

  function toggleGoogleOtpByPlan() {
    var regular = isRegularChoice(signupPlanChoice());
    if (googleOtpBlock) googleOtpBlock.style.display = regular ? "" : "none";
    if (!regular) {
      if (googleOtpSetupId) googleOtpSetupId.value = "";
      if (googleOtpCode) googleOtpCode.value = "";
      if (googleOtpSecret) googleOtpSecret.value = "";
      if (googleOtpQr) {
        googleOtpQr.hidden = true;
        googleOtpQr.removeAttribute("src");
      }
      setGoogleOtpStatus("", false);
    }
  }

  if (signupChoiceEl) {
    signupChoiceEl.addEventListener("change", toggleGoogleOtpByPlan);
    toggleGoogleOtpByPlan();
  }

  if (googleOtpGenerateBtn) {
    googleOtpGenerateBtn.addEventListener("click", async function () {
      var emailEl = document.getElementById("email");
      var email = emailEl ? emailEl.value.trim() : "";
      if (!email) {
        showAlert("Google OTP 키 생성 전에 이메일을 먼저 입력하세요.", true);
        if (emailEl) emailEl.focus();
        return;
      }
      googleOtpGenerateBtn.disabled = true;
      setGoogleOtpStatus("Google OTP 키 생성 중…", false);
      try {
        var res = await fetch(apiBase() + "/api/auth/totp/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email }),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          setGoogleOtpStatus(data.error || "Google OTP 키 생성에 실패했습니다.", true);
          return;
        }
        if (googleOtpSetupId) googleOtpSetupId.value = data.setup_id || "";
        if (googleOtpSecret) googleOtpSecret.value = data.secret_base32 || "";
        if (googleOtpQr && data.otpauth_url) {
          googleOtpQr.src =
            "https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=" + encodeURIComponent(data.otpauth_url);
          googleOtpQr.hidden = false;
        }
        setGoogleOtpStatus("키 생성 완료. 앱에 등록 후 6자리 코드를 입력하세요.", false);
        if (googleOtpCode) googleOtpCode.focus();
      } catch (err) {
        setGoogleOtpStatus("네트워크 오류: " + (err && err.message ? err.message : err), true);
      } finally {
        googleOtpGenerateBtn.disabled = false;
      }
    });
  }

  function billingUrlForChoice(choice) {
    var base = "../billing/index.html?signup=1";
    if (choice === "event_1w_free") return base + "&plan=event_1w_free";
    if (choice === "regular_default") return base + "&plan=regular_default";
    return "../billing/index.html";
  }

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

    var phoneVal = document.getElementById("phone").value.trim();
    var phoneOtp = document.getElementById("phone_otp")
      ? String(document.getElementById("phone_otp").value).replace(/\D/g, "")
      : "";
    if (!phoneVal) {
      showAlert("휴대폰 번호를 입력하세요.", true);
      return;
    }
    if (phoneOtp.length !== 6) {
      showAlert("휴대폰으로 받은 6자리 인증번호를 입력하세요. (먼저 ‘인증번호 받기’)", true);
      return;
    }
    if (isRegularChoice(signupPlanChoice())) {
      var setupId = googleOtpSetupId ? String(googleOtpSetupId.value || "").trim() : "";
      var code = googleOtpCode ? String(googleOtpCode.value || "").replace(/\D/g, "") : "";
      if (!setupId) {
        showAlert("정규 플랜은 Google OTP 키를 먼저 생성해야 합니다.", true);
        return;
      }
      if (code.length !== 6) {
        showAlert("정규 플랜은 Google OTP 6자리 코드를 입력해야 합니다.", true);
        if (googleOtpCode) googleOtpCode.focus();
        return;
      }
    }

    var body = {
      email: document.getElementById("email").value.trim(),
      password: pw,
      display_name: document.getElementById("display_name").value.trim(),
      country_code: countryCodeEl ? String(countryCodeEl.value || "").trim().toUpperCase() : "KR",
      agree_terms: true,
      agree_privacy: true,
      phone: phoneVal,
      phone_otp: phoneOtp,
      tv_username: document.getElementById("tv_username").value.trim() || undefined,
      mql5_email: document.getElementById("mql5_email").value.trim() || undefined,
      mt5_login: document.getElementById("mt5_login").value.trim() || undefined,
      mt5_server: document.getElementById("mt5_server").value.trim() || undefined,
      telegram_username: document.getElementById("telegram_username").value.trim() || undefined,
      telegram_chat_id: (function () {
        var el = document.getElementById("telegram_chat_id");
        return el && el.value.trim() ? el.value.trim() : undefined;
      })(),
      signup_plan_choice: signupPlanChoice(),
      google_otp_setup_id: googleOtpSetupId ? googleOtpSetupId.value.trim() || undefined : undefined,
      google_otp_code: googleOtpCode ? String(googleOtpCode.value || "").replace(/\D/g, "") || undefined : undefined,
      referral_code: document.getElementById("referral_code").value.trim() || undefined,
      referrer_homepage_id: document.getElementById("referrer_homepage_id").value.trim() || undefined,
      referrer_tr_id: document.getElementById("referrer_tr_id").value.trim() || undefined,
      referrer_mt5_id: document.getElementById("referrer_mt5_id").value.trim() || undefined,
      referrer_kiwoom_id: document.getElementById("referrer_kiwoom_id").value.trim() || undefined,
    };

    submitBtn.disabled = true;
    try {
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
      try {
        localStorage.setItem("magic_member_jwt", data.token || "");
      } catch (err) {}
      if (window.MagicAuth && data.user) {
        window.MagicAuth.set(data.user.email, data.user.role || "guest", {
          preferred_language: data.user.preferred_language,
        });
      }
      var choice = signupPlanChoice();
      if (choice === "none") {
        showAlert("가입이 완료되었습니다. 일반회원으로 이용 가능합니다.", false);
        form.reset();
      } else {
        showAlert("가입이 완료되었습니다. 선택한 플랜 결제창으로 이동합니다.", false);
        setTimeout(function () {
          window.location.href = billingUrlForChoice(choice);
        }, 350);
      }
    } catch (err) {
      showAlert("네트워크 오류: API 주소(" + apiBase() + ")와 서버 실행 여부를 확인하세요.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
