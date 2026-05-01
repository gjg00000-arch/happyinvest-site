(function () {
  var TOKEN_KEY = "magic_admin_token";
  var metaApi = (document.querySelector('meta[name="api-base"]') || {}).content || "";
  var isLocalAdmin =
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  var isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(location.hostname || "");
  var API = isLocalAdmin
    ? "http://localhost:3000"
    : isIpHost
    ? location.origin
    : metaApi || location.origin || "https://magicindicatorglobal.com";

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

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? "block" : "none";
  }

  function setErr(msg) {
    var e = document.getElementById("admin-login-err");
    if (e) {
      e.textContent = msg || "";
      e.style.display = msg ? "block" : "none";
    }
  }

  function renderDashboard() {
    var box = document.getElementById("admin-stats");
    if (!box) return;
    box.innerHTML = "<p class='admin-note'>불러오는 중…</p>";
    api("/api/admin/stats", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        box.innerHTML =
          "<p class='admin-note'>오류: " + (x.j.error || JSON.stringify(x.j)) + "</p>";
        return;
      }
      var d = x.j;
      var sla = "";
      var staleN =
        typeof d.ticket_bug_stale_48h === "number"
          ? d.ticket_bug_stale_48h
          : Number(d.ticket_bug_stale_48h || 0);
      if (!isNaN(staleN) && staleN > 0) {
        sla =
          '<div class="admin-sla-alert" role="alert"><strong>SLA</strong> 카테고리 bug, ' +
          "생성 후 48시간 경과했으나 상태가 <code>resolved</code>/<code>closed</code>가 아닌 접수가 " +
          "<strong>" +
          staleN +
          "</strong>건 있습니다. <strong>문의·티켓</strong> 탭에서 우선 처리하세요.</div>";
      }
      box.innerHTML =
        sla +
        '<div class="admin-stats">' +
        '<div class="admin-stat"><p class="label">등록 회원</p><p class="value">' +
        (d.users || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">정지</p><p class="value">' +
        (d.suspended || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">문의 티켓</p><p class="value">' +
        (d.tickets != null ? d.tickets : 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">게시글</p><p class="value">' +
        (d.posts || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">댓글</p><p class="value">' +
        (d.comments || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">쿠폰(미교환)</p><p class="value">' +
        (d.coupons_issued_pending != null ? d.coupons_issued_pending : "—") +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">쿠폰(교환됨)</p><p class="value">' +
        (d.coupons_redeemed != null ? d.coupons_redeemed : "—") +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">환불 대기</p><p class="value">' +
        (d.refund_requested != null ? d.refund_requested : "—") +
        "</p></div>" +
        "</div>";
    });
  }

  var adminUsersCache = [];

  function userMatchesSearch(u, q) {
    if (!q) return true;
    var haystack = [
      u.email || "",
      u.role || "",
      u.status === "suspended" ? "정지 suspended" : "활성 active",
      u.note || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function updateUserSearchNote(total, shown) {
    var note = document.getElementById("admin-user-search-note");
    if (!note) return;
    var q = (document.getElementById("admin-user-search") || {}).value || "";
    q = q.trim();
    note.textContent = q
      ? "검색 결과 " + shown + "명 / 전체 " + total + "명"
      : "검색어 없이 전체 " + total + "명을 표시합니다.";
  }

  function fmtDateTime(v) {
    if (!v) return "—";
    var d = new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString("ko-KR");
  }

  function renderUsersTable(users) {
    var tbody = document.querySelector("#admin-users-table tbody");
    if (!tbody) return;
    var q = ((document.getElementById("admin-user-search") || {}).value || "").trim().toLowerCase();
    var filtered = users.filter(function (u) {
      return userMatchesSearch(u, q);
    });
    updateUserSearchNote(users.length, filtered.length);
    tbody.innerHTML = "";
    if (filtered.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='6'>" +
        (users.length === 0 ? "회원 없음" : "검색 결과가 없습니다.") +
        "</td></tr>";
      return;
    }
    var roles = ["guest", "free", "trial", "sub", "vip", "admin"];
    filtered.forEach(function (u) {
      var tr = document.createElement("tr");
      var statusLabel =
        u.status === "suspended"
          ? '<span class="admin-badge admin-badge--off">정지</span>'
          : '<span class="admin-badge admin-badge--on">활성</span>';
      tr.innerHTML =
        "<td>" +
        (u.email || "") +
        "</td>" +
        "<td></td>" +
        "<td></td>" +
        "<td>" +
        statusLabel +
        "</td>" +
        "<td><input type='text' class='user-note' data-email='" +
        (u.email || "").replace(/'/g, "&#39;") +
        "' value='" +
        String(u.note || "").replace(/"/g, "&quot;") +
        "' /></td>" +
        "<td class='btn-row'></td>";

      var sel = document.createElement("select");
      sel.className = "user-role";
      roles.forEach(function (r) {
        var o = document.createElement("option");
        o.value = r;
        o.textContent = r;
        if ((u.role || "") === r) o.selected = true;
        sel.appendChild(o);
      });
      tr.cells[1].appendChild(sel);

      var st = document.createElement("select");
      st.className = "user-status";
      ["active", "suspended"].forEach(function (s) {
        var o = document.createElement("option");
        o.value = s;
        o.textContent = s === "suspended" ? "정지" : "활성";
        if ((u.status || "active") === s) o.selected = true;
        st.appendChild(o);
      });
      tr.cells[2].appendChild(st);

      var save = document.createElement("button");
      save.type = "button";
      save.className = "btn btn--small";
      save.textContent = "저장";
      save.addEventListener("click", function () {
        var em = u.email;
        var noteIn = tr.querySelector(".user-note");
        api("/api/admin/users/" + encodeURIComponent(em), {
          method: "PATCH",
          body: JSON.stringify({
            role: sel.value,
            status: st.value,
            note: noteIn ? noteIn.value : "",
          }),
        }).then(function (r) {
          alert(r.ok ? "저장됨" : r.j.error || "실패");
          if (r.ok) renderUsers();
        });
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--ghost btn--small";
      del.textContent = "삭제";
      del.addEventListener("click", function () {
        if (!confirm("이 회원 레코드를 삭제할까요?")) return;
        api("/api/admin/users/" + encodeURIComponent(u.email), { method: "DELETE" }).then(
          function (r) {
            alert(r.ok ? "삭제됨" : r.j.error || "실패");
            if (r.ok) renderUsers();
          }
        );
      });

      tr.cells[5].appendChild(save);
      tr.cells[5].appendChild(del);
      tbody.appendChild(tr);
    });
  }

  function renderUsers() {
    var tbody = document.querySelector("#admin-users-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>불러오는 중…</td></tr>";
    api("/api/admin/users", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML =
          "<tr><td colspan='6'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      adminUsersCache = x.j.users || [];
      renderUsersTable(adminUsersCache);
    });
  }

  var HOME_PAGE_PATH = "index.html";

  function updateHomePreview() {
    var ta = document.getElementById("admin-home-html");
    var pv = document.getElementById("admin-home-preview");
    if (!ta || !pv) return;
    pv.innerHTML = ta.value || "";
  }

  function renderHomeEditor() {
    var ta = document.getElementById("admin-home-html");
    if (!ta) return;
    ta.value = "";
    ta.placeholder = "불러오는 중…";
    api("/api/admin/pages", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        ta.placeholder = "";
        ta.value = "오류: " + (x.j.error || JSON.stringify(x.j));
        return;
      }
      var pages = x.j.pages || [];
      var row = pages.find(function (p) {
        return (p.path || "") === HOME_PAGE_PATH;
      });
      ta.placeholder = "예: <section class='cms-hero'>...</section>";
      ta.value = row && row.custom_html != null ? String(row.custom_html) : "";
      updateHomePreview();
    });
  }

  function saveHomeHtml() {
    var ta = document.getElementById("admin-home-html");
    if (!ta) return;
    api("/api/admin/pages", {
      method: "PATCH",
      body: JSON.stringify({
        path: HOME_PAGE_PATH,
        custom_html: ta.value,
      }),
    }).then(function (r) {
      alert(r.ok ? "저장됨. 메인 새로고침 후 확인하세요." : r.j.error || "실패");
    });
  }

  function renderPages() {
    var tbody = document.querySelector("#admin-pages-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>불러오는 중…</td></tr>";
    api("/api/admin/pages", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML =
          "<tr><td colspan='5'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      var pages = x.j.pages || [];
      tbody.innerHTML = "";
      pages.forEach(function (p) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><code>" +
          (p.path || "") +
          "</code></td>" +
          "<td><input type='text' class='page-title' value='" +
          String(p.title || "").replace(/"/g, "&quot;") +
          "' /></td>" +
          "<td><input type='number' class='page-order' value='" +
          (p.nav_order != null ? p.nav_order : 0) +
          "' /></td>" +
          "<td></td>" +
          "<td></td>";
        var hid = document.createElement("input");
        hid.type = "checkbox";
        hid.className = "page-hidden";
        hid.checked = !!p.hidden;
        tr.cells[3].appendChild(hid);
        tr.cells[3].appendChild(document.createTextNode(" 숨김"));

        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn--small";
        save.textContent = "저장";
        save.addEventListener("click", function () {
          var titleIn = tr.querySelector(".page-title");
          var orderIn = tr.querySelector(".page-order");
          api("/api/admin/pages", {
            method: "PATCH",
            body: JSON.stringify({
              path: p.path,
              title: titleIn ? titleIn.value : p.title,
              nav_order: orderIn ? Number(orderIn.value) : p.nav_order,
              hidden: hid.checked,
            }),
          }).then(function (r) {
            alert(r.ok ? "저장됨" : r.j.error || "실패");
            if (r.ok) renderPages();
          });
        });
        tr.cells[4].appendChild(save);
        tbody.appendChild(tr);
      });
    });
  }

  function goTab(name) {
    document.querySelectorAll(".admin-tabs button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".admin-panel").forEach(function (p) {
      p.classList.toggle("is-visible", p.getAttribute("data-panel") === name);
    });
    if (name === "dash") renderDashboard();
    if (name === "users") renderUsers();
    if (name === "post-reviews") renderPostReviews();
    if (name === "pages") renderPages();
    if (name === "home") renderHomeEditor();
    if (name === "tickets") renderTickets();
    if (name === "coupons") renderCoupons();
    if (name === "refunds") renderRefunds();
    if (name === "deposits") renderDeposits();
    if (name === "ledger") renderLedgerPortfolio();
    if (name === "free-coupons") renderFreeCouponTracking();
    if (name === "business") renderBusinessOrgs();
  }

  function renderPostReviews() {
    var tbody = document.querySelector("#admin-post-reviews-table tbody");
    var stEl = document.getElementById("post-review-status");
    var catEl = document.getElementById("post-review-category");
    if (!tbody || !stEl) return;
    var status = stEl.value || "pending";
    var category = catEl ? catEl.value || "all" : "all";
    tbody.innerHTML = "<tr><td colspan='9'>불러오는 중…</td></tr>";
    api(
      "/api/admin/post-reviews?status=" +
        encodeURIComponent(status) +
        "&category=" +
        encodeURIComponent(category) +
        "&limit=120",
      {
        method: "GET",
      }
    ).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML = "<tr><td colspan='9'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      var posts = x.j.posts || [];
      tbody.innerHTML = "";
      posts.forEach(function (p) {
        var id = p._id ? String(p._id) : "";
        var tr = document.createElement("tr");
        var created = fmtDateTime(p.created_at);
        var requested = fmtDateTime(p.review_requested_at || p.created_at);
        var approved = fmtDateTime(p.reviewed_at);
        var statusLabel = p.review_status || "pending";
        tr.innerHTML =
          "<td><code style='font-size:0.7rem'>" + id.slice(-8) + "</code></td>" +
          "<td style='font-size:0.75rem'>" + String(p.author_id || "").replace(/</g, "&lt;") + "</td>" +
          "<td>" + String(p.category || "").replace(/</g, "&lt;") + "</td>" +
          "<td style='max-width:220px;font-size:0.75rem'>" + String(p.title || "").replace(/</g, "&lt;") + "</td>" +
          "<td>" + statusLabel + "</td>" +
          "<td style='font-size:0.72rem'>" + created + "</td>" +
          "<td style='font-size:0.72rem'>" + requested + "</td>" +
          "<td style='font-size:0.72rem'>" + approved + "</td>" +
          "<td></td>";

        var cell = tr.cells[8];
        var catRaw = String(p.category || "");
        var isPromoStyle =
          catRaw === "event_promo_shoutout" || catRaw === "reflection";
        if (statusLabel === "approved" && p.review_coupon_code) {
          cell.innerHTML =
            "<span class='admin-note'>완료</span><br/><code style='font-size:0.7rem'>" +
            String(p.review_coupon_code).replace(/</g, "&lt;") +
            "</code>";
        } else {
          var note = document.createElement("input");
          note.type = "text";
          note.className = "user-note";
          note.placeholder = "검토 메모(선택)";
          note.style.minWidth = "11rem";

          var send = document.createElement("label");
          send.style.fontSize = "0.72rem";
          send.style.marginLeft = "0.3rem";
          send.innerHTML = '<input type="checkbox" class="post-review-notify" checked /> 작성자 이메일 발송';

          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn--small";
          btn.textContent = isPromoStyle ? "검토 완료 + MagicTrading 1달 쿠폰" : "검토 완료 + 1개월 쿠폰";
          btn.addEventListener("click", function () {
            var msg =
              catRaw === "reflection"
                ? "실전 후기(reflection)를 승인하고 MagicTrading 1개월(31일) 이벤트 쿠폰을 발급할까요? 동일 이메일·계정으로는 승인·발급 1회만 가능합니다."
                : isPromoStyle
                  ? "검토 완료 후 MagicTrading 1개월 이벤트 쿠폰을 발급할까요? (가입·인증된 회원, 쿠폰 교환은 계정당 1회)"
                  : "검토 완료 처리하고 MagicTrading 1개월 기간형 쿠폰을 발급할까요?";
            if (!confirm(msg)) return;
            var notify = tr.querySelector(".post-review-notify");
            api("/api/admin/post-reviews/" + encodeURIComponent(id) + "/complete", {
              method: "POST",
              body: JSON.stringify({
                review_note: note.value || "",
                notify_author: !!(notify && notify.checked),
              }),
            }).then(function (r) {
              if (!r.ok) {
                alert(r.j.error || "실패");
                return;
              }
              var code = (r.j.coupon && r.j.coupon.code) || "";
              alert("검토 완료 처리됨. 발급 코드: " + code);
              renderPostReviews();
              renderCoupons();
            });
          });
          cell.appendChild(note);
          cell.appendChild(document.createElement("br"));
          cell.appendChild(send);
          cell.appendChild(document.createElement("br"));
          cell.appendChild(btn);
        }
        tbody.appendChild(tr);
      });
      if (posts.length === 0) {
        tbody.innerHTML = "<tr><td colspan='9'>조건에 맞는 게시글이 없습니다.</td></tr>";
      }
    });
  }

  function renderCoupons() {
    var wrap = document.getElementById("admin-coupons-wrap");
    if (!wrap) return;
    wrap.innerHTML = "<p class='admin-note'>불러오는 중…</p>";
    var status = (document.getElementById("cp-filter-status") || {}).value || "all";
    var platform = (document.getElementById("cp-filter-platform") || {}).value || "all";
    var kindFilter = (document.getElementById("cp-filter-kind") || {}).value || "all";
    var q = ((document.getElementById("cp-filter-q") || {}).value || "").trim();
    api(
      "/api/admin/coupons?limit=200&status=" +
        encodeURIComponent(status) +
        "&target_platform=" +
        encodeURIComponent(platform) +
        "&coupon_kind=" +
        encodeURIComponent(kindFilter) +
        "&q=" +
        encodeURIComponent(q),
      { method: "GET" }
    ).then(function (x) {
      if (!x.ok) {
        wrap.innerHTML = "<p class='admin-note'>오류: " + (x.j.error || JSON.stringify(x.j)) + "</p>";
        return;
      }
      var note = x.j.non_transferable_notice || "";
      var stats = x.j.stats || {};
      var total = Number(stats.total || 0);
      var redeemedN = Number(stats.redeemed || 0);
      var usageRate = total ? Math.round((redeemedN / total) * 1000) / 10 : 0;
      var statsHtml =
        '<div class="admin-stats admin-coupon-stats">' +
        '<div class="admin-stat"><p class="label">발급 총계</p><p class="value">' +
        total +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">미사용</p><p class="value">' +
        Number(stats.issued || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">사용 완료</p><p class="value">' +
        redeemedN +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">폐기</p><p class="value">' +
        Number(stats.revoked || 0) +
        "</p></div>" +
        '<div class="admin-stat"><p class="label">사용율</p><p class="value">' +
        usageRate +
        "%</p></div>" +
        "</div>";
      var rows = (x.j.coupons || [])
        .map(function (c) {
          var id = c._id ? String(c._id) : "";
          var issued = c.issued_at ? new Date(c.issued_at).toLocaleString("ko-KR") : "";
          var rv = c.redeemed_at ? new Date(c.redeemed_at).toLocaleString("ko-KR") : "";
          var kind = c.coupon_kind || "duration";
          var kindLabel = kind === "promo_premium_1m" ? "promo_magictrading_1m" : kind;
          var termCell =
            kind === "promo_premium_1m"
                ? "MagicTrading 1달"
                : String(c.term_months != null ? c.term_months : "—");
          var revoke =
            c.status === "issued"
              ? "<button type='button' class='btn btn--small btn--ghost cp-revoke' data-code='" +
                String(c.code || "").replace(/'/g, "&#39;") +
                "'>폐기</button>"
              : "";
          var targetMap = { all: "공통", trv: "TRV", mt5: "MT5", kiwoom_dll: "영웅문DLL" };
          var target = targetMap[c.target_platform || "all"] || c.target_platform || "공통";
          var usedCell =
            c.status === "redeemed"
              ? "사용 확인" + (c.redeemed_at ? "<br><small>교환/웹훅 반영</small>" : "")
              : c.status === "revoked"
                ? "폐기"
                : "미사용";
          return (
            "<tr><td><code style='font-size:0.72rem'>" +
            (c.code || "").replace(/</g, "&lt;") +
            "</code></td><td style='font-size:0.75rem'>" +
            kindLabel.replace(/</g, "&lt;") +
            "</td><td>" +
            target +
            "</td><td>" +
            termCell +
            "</td><td>" +
            usedCell +
            "</td><td>" +
            (c.status || "") +
            "</td><td style='font-size:0.75rem'>" +
            (c.redeemed_by || "—") +
            "</td><td style='font-size:0.72rem'>" +
            issued +
            "</td><td style='font-size:0.72rem'>" +
            rv +
            "</td><td>" +
            revoke +
            "</td></tr>"
          );
        })
        .join("");
      wrap.innerHTML =
        statsHtml +
        "<p class='admin-note' style='margin-bottom:0.75rem'>" +
        (note ? note.replace(/</g, "&lt;") : "") +
        "</p>" +
        "<div class='admin-table-wrap'><table class='admin-table'><thead><tr><th>코드</th><th>종류</th><th>대상</th><th>월/혜택</th><th>사용여부</th><th>상태</th><th>교환자</th><th>발급날짜</th><th>교환일</th><th></th></tr></thead><tbody>" +
        (rows || "<tr><td colspan='10'>조건에 맞는 쿠폰이 없습니다.</td></tr>") +
        "</tbody></table></div>";
      wrap.querySelectorAll(".cp-revoke").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var code = btn.getAttribute("data-code");
          if (!code || !confirm("이 쿠폰을 폐기할까요? (미교환만)")) return;
          api("/api/admin/coupons/" + encodeURIComponent(code) + "/revoke", { method: "POST" }).then(function (r) {
            alert(r.ok ? "폐기됨" : r.j.error || "실패");
            if (r.ok) renderCoupons();
          });
        });
      });
    });
  }

  function renderRefunds() {
    var wrap = document.getElementById("admin-refunds-wrap");
    if (!wrap) return;
    wrap.innerHTML = "<p class='admin-note'>불러오는 중…</p>";
    var status = (document.getElementById("admin-refunds-status") || {}).value || "requested";
    var currency = (document.getElementById("admin-refunds-currency") || {}).value || "all";
    var q = ((document.getElementById("admin-refunds-q") || {}).value || "").trim();
    api(
      "/api/admin/refund-requests?status=" +
        encodeURIComponent(status) +
        "&currency=" +
        encodeURIComponent(currency) +
        "&q=" +
        encodeURIComponent(q),
      { method: "GET" }
    ).then(function (x) {
      if (!x.ok) {
        wrap.innerHTML = "<p class='admin-note'>오류: " + (x.j.error || JSON.stringify(x.j)) + "</p>";
        return;
      }
      var list = x.j.refund_requests || [];
      var rows = list
        .map(function (r) {
          var id = r._id ? String(r._id) : "";
          var calc = r.calculation || {};
          var rem = r.remittance || {};
          var requested = r.requested_at ? new Date(r.requested_at).toLocaleString("ko-KR") : "";
          var remitRequested = r.remittance_requested_at
            ? new Date(r.remittance_requested_at).toLocaleString("ko-KR")
            : requested;
          var remittedAt = r.remitted_at ? new Date(r.remitted_at).toLocaleString("ko-KR") : "—";
          var payoutCurrency = String(r.payout_currency || (rem.type === "domestic_krw" ? "KRW" : "USD"));
          var amount =
            payoutCurrency === "KRW"
              ? "KRW " + Math.round((calc.fx && calc.fx.refund_amount_krw) || 0).toLocaleString("ko-KR")
              : "USD " + Number(calc.refund_amount_usd || 0).toFixed(2);
          var bank =
            payoutCurrency === "KRW"
              ? (rem.krw_bank_name || "—") +
                "<br><small>예금주 " +
                (rem.krw_account_holder || "—") +
                "</small><br><small>계좌 " +
                (rem.krw_account_number || "—") +
                "</small>"
              : (rem.bank_name || "—") +
                " / " +
                (rem.branch_name || "—") +
                "<br><small>SWIFT " +
                (rem.swift_bic || "—") +
                " · " +
                (rem.bank_country || "—") +
                "</small><br><small>계좌 " +
                (rem.account_number || "—") +
                "</small>";
          var action =
            r.status === "remitted"
              ? "처리 완료<br><small>" + remittedAt + "</small>"
              : "<input type='text' class='refund-ref' data-id='" +
                id +
                "' placeholder='송금 참조번호' style='max-width:9rem' /> " +
                "<button type='button' class='btn btn--small refund-remit' data-id='" +
                id +
                "'>처리 완료</button>";
          return (
            "<tr><td><code style='font-size:0.72rem'>" +
            (r.refund_request_no || id).replace(/</g, "&lt;") +
            "</code></td><td style='font-size:0.72rem'>" +
            requested +
            "</td><td style='font-size:0.72rem'>" +
            remitRequested +
            "</td><td>" +
            (r.user_email || "").replace(/</g, "&lt;") +
            "</td><td><strong>" +
            amount +
            "</strong><br><small>방식 " +
            (payoutCurrency === "KRW" ? "원화 송금" : "달러 송금") +
            " · 결제 USD " +
            Number(calc.paid_amount_usd || 0).toFixed(2) +
            " · 잔여 " +
            (calc.remaining_days || 0) +
            "/" +
            (calc.total_days || 0) +
            "일</small></td><td>" +
            (r.status || "") +
            "</td><td style='font-size:0.76rem'>" +
            bank +
            "</td><td>" +
            action +
            "</td></tr>"
          );
        })
        .join("");
      wrap.innerHTML =
        "<div class='admin-table-wrap'><table class='admin-table'><thead><tr><th>접수번호</th><th>신청일</th><th>송금요청일</th><th>이메일</th><th>환불액</th><th>상태</th><th>송금정보</th><th>작업</th></tr></thead><tbody>" +
        (rows || "<tr><td colspan='8'>환불 요청 없음</td></tr>") +
        "</tbody></table></div>";
      wrap.querySelectorAll(".refund-remit").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-id");
          var ref = "";
          var inp = wrap.querySelector(".refund-ref[data-id='" + id + "']");
          if (inp) ref = String(inp.value || "").trim();
          if (!id || !confirm("이 환불 요청을 처리 완료로 표시할까요? 실제 송금 완료 후에만 누르세요.")) return;
          api("/api/admin/refund-requests/" + encodeURIComponent(id) + "/remitted", {
            method: "POST",
            body: JSON.stringify({ remittance_ref: ref }),
          }).then(function (r) {
            alert(r.ok ? "송금완료 처리됨" : r.j.error || "실패");
            if (r.ok) {
              renderRefunds();
              renderDashboard();
            }
          });
        });
      });
    });
  }

  var DEPOSIT_CHANNELS = ["paypal", "airwallex", "crypto"];

  /** 흔한 오타·별칭을 정규 토큰으로 치환한 뒤 mt5/trv/영웅문 구간 추출 */
  function normalizePlatformDelimiterKeywords(s) {
    var t = String(s || "").replace(/\u00a0/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    t = t
      .replace(/\b엠티\s*[·•]?\s*5\b/gi, "mt5 ")
      .replace(/\b엠티5\b/gi, " mt5 ")
      .replace(/\b메타\s*트레이더\s*5\b/gi, " mt5 ")
      .replace(/\bmeta\s*trader\s*5\b/gi, " mt5 ")
      .replace(/\bMT\s*5\b/g, " mt5 ")
      .replace(/\b트뷰\b/gi, " trv ")
      .replace(/\b트레이딩\s*[·•]?\s*뷰\b/gi, " trv ")
      .replace(/\btrading\s*view\b/gi, " trv ")
      .replace(/\b티\s*브이\b/gi, " trv ")
      .replace(/\b예:\s*t\s*v\b/gi, " trv ")
      .replace(/\b영\s*웅\s*문\b/g, "영웅문");
    return t.replace(/\s+/g, " ").trim();
  }

  /** 제목+본문에서 `mt5` · `trv` · `영웅문` 구분자 뒤 구간을 추출(입금 확인·무료 쿠폰 보드 공통). */
  function parseMt5TrvYeongmunDelimiters(title, bodySnippet) {
    var full = normalizePlatformDelimiterKeywords(
      String(title || "").trim() + " " + String(bodySnippet || "").trim()
    );
    var out = { mt5: "", trv: "", yeongungmun: "" };
    if (!full) return out;
    var tokens = [
      { key: "mt5", keyOut: "mt5", re: /\bmt5\b/i },
      { key: "trv", keyOut: "trv", re: /\btrv\b/i },
      { key: "yeongungmun", keyOut: "yeongungmun", re: /영웅문/ },
    ];
    var hits = [];
    tokens.forEach(function (tok) {
      tok.re.lastIndex = 0;
      var m = tok.re.exec(full);
      if (m) hits.push({ keyOut: tok.keyOut, index: m.index, end: m.index + m[0].length });
    });
    hits.sort(function (a, b) {
      return a.index - b.index;
    });
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var next = hits[i + 1];
      var segment = full.slice(h.end, next ? next.index : full.length).trim();
      if (h.keyOut === "mt5") out.mt5 = segment;
      else if (h.keyOut === "trv") out.trv = segment;
      else if (h.keyOut === "yeongungmun") out.yeongungmun = segment;
    }
    return out;
  }

  function escLt(s) {
    return String(s == null ? "" : s).replace(/</g, "&lt;");
  }

  function renderDepositStats(channelKey, stats) {
    var box = document.getElementById("deposit-" + channelKey + "-stats");
    if (!box) return;
    stats = stats || {};
    var total = Number(stats.total || 0);
    var pending = Number(stats.pending || 0);
    var confirmed = Number(stats.confirmed || 0);
    var usd = Number(stats.usd || 0);
    var krw = Number(stats.krw || 0);
    var rate = total ? Math.round(Number(stats.confirm_rate || 0) * 1000) / 10 : 0;
    box.className = "admin-stats admin-coupon-stats";
    box.innerHTML =
      "<div class='admin-stat'><p class='label'>전체</p><p class='value'>" +
      total.toLocaleString("ko-KR") +
      "</p></div>" +
      "<div class='admin-stat'><p class='label'>확인 대기</p><p class='value'>" +
      pending.toLocaleString("ko-KR") +
      "</p></div>" +
      "<div class='admin-stat'><p class='label'>확인 완료</p><p class='value'>" +
      confirmed.toLocaleString("ko-KR") +
      "</p></div>" +
      "<div class='admin-stat'><p class='label'>확인율</p><p class='value'>" +
      rate.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) +
      "%</p></div>" +
      (channelKey === "airwallex" && stats.usd !== undefined
        ? "<div class='admin-stat'><p class='label'>USD</p><p class='value'>" +
          usd.toLocaleString("ko-KR") +
          "</p></div>"
        : "") +
      (channelKey === "airwallex" && stats.krw !== undefined
        ? "<div class='admin-stat'><p class='label'>KRW</p><p class='value'>" +
          krw.toLocaleString("ko-KR") +
          "</p></div>"
        : "");
  }

  function renderDepositSummary() {
    var daysEl = document.getElementById("deposit-summary-days");
    var statsBox = document.getElementById("deposit-summary-stats");
    var tbody = document.querySelector("#deposit-summary-trend-table tbody");
    if (!statsBox || !tbody) return;
    var days = daysEl ? daysEl.value || "30" : "30";
    statsBox.className = "admin-stats admin-coupon-stats";
    statsBox.innerHTML = "<div class='admin-stat'><p class='label'>합산</p><p class='value'>...</p></div>";
    tbody.innerHTML = "<tr><td colspan='8'>합산 추이 불러오는 중...</td></tr>";
    api("/api/admin/deposit-confirmations-summary?days=" + encodeURIComponent(days), {
      method: "GET",
    }).then(function (x) {
      if (!x.ok) {
        statsBox.innerHTML =
          "<div class='admin-stat'><p class='label'>오류</p><p class='value'>!</p></div>";
        tbody.innerHTML =
          "<tr><td colspan='8'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      var s = x.j.stats || {};
      var channels = s.channels || {};
      var paypal = channels.paypal || {};
      var fiat = channels.airwallex || {};
      var crypto = channels.crypto || {};
      var total = Number(s.total || 0);
      var pending = Number(s.pending || 0);
      var confirmed = Number(s.confirmed || 0);
      var amountKrw = Number(s.amount_krw || 0);
      var rate = total ? Math.round(Number(s.confirm_rate || 0) * 1000) / 10 : 0;
      var fx = x.j.fx || {};
      var fxLabel = fx.rate
        ? "USD/KRW " +
          Number(fx.rate).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) +
          " · " +
          escLt(fx.source || "")
        : "환율 없음";
      statsBox.innerHTML =
        "<div class='admin-stat'><p class='label'>전체 입금</p><p class='value'>" +
        total.toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>원화환산 합계</p><p class='value'>₩" +
        Math.round(amountKrw).toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>확인 대기</p><p class='value'>" +
        pending.toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>확인 완료</p><p class='value'>" +
        confirmed.toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>확인율</p><p class='value'>" +
        rate.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) +
        "%</p></div>" +
        "<div class='admin-stat'><p class='label'>PayPal</p><p class='value'>" +
        Number(paypal.total || 0).toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>$·원화</p><p class='value'>" +
        Number(fiat.total || 0).toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>크립토</p><p class='value'>" +
        Number(crypto.total || 0).toLocaleString("ko-KR") +
        "</p></div>" +
        "<div class='admin-stat'><p class='label'>기준 환율</p><p class='value' style='font-size:0.9rem'>" +
        fxLabel +
        "</p></div>";

      var trend = x.j.trend || [];
      tbody.innerHTML = "";
      if (!trend.length) {
        tbody.innerHTML = "<tr><td colspan='8' class='admin-note'>추이 항목 없음</td></tr>";
        return;
      }
      trend.forEach(function (row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          escLt(row.day || "") +
          "</td>" +
          "<td>" +
          Number(row.total || 0).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          "₩" +
          Math.round(Number(row.amount_krw || 0)).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          Number(row.pending || 0).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          Number(row.confirmed || 0).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          Number(row.paypal || 0).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          Number(row.airwallex || 0).toLocaleString("ko-KR") +
          "</td>" +
          "<td>" +
          Number(row.crypto || 0).toLocaleString("ko-KR") +
          "</td>";
        tbody.appendChild(tr);
      });
    });
  }

  function renderDepositChannel(channelKey) {
    var stEl = document.getElementById("deposit-" + channelKey + "-status");
    var platformEl = document.getElementById("deposit-" + channelKey + "-platform");
    var currencyEl = document.getElementById("deposit-" + channelKey + "-currency");
    var qEl = document.getElementById("deposit-" + channelKey + "-q");
    var tbody = document.querySelector("#deposit-" + channelKey + "-table tbody");
    if (!tbody || !stEl) return;
    var status = stEl.value || "pending";
    var platform = platformEl ? platformEl.value || "all" : "all";
    var currency = currencyEl ? currencyEl.value || "all" : "all";
    var q = qEl ? qEl.value || "" : "";
    var isFiatDeposit = channelKey === "airwallex";
    var colCount = isFiatDeposit ? 10 : 8;
    tbody.innerHTML = "<tr><td colspan='" + colCount + "'>불러오는 중…</td></tr>";
    api(
      "/api/admin/deposit-confirmations/" +
        encodeURIComponent(channelKey) +
        "?status=" +
        encodeURIComponent(status) +
        "&platform=" +
        encodeURIComponent(platform) +
        "&currency=" +
        encodeURIComponent(currency) +
        "&q=" +
        encodeURIComponent(q) +
        "&limit=150",
      { method: "GET" }
    ).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML =
          "<tr><td colspan='" +
          colCount +
          "'>" +
          (x.j.error || JSON.stringify(x.j)) +
          "</td></tr>";
        return;
      }
      var posts = x.j.posts || [];
      renderDepositStats(channelKey, x.j.stats);
      tbody.innerHTML = "";
      if (!posts.length) {
        tbody.innerHTML =
          "<tr><td colspan='" + colCount + "' class='admin-note'>항목 없음</td></tr>";
        return;
      }
      posts.forEach(function (p) {
        var id = p._id ? String(p._id) : "";
        var idShort = id.slice(-8);
        var fullBody =
          p.content != null && p.content !== undefined
            ? String(p.content)
            : String(p.content_preview || "");
        var rawTitle = String(p.title || "");
        var slots = parseMt5TrvYeongmunDelimiters(rawTitle, fullBody);
        var prevShort = fullBody.replace(/\s+/g, " ").trim();
        if (prevShort.length > 280) prevShort = prevShort.slice(0, 280) + "…";
        var prev = prevShort.replace(/</g, "&lt;");
        var title = rawTitle.replace(/</g, "&lt;");
        var memo = String(p.author_id || "").replace(/</g, "&lt;");
        var created = p.created_at ? new Date(p.created_at).toLocaleString("ko-KR") : "";
        var requestedAt = p.deposit_remittance_requested_at
          ? new Date(p.deposit_remittance_requested_at).toLocaleString("ko-KR")
          : created;
        var remittedAt = p.deposit_remitted_at
          ? new Date(p.deposit_remitted_at).toLocaleString("ko-KR")
          : p.deposit_verified_at
            ? new Date(p.deposit_verified_at).toLocaleString("ko-KR")
          : "";
        var currencyLabel =
          p.deposit_currency === "KRW"
            ? "KRW"
            : p.deposit_currency === "USD"
              ? "USD"
              : "확인 필요";
        var dv = p.deposit_verified === true;
        var verifiedAt =
          dv && p.deposit_verified_at
            ? new Date(p.deposit_verified_at).toLocaleString("ko-KR")
            : "";
        var byWho = dv ? String(p.deposit_verified_by || "").replace(/</g, "&lt;") : "";

        var tr = document.createElement("tr");
        var cells =
          "<td><code style='font-size:0.7rem'>" +
          escLt(idShort) +
          "</code></td>";
        if (isFiatDeposit) {
          cells +=
            "<td style='font-size:0.72rem;font-weight:700'>" +
            escLt(currencyLabel) +
            "</td>";
        }
        cells +=
          "<td style='max-width:9rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.mt5) +
          "</td>" +
          "<td style='max-width:9rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.trv) +
          "</td>" +
          "<td style='max-width:9rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.yeongungmun) +
          "</td>" +
          "<td style='max-width:220px;font-size:0.78rem'><strong>" +
          title +
          "</strong><br/><span style='opacity:0.9'>" +
          prev +
          "</span></td>" +
          "<td style='font-size:0.72rem'>" +
          memo +
          "</td>";
        if (isFiatDeposit) {
          cells +=
            "<td style='font-size:0.72rem'>" +
            requestedAt +
            "</td>" +
            "<td style='font-size:0.72rem'>" +
            (remittedAt || "<span class='admin-note'>대기</span>") +
            "</td>";
        } else {
          cells +=
            "<td style='font-size:0.72rem'>" +
            created +
            "</td>";
        }
        tr.innerHTML = cells;

        var tdAct = document.createElement("td");
        if (dv) {
          tdAct.innerHTML =
            "<span class='admin-note'>확인 완료</span><br/><small style='font-size:0.68rem'>" +
            (verifiedAt ? verifiedAt + " · " + byWho : byWho ? byWho : "") +
            "</small>";
        } else {
          var noteIn = document.createElement("input");
          noteIn.type = "text";
          noteIn.className = "user-note";
          noteIn.placeholder = "메모(선택)";
          noteIn.style.minWidth = "8rem";
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn--small";
          btn.textContent = isFiatDeposit ? "관리자 확인" : "확인 완료 처리";
          btn.addEventListener("click", function () {
            var msg = isFiatDeposit
              ? "입금 확인 및 송금완료일을 지금 시간으로 기록할까요? (쿠폰 발급 없음)"
              : "입금 확인 완료로 표시할까요? (쿠폰 발급 없음)";
            if (!confirm(msg)) return;
            api(
              "/api/admin/deposit-confirmations/" +
                encodeURIComponent(channelKey) +
                "/" +
                encodeURIComponent(id) +
                "/confirm",
              {
                method: "POST",
                body: JSON.stringify({ deposit_note: noteIn.value || "" }),
              }
            ).then(function (r) {
              if (!r.ok) {
                alert(r.j.error || "실패");
                return;
              }
              alert("처리되었습니다.");
              renderDepositChannel(channelKey);
            });
          });
          tdAct.appendChild(noteIn);
          tdAct.appendChild(document.createElement("br"));
          tdAct.appendChild(btn);
        }
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
    });
  }

  function renderDeposits() {
    renderDepositSummary();
    DEPOSIT_CHANNELS.forEach(function (ch) {
      renderDepositChannel(ch);
    });
  }

  function fmtMoney(n, currency) {
    var x = Number(n || 0);
    if (!isFinite(x)) x = 0;
    if (currency === "KRW") return "₩" + Math.round(x).toLocaleString("ko-KR");
    return (currency || "USDT") + " " + x.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(Number(n))) return "—";
    var x = Number(n);
    return (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
  }

  function renderLedgerSummary(data) {
    var wrap = document.getElementById("ledger-summary-wrap");
    if (!wrap) return;
    var snap = data.latest_snapshot || {};
    var summary = snap.summary || {};
    var changes = data.changes || {};
    function changeCell(key, label) {
      var c = changes[key];
      if (!c) return "<div class='admin-stat'><p class='label'>" + label + "</p><p class='value'>—</p></div>";
      return (
        "<div class='admin-stat'><p class='label'>" +
        label +
        "</p><p class='value'>" +
        fmtMoney(c.value_usdt, "USDT") +
        "</p><small>" +
        fmtPct(c.pct_usdt) +
        " · " +
        fmtMoney(c.value_krw, "KRW") +
        "</small></div>"
      );
    }
    var created = snap.created_at ? new Date(snap.created_at).toLocaleString("ko-KR") : "스냅샷 없음";
    wrap.innerHTML =
      "<div class='admin-stats'>" +
      "<div class='admin-stat'><p class='label'>총 평가(USDT)</p><p class='value'>" +
      fmtMoney(summary.total_value_usdt, "USDT") +
      "</p></div>" +
      "<div class='admin-stat'><p class='label'>총 평가(KRW)</p><p class='value'>" +
      fmtMoney(summary.total_value_krw, "KRW") +
      "</p></div>" +
      "<div class='admin-stat'><p class='label'>포함/제외</p><p class='value'>" +
      (summary.included_count || 0) +
      " / " +
      (summary.excluded_count || 0) +
      "</p></div>" +
      changeCell("day", "1D 변동") +
      changeCell("week", "1W 변동") +
      changeCell("month", "1M 변동") +
      "</div><p class='admin-note'>최근 스냅샷: " +
      escLt(created) +
      " · 현재 모드: 체인/가격 자동조회 시도 + 수동 폴백</p>";
  }

  function renderLedgerPortfolio() {
    var tbody = document.querySelector("#ledger-accounts-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='7'>불러오는 중…</td></tr>";
    api("/api/admin/ledger-portfolio", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML = "<tr><td colspan='7'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      renderLedgerSummary(x.j || {});
      var accounts = x.j.accounts || [];
      if (!accounts.length) {
        tbody.innerHTML = "<tr><td colspan='7' class='admin-note'>등록된 Ledger 주소/xpub이 없습니다.</td></tr>";
        return;
      }
      tbody.innerHTML = "";
      accounts.forEach(function (a) {
        var id = a._id ? String(a._id) : "";
        var amount = Number(a.amount || 0);
        var price = Number(a.price_usdt || 0);
        var usdKrwEl = document.getElementById("ledger-usd-krw");
        var usdKrw = Number((usdKrwEl && usdKrwEl.value) || 1350) || 1350;
        var valueUsdt = amount * price;
        var valueKrw = valueUsdt * usdKrw;
        var src =
          (a.last_balance_source || "manual_fallback") +
          " / " +
          (a.last_price_source || (a.price_usdt ? "manual_fallback" : "missing"));
        var err = a.last_balance_error ? "<br><small style='color:#8a3b20'>조회 실패: " + escLt(a.last_balance_error) + "</small>" : "";
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><strong>" +
          escLt(a.asset_symbol || "") +
          "</strong><br><small>" +
          escLt(a.network || "") +
          "</small><br><input type='text' class='ledger-label' value='" +
          escLt(a.label || "").replace(/'/g, "&#39;") +
          "' /></td>" +
          "<td style='max-width:220px;word-break:break-all;font-size:0.72rem'>" +
          escLt(a.address_or_xpub || "") +
          "</td>" +
          "<td><input type='number' step='any' min='0' class='ledger-amount-row' value='" +
          amount +
          "' style='max-width:8rem' /></td>" +
          "<td><input type='number' step='any' min='0' class='ledger-price-row' value='" +
          price +
          "' style='max-width:8rem' /><br><small>" +
          fmtMoney(valueUsdt, "USDT") +
          "</small></td>" +
          "<td>" +
          fmtMoney(valueKrw, "KRW") +
          "</td>" +
          "<td><label style='font-size:0.74rem'><input type='checkbox' class='ledger-exclude-row' " +
          (a.exclude_from_total ? "checked" : "") +
          " /> 총액 제외</label><br><label style='font-size:0.74rem'><input type='checkbox' class='ledger-active-row' " +
          (a.active === false ? "" : "checked") +
          " /> 활성</label><br><small>" +
          escLt(src) +
          "</small>" +
          err +
          "</td><td></td>";
        var note = document.createElement("input");
        note.type = "text";
        note.className = "ledger-note-row";
        note.placeholder = "메모";
        note.value = a.note || "";
        note.style.maxWidth = "10rem";
        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn--small";
        save.textContent = "저장";
        save.addEventListener("click", function () {
          api("/api/admin/ledger-accounts/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({
              label: tr.querySelector(".ledger-label").value,
              asset_symbol: a.asset_symbol,
              network: a.network,
              address_or_xpub: a.address_or_xpub,
              amount: tr.querySelector(".ledger-amount-row").value,
              price_usdt: tr.querySelector(".ledger-price-row").value,
              exclude_from_total: tr.querySelector(".ledger-exclude-row").checked,
              active: tr.querySelector(".ledger-active-row").checked,
              note: note.value,
            }),
          }).then(function (r) {
            alert(r.ok ? "저장됨" : r.j.error || "실패");
            if (r.ok) renderLedgerPortfolio();
          });
        });
        tr.cells[6].appendChild(note);
        tr.cells[6].appendChild(document.createElement("br"));
        tr.cells[6].appendChild(save);
        tbody.appendChild(tr);
      });
    });
  }

  function ledgerBulkRowsFromText(text) {
    var found = {};
    String(text || "")
      .split(/\r?\n/)
      .forEach(function (line) {
        var s = line.trim();
        if (!s) return;
        var parts = s.split(/\s+/);
        if (parts.length < 2) return;
        var key = parts[0].toLowerCase();
        var addr = parts.slice(1).join("").trim();
        if (!addr) return;
        if (key === "poly" || key === "polygon" || key === "matic" || key === "pol") key = "polygon";
        if (key === "tron" || key === "trx") key = "tron";
        if (key === "bitcoin") key = "btc";
        if (key === "ethereum") key = "eth";
        found[key] = addr;
      });
    var rows = [];
    function add(symbol, network, key, label) {
      if (!found[key]) return;
      rows.push({
        label: label,
        asset_symbol: symbol,
        network: network,
        address_or_xpub: found[key],
        amount: 0,
        price_usdt: 0,
        exclude_from_total: false,
      });
    }
    add("BTC", "Bitcoin", "btc", "Ledger BTC Native SegWit");
    add("ETH", "Ethereum", "eth", "Ledger ETH");
    add("TRX", "Tron", "tron", "Ledger TRX");
    add("USDT", "TRC-20", "tron", "Ledger USDT TRC-20");
    add("USDC", "TRC-20", "tron", "Ledger USDC TRC-20");
    add("SOL", "Solana", "sol", "Ledger SOL");
    add("XRP", "XRP", "xrp", "Ledger XRP");
    add("BNB", "BNB Chain", "bnb", "Ledger BNB Chain");
    add("MATIC", "Polygon", "polygon", "Ledger Polygon");
    add("USDT", "Polygon", "polygon", "Ledger USDT Polygon");
    add("USDC", "Polygon", "polygon", "Ledger USDC Polygon");
    add("USDT", "ERC-20", "eth", "Ledger USDT ERC-20");
    add("USDC", "ERC-20", "eth", "Ledger USDC ERC-20");
    add("USDT", "BEP-20", "bnb", "Ledger USDT BEP-20");
    add("USDC", "BEP-20", "bnb", "Ledger USDC BEP-20");
    return rows;
  }

  function importLedgerBulkRows() {
    var ta = document.getElementById("ledger-bulk-addresses");
    var out = document.getElementById("ledger-account-out");
    var rows = ledgerBulkRowsFromText(ta ? ta.value : "");
    if (!rows.length) {
      alert("등록할 주소를 찾지 못했습니다. 예: btc bc1... / tron T... 형식으로 붙여넣어 주세요.");
      return;
    }
    if (!confirm(rows.length + "개 Ledger 자산 항목을 등록할까요? 이미 등록된 항목은 실패로 표시될 수 있습니다.")) return;
    var ok = 0;
    var fail = 0;
    if (out) out.textContent = "일괄 등록 중…";
    rows
      .reduce(function (p, row) {
        return p.then(function () {
          return api("/api/admin/ledger-accounts", {
            method: "POST",
            body: JSON.stringify(row),
          }).then(function (r) {
            if (r.ok) ok += 1;
            else fail += 1;
          });
        });
      }, Promise.resolve())
      .then(function () {
        if (out) out.textContent = "일괄 등록 완료: 성공 " + ok + "개, 실패/중복 " + fail + "개";
        renderLedgerPortfolio();
      });
  }

  function renderFreeCouponTracking() {
    var stEl = document.getElementById("free-coupon-tracking-status");
    var platformEl = document.getElementById("free-coupon-platform");
    var sourceEl = document.getElementById("free-coupon-source-board");
    var qEl = document.getElementById("free-coupon-q");
    var statsEl = document.getElementById("free-coupon-stats");
    var tbody = document.querySelector("#free-coupon-tracking-table tbody");
    if (!tbody || !stEl) return;
    var status = stEl.value || "pending";
    var platform = platformEl ? platformEl.value || "all" : "all";
    var sourceBoard = sourceEl ? sourceEl.value.trim() : "";
    var q = qEl ? qEl.value.trim() : "";
    tbody.innerHTML = "<tr><td colspan='9'>불러오는 중…</td></tr>";
    api(
      "/api/admin/free-coupon-tracking?status=" +
        encodeURIComponent(status) +
        "&platform=" +
        encodeURIComponent(platform) +
        "&source_board=" +
        encodeURIComponent(sourceBoard) +
        "&q=" +
        encodeURIComponent(q) +
        "&limit=150",
      { method: "GET" }
    ).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML =
          "<tr><td colspan='9'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      var stats = x.j.stats || {};
      if (statsEl) {
        var total = Number(stats.total || 0);
        var confirmed = Number(stats.confirmed || 0);
        var rate = total ? Math.round((confirmed / total) * 1000) / 10 : 0;
        statsEl.innerHTML =
          '<div class="admin-stats admin-coupon-stats">' +
          '<div class="admin-stat"><p class="label">전체 항목</p><p class="value">' +
          total +
          "</p></div>" +
          '<div class="admin-stat"><p class="label">확인 대기</p><p class="value">' +
          Number(stats.pending || 0) +
          "</p></div>" +
          '<div class="admin-stat"><p class="label">확인 완료</p><p class="value">' +
          confirmed +
          "</p></div>" +
          '<div class="admin-stat"><p class="label">확인율</p><p class="value">' +
          rate +
          "%</p></div>" +
          "</div>";
      }
      var posts = x.j.posts || [];
      tbody.innerHTML = "";
      if (!posts.length) {
        tbody.innerHTML = "<tr><td colspan='9' class='admin-note'>항목 없음</td></tr>";
        return;
      }
      posts.forEach(function (p) {
        var id = p._id ? String(p._id) : "";
        var idShort = id.slice(-8);
        var fullBody =
          p.content != null && p.content !== undefined
            ? String(p.content)
            : String(p.content_preview || "");
        var rawTitle = String(p.title || "");
        var slots = parseMt5TrvYeongmunDelimiters(rawTitle, fullBody);
        var prevShort = fullBody.replace(/\s+/g, " ").trim();
        if (prevShort.length > 280) prevShort = prevShort.slice(0, 280) + "…";
        var prev = prevShort.replace(/</g, "&lt;");
        var title = rawTitle.replace(/</g, "&lt;");
        var srcBoard = String(p.coupon_source_board || "").replace(/</g, "&lt;");
        var memo = String(p.author_id || "").replace(/</g, "&lt;");
        var created = p.created_at ? new Date(p.created_at).toLocaleString("ko-KR") : "";
        var dv = p.free_coupon_admin_verified === true;
        var verifiedAt =
          dv && p.free_coupon_admin_verified_at
            ? new Date(p.free_coupon_admin_verified_at).toLocaleString("ko-KR")
            : "";
        var byWho = dv ? String(p.free_coupon_admin_verified_by || "").replace(/</g, "&lt;") : "";

        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><code style='font-size:0.7rem'>" +
          escLt(idShort) +
          "</code></td>" +
          "<td style='max-width:8rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.mt5) +
          "</td>" +
          "<td style='max-width:8rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.trv) +
          "</td>" +
          "<td style='max-width:8rem;font-size:0.71rem;word-break:break-word'>" +
          escLt(slots.yeongungmun) +
          "</td>" +
          "<td style='max-width:9rem;font-size:0.72rem;word-break:break-word'><code style='font-size:0.68rem'>" +
          (srcBoard || "—") +
          "</code></td>" +
          "<td style='max-width:200px;font-size:0.78rem'><strong>" +
          title +
          "</strong><br/><span style='opacity:0.9'>" +
          prev +
          "</span></td>" +
          "<td style='font-size:0.72rem'>" +
          memo +
          "</td>" +
          "<td style='font-size:0.72rem'>" +
          created +
          "</td>";

        var tdAct = document.createElement("td");
        if (dv) {
          tdAct.innerHTML =
            "<span class='admin-note'>확인 완료</span><br/><small style='font-size:0.68rem'>" +
            (verifiedAt ? verifiedAt + " · " + byWho : byWho ? byWho : "") +
            "</small>";
        } else {
          var noteIn = document.createElement("input");
          noteIn.type = "text";
          noteIn.className = "user-note";
          noteIn.placeholder = "관리 메모(선택)";
          noteIn.style.minWidth = "7rem";
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn--small";
          btn.textContent = "관리 확인 완료";
          btn.addEventListener("click", function () {
            if (
              !confirm(
                "무료 쿠폰 관리 건으로 확인 처리할까요? (게시글 검토 탭 자동발급·쿠폰 코드 발급과는 별도입니다.)"
              )
            )
              return;
            api("/api/admin/free-coupon-tracking/" + encodeURIComponent(id) + "/confirm", {
              method: "POST",
              body: JSON.stringify({ free_coupon_note: noteIn.value || "" }),
            }).then(function (r) {
              if (!r.ok) {
                alert(r.j.error || "실패");
                return;
              }
              alert("처리되었습니다.");
              renderFreeCouponTracking();
            });
          });
          tdAct.appendChild(noteIn);
          tdAct.appendChild(document.createElement("br"));
          tdAct.appendChild(btn);
        }
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
    });
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function renderBusinessOrgs() {
    var tbody = document.querySelector("#admin-business-orgs-table tbody");
    var out = document.getElementById("admin-business-create-out");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6'>불러오는 중…</td></tr>";
    if (out) out.textContent = "";
    var seatsWrap = document.getElementById("admin-business-seats-wrap");
    var seatsBody = document.getElementById("admin-business-seats-body");
    if (seatsWrap) seatsWrap.style.display = "none";
    if (seatsBody) seatsBody.innerHTML = "";
    api("/api/admin/business/orgs", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML = "<tr><td colspan='6'>" + escAttr(x.j.error) + "</td></tr>";
        return;
      }
      var orgs = x.j.orgs || [];
      tbody.innerHTML = "";
      orgs.forEach(function (o) {
        var id = o._id ? String(o._id) : "";
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><code style='font-size:0.7rem'>" +
          id.slice(-8) +
          "</code></td>" +
          "<td style='font-size:0.75rem'>" +
          escAttr(o.owner_email) +
          "</td>" +
          "<td style='max-width:10rem;word-break:break-all'>" +
          escAttr(o.org_name) +
          "</td>" +
          "<td><code style='font-size:0.7rem'>" +
          escAttr(o.plan_sku) +
          "</code><br><small style='color:#5c4d3f'>" +
          escAttr(o.market_scope) +
          "</small></td>" +
          "<td>" +
          (o.seats_filled != null ? o.seats_filled : 0) +
          " / " +
          (o.seats_total != null ? o.seats_total : 0) +
          "</td>" +
          "<td><button type='button' class='btn btn--small' data-biz-open='" +
          id.replace(/"/g, "&quot;") +
          "'>좌석·ID</button></td>";
        tbody.appendChild(tr);
        var btn = tr.querySelector("[data-biz-open]");
        if (btn)
          btn.addEventListener("click", function () {
            loadBusinessSeats(id);
          });
      });
      if (orgs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6'>조직 없음 (API로만 생성한 경우)</td></tr>";
      }
    });
  }

  function loadBusinessSeats(orgId) {
    var wrap = document.getElementById("admin-business-seats-wrap");
    var bodyEl = document.getElementById("admin-business-seats-body");
    var title = document.getElementById("admin-business-seats-title");
    if (!wrap || !bodyEl) return;
    wrap.style.display = "block";
    if (title) title.textContent = "좌석 편집 (불러오는 중…)";
    bodyEl.innerHTML = "<p class='admin-note'>불러오는 중…</p>";
    api("/api/admin/business/orgs/" + encodeURIComponent(orgId) + "/seats", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        bodyEl.innerHTML = "<p class='admin-note'>오류: " + escAttr(x.j.error) + "</p>";
        return;
      }
      var org = x.j.org || {};
      var maxIds = org.max_ids != null ? org.max_ids : 0;
      if (title) {
        var label = (org.org_name && String(org.org_name)) || org.owner_email || "조직";
        title.textContent = "좌석: " + label + " (최대 " + maxIds + "석) · " + (org.owner_email || "");
      }
      var seats = x.j.seats || [];
      bodyEl.innerHTML = "";
      var hint = document.createElement("p");
      hint.className = "admin-note";
      hint.innerHTML =
        "좌석 1칸에 <strong>TRV(TradingView) 사용자명</strong>·<strong>MT5 계정 + 서버</strong>를 기입하세요. " +
        "기타(assigned_id)는 키움/내부용 한 줄이 필요할 때 씁니다. 저장 시(체크 시) " +
        "<code>BUSINESS_SEAT_NOTIFY_EMAIL</code> 또는 <code>ADMIN_EMAIL</code>로 변경 요약이 메일로 갈 수 있습니다(SMTP).";
      bodyEl.appendChild(hint);
      if (seats.length === 0) {
        var p = document.createElement("p");
        p.className = "admin-note";
        p.textContent = "좌석이 없습니다.";
        bodyEl.appendChild(p);
        return;
      }
      var table = document.createElement("table");
      table.className = "admin-table";
      var thead = document.createElement("thead");
      thead.innerHTML =
        "<tr><th>#</th><th>TRV 사용자명</th><th>MT5 로그인</th><th>MT5 서버</th><th>기타(assigned_id)</th><th>메모</th><th>알림</th><th></th></tr>";
      table.appendChild(thead);
      var tbod = document.createElement("tbody");
      seats.forEach(function (s) {
        var si = s.seat_index;
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><strong>#" +
          si +
          "</strong><br><small style='color:#6a5a4a' title='최초 ID 배정'>assigned_at: " +
          (s.assigned_at
            ? new Date(s.assigned_at).toLocaleString("ko-KR")
            : "—") +
          "</small></td>" +
          "<td><input type='text' class='biz-inp biz-trv' style='min-width:6.5rem;max-width:10rem' /></td>" +
          "<td><input type='text' class='biz-inp biz-mt5' style='min-width:5.5rem;max-width:8rem' placeholder='123456' /></td>" +
          "<td><input type='text' class='biz-inp biz-srv' style='min-width:5.5rem;max-width:9rem' placeholder='서버' /></td>" +
          "<td><input type='text' class='biz-inp biz-aid' style='min-width:4rem' /></td>" +
          "<td><input type='text' class='biz-inp biz-note' style='min-width:5rem' /></td>" +
          "<td><label style='font-size:0.72rem;white-space:nowrap'><input type='checkbox' class='biz-notify' checked /> 나에게</label></td>" +
          "<td><button type='button' class='btn btn--small biz-save'>저장</button></td>";
        tr.querySelector(".biz-trv").value = s.trv_username || "";
        tr.querySelector(".biz-mt5").value = s.mt5_login || "";
        tr.querySelector(".biz-srv").value = s.mt5_server || "";
        tr.querySelector(".biz-aid").value = s.assigned_id || "";
        tr.querySelector(".biz-note").value = s.note || "";
        (function (seatIndex, trEl) {
          trEl.querySelector(".biz-save").addEventListener("click", function () {
            var notify = trEl.querySelector(".biz-notify");
            api(
              "/api/admin/business/orgs/" + encodeURIComponent(orgId) + "/seats/" + seatIndex,
              {
                method: "PATCH",
                body: JSON.stringify({
                  trv_username: trEl.querySelector(".biz-trv").value,
                  mt5_login: trEl.querySelector(".biz-mt5").value,
                  mt5_server: trEl.querySelector(".biz-srv").value,
                  assigned_id: trEl.querySelector(".biz-aid").value,
                  note: trEl.querySelector(".biz-note").value,
                  notify_admin: notify && notify.checked,
                }),
              }
            ).then(function (r) {
              var msg = r.ok
                ? "저장됨" +
                  (r.j.admin_notified
                    ? " · 알림 메일 발송"
                    : r.j.notify_skipped
                    ? " · 알림 생략(SMTP·수신자)"
                    : "")
                : r.j.error || "실패";
              alert(msg);
              if (r.ok) {
                loadBusinessSeats(orgId);
                renderBusinessOrgs();
              }
            });
          });
        })(si, tr);
        tbod.appendChild(tr);
      });
      table.appendChild(tbod);
      var tableWrap = document.createElement("div");
      tableWrap.className = "admin-table-wrap";
      tableWrap.appendChild(table);
      bodyEl.appendChild(tableWrap);
    });
  }

  function renderTickets() {
    var tbody = document.querySelector("#admin-tickets-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='8'>불러오는 중…</td></tr>";
    var statusFilter = (document.getElementById("admin-ticket-status-filter") || {}).value || "openish";
    var categoryFilter = ((document.getElementById("admin-ticket-category-filter") || {}).value || "").trim();
    api(
      "/api/admin/tickets?status=" +
        encodeURIComponent(statusFilter) +
        "&category=" +
        encodeURIComponent(categoryFilter),
      { method: "GET" }
    ).then(function (x) {
      if (!x.ok) {
        tbody.innerHTML =
          "<tr><td colspan='8'>" + (x.j.error || JSON.stringify(x.j)) + "</td></tr>";
        return;
      }
      var list = x.j.tickets || [];
      tbody.innerHTML = "";
      list.forEach(function (t) {
        var id = t._id ? String(t._id) : "";
        var tr = document.createElement("tr");
        var dt = t.created_at ? new Date(t.created_at).toLocaleString("ko-KR") : "";
        var b = t.body || "";
        tr.innerHTML =
          "<td><code style='font-size:0.7rem'>" +
          id.slice(-8) +
          "</code></td>" +
          "<td style='font-size:0.75rem'>" +
          (t.email || "") +
          "</td>" +
          "<td>" +
          (t.category || "") +
          "</td>" +
          "<td>" +
          (t.subject || "").replace(/</g, "&lt;") +
          "</td>" +
          "<td></td>" +
          "<td></td>" +
          "<td style='white-space:nowrap;font-size:0.72rem'>" +
          dt +
          "</td>" +
          "<td></td>";
        var bodyDetails = document.createElement("details");
        bodyDetails.className = "admin-ticket-body";
        bodyDetails.open = true;
        var bodySummary = document.createElement("summary");
        bodySummary.textContent = b.length > 90 ? b.slice(0, 90) + "..." : b || "(내용 없음)";
        var bodyFull = document.createElement("pre");
        bodyFull.textContent = b || "(내용 없음)";
        bodyDetails.appendChild(bodySummary);
        bodyDetails.appendChild(bodyFull);
        tr.cells[4].appendChild(bodyDetails);

        var stSel = document.createElement("select");
        stSel.className = "admin-ticket-status";
        stSel.style.fontSize = "0.72rem";
        stSel.style.maxWidth = "10rem";
        [
          ["auto_replied", "자동응답(미분류)"],
          ["open", "미해결"],
          ["in_progress", "진행중"],
          ["answered", "답변완료"],
          ["resolved", "처리완료"],
          ["closed", "종료"],
        ].forEach(function (pair) {
          var opt = document.createElement("option");
          opt.value = pair[0];
          opt.textContent = pair[1];
          stSel.appendChild(opt);
        });
        var curSt = String(t.status || "auto_replied");
        if (!stSel.querySelector('option[value="' + curSt + '"]')) {
          var o = document.createElement("option");
          o.value = curSt;
          o.textContent = curSt + "(레거시)";
          stSel.appendChild(o);
        }
        stSel.value = curSt;

        var ta = document.createElement("textarea");
        ta.className = "admin-ticket-reply";
        ta.rows = 4;
        ta.placeholder = "관리자 회신 또는 내부 처리 메모";
        ta.value = t.admin_reply || "";
        var lastReply = document.createElement("p");
        lastReply.className = "admin-ticket-meta";
        lastReply.textContent = t.admin_reply
          ? "저장된 회신 있음" + (t.email_admin_sent ? " · 이메일 발송됨" : "")
          : "아직 관리자 회신 없음";
        var notify = document.createElement("label");
        notify.style.fontSize = "0.72rem";
        notify.innerHTML =
          '<input type="checkbox" class="admin-ticket-notify" /> 회원 이메일로 발송 (SMTP 설정 시)';

        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn--small";
        save.textContent = "저장";
        save.addEventListener("click", function () {
          var n = tr.querySelector(".admin-ticket-notify");
          var sts = tr.querySelector(".admin-ticket-status");
          api("/api/admin/tickets/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({
              admin_reply: ta.value,
              status: sts ? sts.value : "answered",
              notify_email: n && n.checked,
            }),
          }).then(function (r) {
            alert(r.ok ? "저장됨" : r.j.error || "실패");
            if (r.ok) renderTickets();
          });
        });

        tr.cells[5].appendChild(stSel);
        var cell = tr.cells[7];
        cell.appendChild(lastReply);
        cell.appendChild(ta);
        cell.appendChild(document.createElement("br"));
        cell.appendChild(notify);
        cell.appendChild(document.createElement("br"));
        cell.appendChild(save);
        tbody.appendChild(tr);
      });
      if (list.length === 0) {
        tbody.innerHTML = "<tr><td colspan='8'>티켓 없음</td></tr>";
      }
    });
  }

  function showApp(isVisible) {
    var login = document.getElementById("admin-login-section");
    var app = document.getElementById("admin-app-section");
    show(login, !isVisible);
    show(app, isVisible);
  }

  function logout() {
    setToken("");
    showApp(false);
  }

  function trySession() {
    var t = getToken();
    if (!t) {
      showApp(false);
      return;
    }
    api("/api/admin/me", { method: "GET" }).then(function (x) {
      if (!x.ok) {
        setToken("");
        showApp(false);
        return;
      }
      var who = document.getElementById("admin-who");
      if (who) who.textContent = x.j.email || "";
      showApp(true);
      goTab("dash");
    });
  }

  document.getElementById("admin-login-form")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setErr("");
    var email = document.getElementById("admin-email").value;
    var password = document.getElementById("admin-password").value;
    api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (x) {
      if (!x.ok) {
        setErr(x.j.error || "로그인 실패");
        return;
      }
      setToken(x.j.token);
      trySession();
    });
  });

  document.getElementById("admin-logout")?.addEventListener("click", function () {
    logout();
  });

  document.querySelectorAll(".admin-tabs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goTab(btn.getAttribute("data-tab"));
    });
  });

  document.getElementById("admin-home-reload")?.addEventListener("click", function () {
    renderHomeEditor();
  });
  document.getElementById("admin-home-save")?.addEventListener("click", function () {
    saveHomeHtml();
  });
  document.getElementById("admin-home-refresh-preview")?.addEventListener("click", function () {
    updateHomePreview();
  });
  document.getElementById("admin-home-html")?.addEventListener("input", function () {
    updateHomePreview();
  });
  document.getElementById("admin-refunds-reload")?.addEventListener("click", function () {
    renderRefunds();
  });
  ["admin-refunds-status", "admin-refunds-currency"].forEach(function (id) {
    document.getElementById(id)?.addEventListener("change", function () {
      renderRefunds();
    });
  });
  document.getElementById("admin-refunds-q")?.addEventListener("input", function () {
    renderRefunds();
  });

  document.getElementById("admin-business-reload")?.addEventListener("click", function () {
    renderBusinessOrgs();
  });
  document.getElementById("ledger-reload")?.addEventListener("click", function () {
    renderLedgerPortfolio();
  });
  document.getElementById("ledger-refresh")?.addEventListener("click", function () {
    var out = document.getElementById("ledger-account-out");
      if (out) out.textContent = "체인 잔고·가격·환율 조회 후 스냅샷 저장 중…";
    api("/api/admin/ledger-portfolio/refresh", {
      method: "POST",
      body: JSON.stringify({
        usd_krw: document.getElementById("ledger-usd-krw")?.value || 1350,
        note: document.getElementById("ledger-snapshot-note")?.value || "",
      }),
    }).then(function (r) {
      if (out) out.textContent = r.ok ? "스냅샷 저장됨. 지원 체인은 자동조회, 실패/미지원 자산은 수동값으로 반영됐습니다." : r.j.error || "실패";
      if (r.ok) renderLedgerPortfolio();
    });
  });
  document.getElementById("ledger-add-account")?.addEventListener("click", function () {
    var out = document.getElementById("ledger-account-out");
    var symbol = document.getElementById("ledger-symbol")?.value || "";
    var network = document.getElementById("ledger-network")?.value || "";
    var addr = document.getElementById("ledger-address")?.value || "";
    if (!String(symbol).trim() || !String(network).trim() || !String(addr).trim()) {
      alert("코인, 네트워크, 주소 또는 xpub을 입력하세요.");
      return;
    }
    if (out) out.textContent = "등록 중…";
    api("/api/admin/ledger-accounts", {
      method: "POST",
      body: JSON.stringify({
        label: document.getElementById("ledger-label")?.value || "",
        asset_symbol: symbol,
        network: network,
        address_or_xpub: addr,
        amount: document.getElementById("ledger-amount")?.value || 0,
        price_usdt: document.getElementById("ledger-price-usdt")?.value || 0,
        exclude_from_total: !!document.getElementById("ledger-exclude")?.checked,
      }),
    }).then(function (r) {
      if (!r.ok) {
        if (out) out.textContent = r.j.error || "실패";
        return;
      }
      if (out) out.textContent = "등록됨. 스냅샷 저장 시 지원 체인은 자동조회하고, 미지원/실패 자산은 수동값으로 평가합니다.";
      ["ledger-label", "ledger-symbol", "ledger-network", "ledger-address", "ledger-amount", "ledger-price-usdt"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
      var ex = document.getElementById("ledger-exclude");
      if (ex) ex.checked = false;
      renderLedgerPortfolio();
    });
  });
  document.getElementById("ledger-bulk-import")?.addEventListener("click", function () {
    importLedgerBulkRows();
  });
  document.getElementById("admin-business-create")?.addEventListener("click", function () {
    var out = document.getElementById("admin-business-create-out");
    var ownerEl = document.getElementById("biz-owner");
    var owner = ownerEl ? String(ownerEl.value || "").trim() : "";
    if (!owner) {
      alert("owner 이메일(이미 가입된 회원)을 입력하세요.");
      return;
    }
    if (out) out.textContent = "생성 중…";
    api("/api/admin/business/orgs", {
      method: "POST",
      body: JSON.stringify({
        owner_email: owner,
        plan_sku: document.getElementById("biz-plan").value,
        org_name: document.getElementById("biz-orgname").value.trim(),
        market_scope: document.getElementById("biz-scope").value,
        billing_mode: document.getElementById("biz-bill").value,
      }),
    }).then(function (r) {
      if (!r.ok) {
        if (out) out.textContent = r.j.error || "실패";
        alert(r.j.error || "실패");
        return;
      }
      var wc = r.j.welcome_coupon;
      var w =
        wc && wc.issued === false
          ? (wc.skipped || wc.error || "쿠폰 생략")
          : wc && wc.coupon_code
          ? "웰컴쿠폰: " + wc.coupon_code
          : "웰컴쿠폰 발급 확인(응답)";
      if (out) {
        out.textContent =
          "생성됨. 좌석 " + (r.j.seat_count || 0) + "석. " + w;
      }
      renderBusinessOrgs();
    });
  });

  function syncCpKindUi() {
    var kind = document.getElementById("cp-kind");
    var wrap = document.getElementById("cp-term-wrap");
    if (!kind || !wrap) return;
    var hideTerm = kind.value === "promo_magictrading_1m" || kind.value === "promo_premium_1m";
    wrap.style.display = hideTerm ? "none" : "";
  }
  document.getElementById("cp-kind")?.addEventListener("change", syncCpKindUi);
  syncCpKindUi();

  ["cp-filter-status", "cp-filter-platform", "cp-filter-kind"].forEach(function (id) {
    document.getElementById(id)?.addEventListener("change", function () {
      renderCoupons();
    });
  });
  document.getElementById("cp-filter-q")?.addEventListener("input", function () {
    renderCoupons();
  });
  document.getElementById("cp-filter-reload")?.addEventListener("click", function () {
    renderCoupons();
  });

  document.getElementById("cp-issue")?.addEventListener("click", function () {
    var kindEl = document.getElementById("cp-kind");
    var rawKind = kindEl && kindEl.value;
    var coupon_kind =
      rawKind === "promo_magictrading_1m" || rawKind === "promo_premium_1m"
          ? "promo_magictrading_1m"
          : "duration";
    var term = Number(document.getElementById("cp-term").value);
    var platformEl = document.getElementById("cp-platform");
    var target_platform = platformEl && platformEl.value ? platformEl.value : "all";
    var send_email = document.getElementById("cp-email").value.trim();
    var telegram_chat_id = document.getElementById("cp-tg").value.trim();
    var note = document.getElementById("cp-note").value.trim();
    var out = document.getElementById("cp-issue-result");
    if (out) out.textContent = "발급 중…";
    var body = {
      coupon_kind: coupon_kind,
      target_platform: target_platform,
      send_email: send_email || undefined,
      telegram_chat_id: telegram_chat_id || undefined,
      note: note || undefined,
    };
    if (coupon_kind === "duration") body.term_months = term;
    api("/api/admin/coupons/issue", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(function (x) {
      if (!x.ok) {
        if (out) out.textContent = x.j.error || "실패";
        return;
      }
      var c = x.j.coupon || {};
      if (out)
        out.textContent =
          "발급됨: " +
          (c.code || "") +
          " (이메일·텔레그램 발송 결과는 서버 로그·notify 필드 참고)";
      renderCoupons();
    });
  });

  document.getElementById("post-review-reload")?.addEventListener("click", function () {
    renderPostReviews();
  });
  document.getElementById("post-review-status")?.addEventListener("change", function () {
    renderPostReviews();
  });
  document.getElementById("post-review-category")?.addEventListener("change", function () {
    renderPostReviews();
  });

  DEPOSIT_CHANNELS.forEach(function (ch) {
    document.getElementById("deposit-" + ch + "-reload")?.addEventListener("click", function () {
      renderDepositChannel(ch);
      renderDepositSummary();
    });
    document.getElementById("deposit-" + ch + "-status")?.addEventListener("change", function () {
      renderDepositChannel(ch);
      renderDepositSummary();
    });
    document.getElementById("deposit-" + ch + "-platform")?.addEventListener("change", function () {
      renderDepositChannel(ch);
    });
    document.getElementById("deposit-" + ch + "-currency")?.addEventListener("change", function () {
      renderDepositChannel(ch);
    });
    document.getElementById("deposit-" + ch + "-q")?.addEventListener("input", function () {
      renderDepositChannel(ch);
    });
  });
  document.getElementById("deposit-summary-reload")?.addEventListener("click", function () {
    renderDepositSummary();
  });
  document.getElementById("deposit-summary-days")?.addEventListener("change", function () {
    renderDepositSummary();
  });

  document.getElementById("free-coupon-reload")?.addEventListener("click", function () {
    renderFreeCouponTracking();
  });
  document.getElementById("free-coupon-tracking-status")?.addEventListener("change", function () {
    renderFreeCouponTracking();
  });
  ["free-coupon-platform", "free-coupon-source-board", "free-coupon-q"].forEach(function (id) {
    document.getElementById(id)?.addEventListener("input", function () {
      renderFreeCouponTracking();
    });
    document.getElementById(id)?.addEventListener("change", function () {
      renderFreeCouponTracking();
    });
  });

  document.getElementById("admin-ticket-reload")?.addEventListener("click", function () {
    renderTickets();
  });
  document.getElementById("admin-ticket-status-filter")?.addEventListener("change", function () {
    renderTickets();
  });
  document.getElementById("admin-ticket-category-filter")?.addEventListener("input", function () {
    renderTickets();
  });

  document.getElementById("admin-user-search")?.addEventListener("input", function () {
    renderUsersTable(adminUsersCache);
  });

  document.getElementById("admin-add-user")?.addEventListener("click", function () {
    var email = document.getElementById("new-user-email").value.trim();
    var role = document.getElementById("new-user-role").value;
    if (!email) {
      alert("이메일을 입력하세요.");
      return;
    }
    api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: email, role: role, status: "active", note: "" }),
    }).then(function (x) {
      alert(x.ok ? "추가됨" : x.j.error || "실패");
      if (x.ok) {
        document.getElementById("new-user-email").value = "";
        renderUsers();
      }
    });
  });

  trySession();
})();
