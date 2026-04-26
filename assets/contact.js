(function () {
  var API =
    (document.querySelector('meta[name="api-base"]') || {}).content || "https://happyinvests.com";

  var catSelect = document.getElementById("ct-category");
  var bugRow = document.getElementById("bug-public-row");
  var form = document.getElementById("contact-form");
  var autoBox = document.getElementById("contact-auto-reply");
  var mailWarn = document.getElementById("contact-mail-warn");
  var bugList = document.getElementById("contact-bug-list");

  function toggleBugRow() {
    if (!catSelect || !bugRow) return;
    bugRow.style.display = catSelect.value === "bug" ? "block" : "none";
  }

  if (catSelect) {
    catSelect.addEventListener("change", toggleBugRow);
  }

  function loadCategories() {
    if (!catSelect) return;
    fetch(API + "/api/tickets/categories", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        catSelect.innerHTML = "";
        (data.categories || []).forEach(function (c) {
          var o = document.createElement("option");
          o.value = c.id;
          o.textContent = c.label;
          if (c.hint) o.title = c.hint;
          catSelect.appendChild(o);
        });
        var mh = document.getElementById("mail-configured-hint");
        if (mh) {
          mh.textContent = data.mailConfigured
            ? "이메일 자동발송이 설정되어 있습니다."
            : "서버에 SMTP가 없으면 자동 메일은 보내지 않고, 아래 화면에만 안내가 표시됩니다.";
        }
        toggleBugRow();
      })
      .catch(function () {
        catSelect.innerHTML = '<option value="general">일반 문의</option>';
      });
  }

  function loadPublicBugs() {
    if (!bugList) return;
    bugList.innerHTML = "<li class='contact-bug-item'>불러오는 중…</li>";
    fetch(API + "/api/tickets/public-bugs", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        bugList.innerHTML = "";
        var bugs = data.bugs || [];
        if (bugs.length === 0) {
          bugList.innerHTML = "<li class='contact-bug-item'>아직 공개된 버그가 없습니다.</li>";
          return;
        }
        bugs.forEach(function (b) {
          var li = document.createElement("li");
          li.className = "contact-bug-item";
          var st = b.status || "";
          var dt = b.created_at ? new Date(b.created_at).toLocaleString("ko-KR") : "";
          li.innerHTML =
            "<strong>" +
            (b.subject || "(제목 없음)").replace(/</g, "&lt;") +
            "</strong>" +
            "<div class='contact-bug-meta'>" +
            dt +
            " · 상태: " +
            st +
            "</div>" +
            "<div>" +
            (b.body_excerpt || "").replace(/</g, "&lt;") +
            "</div>";
          if (b.admin_reply_excerpt) {
            var ar = document.createElement("div");
            ar.className = "contact-bug-reply";
            ar.textContent = "관리자: " + b.admin_reply_excerpt;
            li.appendChild(ar);
          }
          bugList.appendChild(li);
        });
      })
      .catch(function () {
        bugList.innerHTML = "<li class='contact-bug-item'>목록을 불러오지 못했습니다.</li>";
      });
  }

  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = document.getElementById("ct-email").value.trim();
      var category = catSelect ? catSelect.value : "general";
      var subject = document.getElementById("ct-subject").value.trim();
      var body = document.getElementById("ct-body").value.trim();
      var pub = document.getElementById("ct-public-bug");
      var publicBug = pub && pub.checked;

      if (!email || !body) {
        alert("이메일과 내용을 입력하세요.");
        return;
      }

      var payload = {
        email: email,
        category: category,
        subject: subject,
        body: body,
      };
      if (category === "bug") payload.public_bug = publicBug;

      fetch(API + "/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            alert(x.j.error || "접수 실패");
            return;
          }
          if (autoBox) {
            autoBox.textContent = x.j.autoReply || "";
            autoBox.classList.add("is-visible");
          }
          if (mailWarn) {
            if (x.j.emailSent) {
              mailWarn.textContent = "입력하신 이메일로 접수 안내를 보냈습니다.";
              mailWarn.style.color = "#2f6f4f";
            } else if (x.j.mailConfigured === false || x.j.emailSkipped) {
              mailWarn.textContent =
                "메일 서버가 설정되지 않아 이메일은 발송되지 않았습니다. 위 안내를 저장해 두세요.";
              mailWarn.style.color = "#a06030";
            } else if (x.j.emailError) {
              mailWarn.textContent = "메일 발송 오류: " + x.j.emailError;
              mailWarn.style.color = "#a06030";
            } else {
              mailWarn.textContent = "";
            }
          }
          document.getElementById("ct-body").value = "";
          loadPublicBugs();
        })
        .catch(function (e) {
          alert(String(e.message));
        });
    });
  }

  loadCategories();
  loadPublicBugs();
})();
