(function () {
  var TOKEN_KEY = "magic_admin_token";
  var API =
    (document.querySelector('meta[name="api-base"]') || {}).content || "https://magicindicatorglobal.com";

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function authHeaders() {
    var t = getToken();
    var h = { "Content-Type": "application/json" };
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, authHeaders(), opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, j: j };
      });
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function parseIsoDate(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object" && raw !== null && raw.$date !== undefined) {
      raw = raw.$date;
    }
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 만료까지 남은 일수별 색(3일 이내·당일 등) */
  function monitorExpiryMarkup(isoRaw) {
    var d = parseIsoDate(isoRaw);
    var text = isoRaw != null ? String(isoRaw) : "";
    if (!d)
      return "<small>" + esc(text) + "</small>";
    var nowMs = Date.now();
    var endMs = d.getTime();
    var daysLeft = Math.ceil((endMs - nowMs) / 86400000);
    var cls = "monitor-expiry--ok";
    if (daysLeft < 0) cls = "monitor-expiry--past";
    else if (daysLeft <= 1) cls = "monitor-expiry--soon";
    else if (daysLeft <= 3) cls = "monitor-expiry--warn";
    var hint =
      daysLeft >= 0
        ? " <span class='monitor-expiry-days'>(약 " + daysLeft + "일 남음)</span>"
        : " <span class='monitor-expiry-days'>(만료됨)</span>";
    return (
      '<small class="monitor-exp-wrap ' +
      cls +
      '">' +
      esc(text) +
      hint +
      "</small>"
    );
  }

  function rowCells(label, o) {
    if (!o) return "";
    return (
      "<tr><td>" +
      esc(label) +
      '</td><td class="num">' +
      o.trv +
      '</td><td class="num">' +
      o.mt5 +
      '</td><td class="num"><strong>' +
      o.total +
      "</strong></td></tr>"
    );
  }

  function rowRegion(o) {
    if (!o) return "";
    return (
      "<tr><td><code>" +
      esc(o.region) +
      '</code></td><td class="num">' +
      o.trv +
      '</td><td class="num">' +
      o.mt5 +
      '</td><td class="num">' +
      (o.other != null ? o.other : 0) +
      '</td><td class="num"><strong>' +
      o.total +
      "</strong></td></tr>"
    );
  }

  function winLine(w) {
    if (!w) return "";
    return esc(w.label || "") + " <span class='admin-note' style='display:block;margin:0'>(UTC " + esc(w.start) + " ~ " + esc(w.end) + ")</span>";
  }

  function render(data) {
    var el = document.getElementById("plan-board-content");
    if (!el) return;
    if (data.error) {
      el.innerHTML = "<p class='err'>오류: " + esc(data.error) + "</p>";
      return;
    }
    var w = data.windows || {};
    var f7 = data.free_7d || {};
    var f7g = data.free_7d_geo || {};
    var o1 = data.one_month_event || {};
    var geoBlock = "";
    if (f7g && f7g.by_region && f7g.by_region.length) {
      var br = f7g.by_region.map(rowRegion).join("");
      var cc =
        f7g.by_country_top && f7g.by_country_top.length
          ? f7g.by_country_top
              .map(function (c) {
                return (
                  "<tr><td><code>" +
                  esc(c.country) +
                  '</code></td><td class="num">' +
                  c.n +
                  "</td></tr>"
                );
              })
              .join("")
          : "";
      geoBlock =
        "<h3>7일 무료 — 권역·국가 (누적, IP→geoip-lite)</h3>" +
        "<p class='admin-note' style='margin:0.35rem 0 0.75rem'>" +
        esc(f7g.notes || "") +
        "</p>" +
        "<p class='admin-note'>IP/국가 수집 건: <strong>" +
        (f7g.with_geo_captured != null ? f7g.with_geo_captured : "—") +
        "</strong> / 전체 원장 <strong>" +
        (f7g.total_free_7d_ledger != null ? f7g.total_free_7d_ledger : "—") +
        "</strong></p>" +
        "<div class='admin-table-wrap'><table class='admin-table cohort-table'><thead><tr><th>권역</th><th class='num'>TRV</th><th class='num'>MT5</th><th class='num'>기타</th><th class='num'>합</th></tr></thead><tbody>" +
        br +
        "</tbody></table></div>" +
        (cc
          ? "<h3>국가 TOP (7일 무료 누적)</h3><div class='admin-table-wrap'><table class='admin-table'><thead><tr><th>country</th><th class='num'>n</th></tr></thead><tbody>" +
            cc +
            "</tbody></table></div>"
          : "");
    }
    el.innerHTML =
      "<p class='admin-note' style='margin-top:0'>생성: <code>" +
      esc(data.generated_at) +
      "</code> · " +
      esc(data.timezone) +
      " · 기준일 " +
      esc(data.kst_ymd) +
      "</p>" +
      "<p class='admin-note'>" +
      esc((f7.notes || "").split("·").join(" · ")) +
      "</p>" +
      "<h3>7일 무료 (TRV / MT5 / 합산)</h3>" +
      "<p class='admin-note' style='margin:0.35rem 0 0.5rem'>구간(일) " +
      winLine(w.day) +
      "</p>" +
      "<p class='admin-note' style='margin:0.35rem 0 0.5rem'>구간(주) " +
      winLine(w.week) +
      "</p>" +
      "<p class='admin-note' style='margin:0.35rem 0 0.5rem'>구간(월) " +
      winLine(w.month) +
      "</p>" +
      "<div class='admin-table-wrap'><table class='admin-table cohort-table'><thead><tr><th>구간</th><th class='num'>TRV</th><th class='num'>MT5</th><th class='num'>합산</th></tr></thead><tbody>" +
      rowCells("누적(전체 원장)", f7.cumulative) +
      rowCells("현재 유효(만료 전·active)", f7.currently_active) +
      rowCells("신규 · KST 당일", f7.new_in_kst_day) +
      rowCells("신규 · KST 이번 주(월~일)", f7.new_in_kst_week) +
      rowCells("신규 · KST 당월", f7.new_in_kst_month) +
      "</tbody></table></div>" +
      geoBlock +
      "<h3>1M 이벤트 MagicTrading (TRV / MT5 / 고유)</h3>" +
      "<p class='admin-note' style='margin:0.35rem 0 0.75rem'>" +
      esc((o1.notes || "").split("·").join(" · ")) +
      "</p>" +
      "<div class='admin-table-wrap'><table class='admin-table cohort-table'><thead><tr><th>구간</th><th class='num'>TRV(used_at)</th><th class='num'>MT5(used_at)</th><th class='num'>고유(합산)</th></tr></thead><tbody>" +
      rowCells("누적(1M 이벤트 경험/현재1M)", o1.cumulative_ever) +
      rowCells("현재 유효(1M SKU·만료 전)", o1.currently_active) +
      rowCells("신규(가입시각) · KST 당일", o1.new_in_kst_day) +
      rowCells("신규(가입시각) · KST 이번 주", o1.new_in_kst_week) +
      rowCells("신규(가입시각) · KST 당월", o1.new_in_kst_month) +
      "</tbody></table></div>";

    if (data.recent_7d_rows && data.recent_7d_rows.length) {
      var h =
        "<h3>최근 7일 원장 (최하단 " +
        data.recent_7d_rows.length +
        "건)</h3><div class='admin-table-wrap'><table class='admin-table'><thead><tr><th>유형</th><th>subject</th><th>국가</th><th>권역</th><th>IP(저장)</th><th>상태</th><th>만료</th><th>생성(UTC)</th><th>이메일</th></tr></thead><tbody>";
      data.recent_7d_rows.forEach(function (r) {
        var ex = r.expires_at;
        if (ex && ex.$date) ex = ex.$date;
        var cr = r.created_at;
        if (cr && cr.$date) cr = cr.$date;
        h +=
          "<tr><td>" +
          esc(r.subject_type) +
          "</td><td><code>" +
          esc((r.subject_key || r.subject_id || "").slice(0, 64)) +
          "</code></td><td><code>" +
          esc(r.country_code) +
          "</code></td><td>" +
          esc(r.geo_region) +
          "</td><td><code>" +
          esc(r.client_ip) +
          "</code></td><td>" +
          esc(r.status) +
          "</td><td>" +
          monitorExpiryMarkup(ex) +
          "</td><td><small>" +
          esc(String(cr != null ? cr : "")) +
          "</small></td><td>" +
          esc(r.user_email) +
          "</td></tr>";
      });
      h += "</tbody></table></div>";
      el.innerHTML += h;
    }

    if (data.recent_1m_users && data.recent_1m_users.length) {
      var h2 =
        "<h3>1M 이벤트 관련 회원 (최근 갱신 " +
        data.recent_1m_users.length +
        "명)</h3><div class='admin-table-wrap'><table class='admin-table'><thead><tr><th>이메일</th><th>플랫폼</th><th>SKU</th><th>TRV used</th><th>MT5 used</th><th>만료</th></tr></thead><tbody>";
      data.recent_1m_users.forEach(function (u) {
        h2 +=
          "<tr><td>" +
          esc(u.email) +
          "</td><td>" +
          esc(u.signup_plan_platform) +
          "</td><td>" +
          esc(u.dodam_plan_sku) +
          "</td><td><small>" +
          esc(String(u.event_1m_trv_used_at || "")) +
          "</small></td><td><small>" +
          esc(String(u.event_1m_mt5_used_at || "")) +
          "</small></td><td>" +
          monitorExpiryMarkup(u.dodam_plan_expires_at || null) +
          "</td></tr>";
      });
      h2 += "</tbody></table></div>";
      el.innerHTML += h2;
    }
  }

  function showLogin() {
    document.getElementById("admin-monitor-login").style.display = "block";
    document.getElementById("admin-monitor-app").style.display = "none";
  }

  function showApp() {
    document.getElementById("admin-monitor-login").style.display = "none";
    document.getElementById("admin-monitor-app").style.display = "block";
    var w = document.getElementById("admin-monitor-who");
    if (w) {
      api("/api/admin/me", { method: "GET" }).then(function (x) {
        w.textContent = (x.j && x.j.email) || "—";
      });
    }
    loadBoard();
  }

  function loadBoard() {
    var el = document.getElementById("plan-board-content");
    if (el) el.innerHTML = "<p class='admin-note'>불러오는 중…</p>";
    var q = document.getElementById("include-samples");
    var s = q && q.checked ? "?samples=1" : "";
    api("/api/admin/monitor/plan-board" + s, { method: "GET" }).then(function (x) {
      if (!x.ok) {
        if (x.status === 401) {
          setToken("");
          showLogin();
        }
        render({ error: (x.j && x.j.error) || JSON.stringify(x.j) });
        return;
      }
      render(x.j || {});
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("admin-monitor-login-form");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var em = (document.getElementById("admin-email") || {}).value || "";
        var pw = (document.getElementById("admin-password") || {}).value || "";
        var err = document.getElementById("admin-login-err");
        if (err) {
          err.textContent = "";
          err.style.display = "none";
        }
        api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ email: em, password: pw }),
        }).then(function (x) {
          if (!x.ok) {
            if (err) {
              err.textContent = (x.j && x.j.error) || "로그인 실패";
              err.style.display = "block";
            }
            return;
          }
          if (x.j && x.j.token) {
            setToken(x.j.token);
            showApp();
          }
        });
      });
    }
    var out = document.getElementById("admin-monitor-logout");
    if (out) {
      out.addEventListener("click", function () {
        setToken("");
        showLogin();
      });
    }
    var rel = document.getElementById("plan-board-reload");
    if (rel) rel.addEventListener("click", loadBoard);
    var inc = document.getElementById("include-samples");
    if (inc) inc.addEventListener("change", loadBoard);
    if (getToken()) showApp();
    else showLogin();
  });
})();
