/**
 * 초기 단계 트래픽 대기 안내.
 * - 제어: assets/traffic-gate.json 의 enabled 와 수치 필드(운영에서 배포·캐시 무효화).
 * - 순번·대기 인원은 JSON 수치 기반이며, 공정한 전역 큐가 아님(초기 완화용).
 */
(function () {
  var all = document.querySelectorAll('script[src*="traffic-wait-gate.js"]');
  var script = all.length ? all[all.length - 1] : null;
  if (!script) return;

  var cfgUrl = script.getAttribute("data-gate-config") || "assets/traffic-gate.json";
  try {
    cfgUrl = new URL(cfgUrl, script.src || window.location.href).href;
  } catch (e) {
    cfgUrl = script.getAttribute("data-gate-config") || "assets/traffic-gate.json";
  }

  var LS_AHEAD = "mi_traffic_gate_last_ahead";
  var LS_SEEN = "mi_traffic_gate_seen_ts";

  var pollTimer = null;
  var rootEl = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fetchConfig() {
    var bust = "t=" + Date.now();
    var url = cfgUrl + (cfgUrl.indexOf("?") >= 0 ? "&" : "?") + bust;
    return fetch(url, { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : null;
    });
  }

  function removeOverlay() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    rootEl = null;
    document.documentElement.classList.remove("traffic-gate-open");
  }

  function ensureOverlay() {
    if (rootEl) return rootEl;
    document.documentElement.classList.add("traffic-gate-open");
    rootEl = document.createElement("div");
    rootEl.className = "traffic-gate-backdrop";
    rootEl.setAttribute("role", "alertdialog");
    rootEl.setAttribute("aria-modal", "true");
    rootEl.setAttribute("aria-live", "polite");
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function render(cfg) {
    var el = ensureOverlay();
    var ahead = Number(cfg.approxQueueAhead);
    if (!isFinite(ahead) || ahead < 0) ahead = 0;
    var prev = sessionStorage.getItem(LS_AHEAD);
    var prevNum = prev != null ? Number(prev) : NaN;
    var delta =
      isFinite(prevNum) && prevNum > ahead ? Math.round(prevNum - ahead) : null;
    sessionStorage.setItem(LS_AHEAD, String(ahead));

    if (!sessionStorage.getItem(LS_SEEN)) {
      sessionStorage.setItem(LS_SEEN, String(Date.now()));
    }
    var seenTs = Number(sessionStorage.getItem(LS_SEEN)) || Date.now();
    var ticket = String(seenTs).slice(-8);

    var etaLo = Number(cfg.etaMinutesMin);
    var etaHi = Number(cfg.etaMinutesMax);
    if (!isFinite(etaLo) || etaLo < 0) etaLo = 1;
    if (!isFinite(etaHi) || etaHi < etaLo) etaHi = etaLo + 5;

    var homeHref = script.getAttribute("data-home-href") || "/index.html";

    var deltaHtml =
    delta != null && delta > 0 ?
      "<p class=\"traffic-gate-stats\"><strong>앞줄 변화:</strong> 조금 전 안내보다 약 <strong>" +
      esc(delta) +
      "</strong>명 줄었습니다.</p>"
    : "";

    el.innerHTML =
      "<div class=\"traffic-gate-dialog\">" +
      "<h2>" +
      esc(cfg.headline || "잠시 대기") +
      "</h2>" +
      "<p>" +
      esc(cfg.message || "") +
      "</p>" +
      "<p class=\"traffic-gate-stats\"><strong>대기 추정:</strong> 앞줄 약 <strong>" +
      esc(ahead) +
      "</strong>명 · <strong>내 접수 표시</strong> <code>" +
      esc(ticket) +
      "</code></p>" +
      deltaHtml +
      "<p class=\"traffic-gate-stats\"><strong>예상 대기(참고):</strong> 약 " +
      esc(etaLo) +
      "~" +
      esc(etaHi) +
      "분 · 실제와 다를 수 있습니다.</p>" +
      "<div class=\"traffic-gate-actions\">" +
      "<button type=\"button\" class=\"btn\" id=\"traffic-gate-refresh\">상태 새로고침</button>" +
      "<a class=\"btn\" href=\"" +
      esc(homeHref) +
      "\">메인으로</a>" +
      "</div>" +
      "<p class=\"traffic-gate-foot\">접속 폭주 시 초기 완화용 안내입니다. 문제가 계속되면 잠시 후 다시 시도하거나 문의를 이용해 주세요.</p>" +
      "</div>";

    var btn = el.querySelector("#traffic-gate-refresh");
    if (btn) {
      btn.onclick = function () {
        apply();
      };
    }
  }

  function apply() {
    fetchConfig()
      .then(function (cfg) {
        if (!cfg || !cfg.enabled) {
          removeOverlay();
          return;
        }
        render(cfg);
        if (!pollTimer) {
          var s = Number(cfg.pollSeconds);
          if (!isFinite(s) || s < 3) s = 5;
          pollTimer = setInterval(apply, Math.round(s * 1000));
        }
      })
      .catch(function () {
        /* 설정 파일 실패 시 사이트는 막지 않음 */
        removeOverlay();
      });
  }

  apply();
})();
