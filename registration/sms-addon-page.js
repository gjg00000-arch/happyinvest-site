(function () {
  var form = document.getElementById("sms-addon-form");
  var alertEl = document.getElementById("sms-addon-alert");

  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return (m && m.content) || window.location.origin.replace(/\/$/, "");
  }

  function headers() {
    var h =
      window.MagicAuth && typeof window.MagicAuth.headers === "function"
        ? window.MagicAuth.headers()
        : { "X-User-Id": "guest@local", "X-User-Role": "guest" };
    try {
      var tok = localStorage.getItem("magic_member_jwt");
      if (tok) h.Authorization = "Bearer " + tok;
    } catch (_e) {}
    h["Content-Type"] = "application/json";
    return h;
  }

  function show(msg, bad) {
    if (!alertEl) return;
    alertEl.hidden = false;
    alertEl.textContent = msg;
    alertEl.className = "reg-alert" + (bad ? " reg-alert--error" : " reg-alert--ok");
  }

  function renderUsage(u) {
    var block = document.getElementById("sms-addon-usage-block");
    var line = document.getElementById("sms-addon-usage-line");
    var alertsEl = document.getElementById("sms-addon-usage-alerts");
    var topWrap = document.getElementById("sms-addon-topup-wrap");
    var topList = document.getElementById("sms-addon-topup-list");
    var topOff = document.getElementById("sms-addon-topup-off");
    if (!block || !line || !alertsEl) return;

    var usage = u && u.sms_addon_usage;
    var tier = u && String(u.sms_addon_choice || "");

    if (!u) {
      block.hidden = true;
      return;
    }

    if (tier && tier !== "none" && usage && usage.active === false) {
      block.hidden = false;
      line.textContent =
        "문자 패키지는 저장되어 있으나 현재 발송이 비활성입니다. 결제 확인·관리 활성화 후 사용량이 표시됩니다.";
      alertsEl.textContent =
        "한도가 소진되기 전 이용 안내 문자(약 70%/95%) 및 추가 충전·문의 안내는 활성화 후 적용됩니다.";
      if (topWrap) topWrap.hidden = true;
      if (topOff) {
        topOff.hidden = false;
        topOff.textContent =
          u.sms_addon_self_topup_enabled === true
            ? "활성화 후 아래에서 테스트용 충전을 사용할 수 있습니다."
            : "추가 문자 충전은 구독·결제 안내 또는 고객 문의 후 반영됩니다.";
      }
      return;
    }

    if (!usage || !usage.active) {
      block.hidden = true;
      return;
    }

    block.hidden = false;
    var pct = usage.pct_used != null ? String(usage.pct_used) + "%" : "-";
    line.textContent =
      "집계 월 " +
      (usage.period_yyyymm || "") +
      " — 사용 " +
      usage.sent_this_month +
      " / 한도 " +
      usage.cap_monthly +
      " (잔여 " +
      usage.remaining +
      ", 약 " +
      pct +
      " 사용)";
    if (usage.bonus_quota > 0) {
      line.textContent += " · 정액 외 추가 " + usage.bonus_quota + "건 포함";
    }

    alertsEl.textContent =
      "한도의 약 70%, 95%에 도달하면 별도 안내 문자로 잔여 통수와 충전 방법을 알려 드립니다(안내 문자 자체는 한도에서 빼지 않습니다).";

    if (u.sms_addon_self_topup_enabled === true && topWrap && topList) {
      if (topOff) topOff.hidden = true;
      topWrap.hidden = false;
      topList.innerHTML = "";
      var packs = u.sms_topup_reference_packs || [];
      packs.forEach(function (p) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.style.marginRight = "0.5rem";
        btn.style.marginTop = "0.35rem";
        btn.textContent = "+" + p.messages + "건 (US$" + p.price_usd + " 참고)";
        btn.addEventListener("click", function () {
          doTopup(p.id);
        });
        topList.appendChild(btn);
      });
      if (!packs.length) topWrap.hidden = true;
    } else {
      if (topWrap) topWrap.hidden = true;
      if (topOff) {
        topOff.hidden = false;
        topOff.textContent =
          "추가 문자 충전은 구독·결제 안내(billing) 또는 고객 문의 후 운영에서 반영합니다. 내부 테스트 시에만 서버에서 자가 충전 API를 켤 수 있습니다.";
      }
    }
  }

  async function doTopup(packId) {
    show("충전 처리 중…", false);
    try {
      var res = await fetch(apiBase() + "/api/me/sms-addon/topup", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ pack_id: packId }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        show(data.error || "충전 실패 (" + res.status + ")", true);
        return;
      }
      show(data.message || "충전이 반영되었습니다.", false);
      if (data.user) renderUsage(data.user);
    } catch (err) {
      show(err && err.message ? err.message : "네트워크 오류", true);
    }
  }

  async function loadProfilePick() {
    var sel = document.getElementById("sms_addon_select");
    if (!sel) return;
    try {
      var r = await fetch(apiBase() + "/api/me/profile", { headers: headers(), cache: "no-store" });
      var j = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) return;
      var u = j.user;
      if (u && u.sms_addon_choice) sel.value = u.sms_addon_choice;
      var hint = document.getElementById("sms-addon-account-hint");
      if (hint && u && u.email) {
        hint.textContent = "로그인 표시 계정: " + u.email;
      }
      renderUsage(u || null);
      if (u && !u.phone_e164) {
        show(
          "휴대폰 번호 미등록 상태입니다. 정회원 경로 가입 또는 정회원 전환을 완료한 뒤 유료 문자 패키지만 신청 가능합니다.",
          true
        );
      }
    } catch (_e) {}
  }

  if (!form) return;

  loadProfilePick();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var sel = document.getElementById("sms_addon_select");
    var tier = sel ? String(sel.value || "none") : "none";
    show("저장 중…", false);
    try {
      var res = await fetch(apiBase() + "/api/me/sms-addon", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ sms_addon_choice: tier }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        show(data.error || "저장 실패 (" + res.status + ")", true);
        return;
      }
      show(data.message || "저장되었습니다.", false);
      if (data.user) {
        renderUsage(data.user);
        var sel2 = document.getElementById("sms_addon_select");
        if (sel2 && data.user.sms_addon_choice) sel2.value = data.user.sms_addon_choice;
      } else {
        await loadProfilePick();
      }
    } catch (err) {
      show(err && err.message ? err.message : "네트워크 오류", true);
    }
  });
})();
