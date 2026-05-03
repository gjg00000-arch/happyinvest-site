(function () {
  var form = document.getElementById("associate-registration-form");
  var alertEl = document.getElementById("associate-reg-alert");
  var submitBtn = document.getElementById("associate-reg-submit");
  var apiLabel = document.getElementById("api-base-label");

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
      try {
        localStorage.setItem("magic_member_jwt", data.token || "");
      } catch (_err) {}
      if (window.MagicAuth && data.user) {
        window.MagicAuth.set(data.user.email, data.user.role || "guest", {
          preferred_language: data.user.preferred_language,
        });
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
