(function () {
  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return (m && m.content) || "https://magicindicatorglobal.com";
  }

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function insertAtCursor(textarea, text) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var v = textarea.value;
    textarea.value = v.slice(0, start) + text + v.slice(end);
    var pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
  }

  function fmtDate(d) {
    if (!d) return "";
    try {
      var x = new Date(d);
      if (isNaN(x.getTime())) return "";
      return (
        x.getFullYear() +
        "." +
        String(x.getMonth() + 1).padStart(2, "0") +
        "." +
        String(x.getDate()).padStart(2, "0")
      );
    } catch (e) {
      return "";
    }
  }

  function mount(el) {
    if (!window.MagicAuth) {
      el.textContent = "먼저 magic-auth.js를 불러와 주세요.";
      return;
    }
    var API = apiBase();
    var category = el.getAttribute("data-category") || "general";
    var title = el.getAttribute("data-title") || category;
    var compact = el.getAttribute("data-compact") === "1";

    el.className = "magic-board" + (compact ? " magic-board--compact" : "");
    el.innerHTML = "";
    el.appendChild(h("div", "magic-board__head", title));

    var authBox = h("div", "magic-board__auth");
    authBox.innerHTML =
      '<label>로그인 이메일 <input type="email" class="magic-email" placeholder="나의 이메일" /></label>' +
      '<label>게시판 권한 <select class="magic-role">' +
      '<option value="guest">방문 (guest)</option>' +
      '<option value="free">무료 회원 (free)</option>' +
      '<option value="trial">체험 (trial)</option>' +
      '<option value="sub">구독 (sub)</option>' +
      '<option value="vip">커뮤니티 VIP</option>' +
      '<option value="admin">운영 (admin)</option>' +
      "</select></label>" +
      '<button type="button" class="magic-save-auth">이대로 적용</button>';
    el.appendChild(authBox);

    var msgEl = h("div", "magic-board__msg");
    msgEl.style.display = "none";
    el.appendChild(msgEl);

    var highlightsEl = h("div", "magic-board__highlights");
    el.appendChild(highlightsEl);

    var listEl = h("ul", "magic-board__list");
    el.appendChild(listEl);

    var compose = h("div", "magic-board__compose");
    compose.innerHTML =
      '<label>제목</label>' +
      '<input type="text" class="magic-title" placeholder="짧게 적어 주세요" />' +
      '<label>내용 — 사진은 파일로 넣거나 붙여넣기</label>' +
      '<div class="magic-board__tools">' +
      '<input type="file" class="magic-file" accept="image/*" />' +
      '<button type="button" class="magic-btn--ghost magic-paste-hint">이미지는 복사한 뒤 아래 칸을 누르고 붙여넣기</button>' +
      "</div>" +
      '<textarea class="magic-body" placeholder="나누고 싶은 이야기 (HTML 가능)"></textarea>' +
      '<button type="button" class="magic-btn magic-submit">올리기</button>' +
      '<p class="magic-board__hint">많이 읽힌 글·답글이 많은 글이 위에 요약돼요. 글마다 답글을 달 수 있어요.</p>';
    el.appendChild(compose);

    var emailIn = authBox.querySelector(".magic-email");
    var roleIn = authBox.querySelector(".magic-role");
    var saveBtn = authBox.querySelector(".magic-save-auth");
    var titleIn = compose.querySelector(".magic-title");
    var bodyTa = compose.querySelector(".magic-body");
    var fileIn = compose.querySelector(".magic-file");

    function syncAuthFromStorage() {
      var a = MagicAuth.get();
      emailIn.value = a.email;
      roleIn.value = a.role;
    }
    syncAuthFromStorage();

    saveBtn.addEventListener("click", function () {
      MagicAuth.set(emailIn.value, roleIn.value);
      load();
    });

    function userHeaders() {
      MagicAuth.set(emailIn.value, roleIn.value);
      var h = {
        "X-User-Id": MagicAuth.get().email,
        "X-User-Role": MagicAuth.get().role,
      };
      if (window.HappyUX && HappyUX.getVisitorId) h["X-Visitor-Id"] = HappyUX.getVisitorId();
      return h;
    }
    function postHeaders() {
      return Object.assign({ "Content-Type": "application/json" }, userHeaders());
    }

    function uploadImage(file) {
      var fd = new FormData();
      fd.append("file", file);
      return fetch(API + "/api/upload", { method: "POST", body: fd })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) throw new Error(x.j.error || "upload failed");
          return x.j.url;
        });
    }

    bodyTa.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          e.preventDefault();
          var f = items[i].getAsFile();
          if (!f) return;
          uploadImage(f).then(function (url) {
            insertAtCursor(
              bodyTa,
              '\n<img src="' + url + '" alt="" style="max-width:100%;height:auto;border-radius:6px" />\n'
            );
          });
          return;
        }
      }
    });

    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      uploadImage(f).then(function (url) {
        insertAtCursor(
          bodyTa,
          '\n<img src="' + url + '" alt="" style="max-width:100%;height:auto;border-radius:6px" />\n'
        );
        fileIn.value = "";
      });
    });

    function renderHighlights(topViews, topComments) {
      highlightsEl.innerHTML = "";
      var tv = topViews || [];
      var tc = topComments || [];
      if (tv.length === 0 && tc.length === 0) {
        highlightsEl.style.display = "none";
        return;
      }
      highlightsEl.style.display = "block";

      function miniCard(p, sub) {
        var card = h("div", "magic-board__hl-card");
        var tt = h("p", "magic-board__hl-card-title", (p.title || "(제목 없음)") + "");
        var mm = h("p", "magic-board__hl-card-meta", sub);
        card.appendChild(tt);
        card.appendChild(mm);
        return card;
      }

      if (tv.length) {
        var sec = h("div", "magic-board__hl-block");
        sec.appendChild(h("div", "magic-board__hl-label", "많이 본 글"));
        var row = h("div", "magic-board__hl-row");
        tv.forEach(function (p) {
          var v = p.views != null ? p.views : 0;
          row.appendChild(
            miniCard(p, "조회 " + v + " · 댓글 " + (p.comment_count != null ? p.comment_count : 0))
          );
        });
        sec.appendChild(row);
        highlightsEl.appendChild(sec);
      }

      if (tc.length) {
        var sec2 = h("div", "magic-board__hl-block");
        sec2.appendChild(h("div", "magic-board__hl-label", "댓글이 많은 글"));
        var row2 = h("div", "magic-board__hl-row");
        tc.forEach(function (p) {
          var v = p.views != null ? p.views : 0;
          var cc = p.comment_count != null ? p.comment_count : 0;
          row2.appendChild(miniCard(p, "댓글 " + cc + " · 조회 " + v));
        });
        sec2.appendChild(row2);
        highlightsEl.appendChild(sec2);
      }
    }

    function openThread(li, p, threadEl, statsEl, toggleBtn) {
      var pid = p._id ? String(p._id) : "";
      if (!pid) return;

      function setStats(views, cc) {
        if (statsEl)
          statsEl.textContent =
            "조회 " + (views != null ? views : 0) + " · 댓글 " + (cc != null ? cc : 0);
      }

      var pView = Promise.resolve();
      if (!threadEl.dataset.viewSent) {
        pView = fetch(API + "/api/posts/" + encodeURIComponent(pid) + "/view", {
          method: "POST",
          headers: userHeaders(),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (x && x.ok) threadEl.dataset.viewSent = "1";
            if (x && x.ok && x.j) setStats(x.j.views, x.j.comment_count);
            return x;
          });
      }

      pView
        .then(function () {
          return fetch(API + "/api/posts/" + encodeURIComponent(pid) + "/comments", {
            headers: userHeaders(),
            cache: "no-store",
          });
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          threadEl.innerHTML = "";
          var ul = h("ul", "magic-board__reply-list");
          (data.comments || []).forEach(function (c) {
            var liC = h("li", "magic-board__reply-item");
            liC.appendChild(
              h(
                "div",
                "magic-board__reply-meta",
                (c.author_id || "") + " · " + fmtDate(c.created_at)
              )
            );
            var body = h("div", "magic-board__reply-body");
            body.innerHTML = c.content || "";
            liC.appendChild(body);
            ul.appendChild(liC);
          });
          threadEl.appendChild(ul);

          if (data.canComment) {
            var ta = h("textarea", "magic-board__reply-input");
            ta.placeholder = "따뜻한 말 한마디";
            ta.rows = 2;
            var send = h("button", "magic-btn magic-btn--small", "답 남기기");
            send.type = "button";
            send.addEventListener("click", function () {
              var txt = (ta.value || "").trim();
              if (!txt) {
                alert("내용을 한 줄이라도 적어 주세요.");
                return;
              }
              fetch(API + "/api/posts/" + encodeURIComponent(pid) + "/comments", {
                method: "POST",
                headers: postHeaders(),
                body: JSON.stringify({
                  content: txt,
                  author_id: MagicAuth.get().email,
                }),
              })
                .then(function (r) {
                  return r.json().then(function (j) {
                    return { ok: r.ok, j: j };
                  });
                })
                .then(function (x) {
                  if (!x.ok) {
                    alert(x.j.error || JSON.stringify(x.j));
                    return;
                  }
                  ta.value = "";
                  load();
                });
            });
            threadEl.appendChild(ta);
            threadEl.appendChild(send);
          } else {
            threadEl.appendChild(
              h("p", "magic-board__reply-deny", "이 구역에는 아직 답글을 남길 수 없어요.")
            );
          }
        })
        .catch(function (e) {
          threadEl.innerHTML = "";
          threadEl.appendChild(
            h("p", "magic-board__reply-deny", "답글을 불러오지 못했어요. 잠시 후 다시 눌러 주세요. (" + e.message + ")")
          );
        });
    }

    function load() {
      msgEl.style.display = "none";
      listEl.innerHTML = "";
      fetch(API + "/api/posts?category=" + encodeURIComponent(category), {
        headers: userHeaders(),
        cache: "no-store",
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.canRead === false) {
            msgEl.textContent =
              (data.message || "이 구역은 아직 열람할 수 없어요") +
              " (현재 권한: " +
              (data.role || "") +
              ")";
            msgEl.style.display = "block";
            compose.style.display = "none";
            highlightsEl.style.display = "none";
            return;
          }
          compose.style.display = "block";
          var sub = compose.querySelector(".magic-submit");
          if (!data.canWrite) {
            compose.style.opacity = "0.6";
            if (sub) sub.disabled = true;
          } else {
            compose.style.opacity = "1";
            if (sub) sub.disabled = false;
          }
          renderHighlights(data.highlightTopViews, data.highlightTopComments);

          var posts = data.posts || [];
          if (posts.length === 0) {
            listEl.appendChild(
              h(
                "li",
                "magic-board__item",
                '<p class="magic-board__item-meta">아직 글이 없어요. 첫 이야기를 남겨 보시겠어요?</p>'
              )
            );
            return;
          }
          posts.forEach(function (p) {
            var li = h("li", "magic-board__item");
            var t = h("p", "magic-board__item-title");
            t.textContent = p.title || "(제목 없음)";
            li.appendChild(t);

            var b = h("div", "magic-board__item-body");
            b.innerHTML = p.content || "";
            var m = h("div", "magic-board__item-meta");
            m.textContent =
              (p.author_id || "") + " · " + fmtDate(p.created_at) + " · " + (p.category || "");
            li.appendChild(b);
            li.appendChild(m);

            var stats = h("div", "magic-board__item-stats");
            var v0 = p.views != null ? p.views : 0;
            var c0 = p.comment_count != null ? p.comment_count : 0;
            stats.textContent = "조회 " + v0 + " · 댓글 " + c0;

            var toggleBtn = h("button", "magic-btn magic-btn--small magic-btn--ghost", "답글 펼치기");
            toggleBtn.type = "button";
            var threadEl = h("div", "magic-board__thread");
            threadEl.style.display = "none";

            var open = false;
            toggleBtn.addEventListener("click", function () {
              if (!open) {
                threadEl.style.display = "block";
                toggleBtn.textContent = "접기";
                openThread(li, p, threadEl, stats, toggleBtn);
                open = true;
              } else {
                threadEl.style.display = "none";
                threadEl.innerHTML = "";
                delete threadEl.dataset.viewSent;
                toggleBtn.textContent = "답글 펼치기";
                open = false;
              }
            });

            li.appendChild(stats);
            li.appendChild(toggleBtn);
            li.appendChild(threadEl);
            listEl.appendChild(li);
          });
        })
        .catch(function (e) {
          msgEl.textContent = "연결이 끊겼어요. 잠시 후 다시 눌러 주세요. (" + e.message + ")";
          msgEl.style.display = "block";
        });
    }

    compose.querySelector(".magic-submit").addEventListener("click", function () {
      var payload = {
        title: titleIn.value,
        content: bodyTa.value,
        author_id: MagicAuth.get().email,
        category: category,
      };
      if (!payload.title || !payload.content) {
        alert("제목과 내용을 모두 적어 주세요.");
        return;
      }
      fetch(API + "/api/posts", {
        method: "POST",
        headers: postHeaders(),
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            alert(x.j.error || JSON.stringify(x.j));
            return;
          }
          titleIn.value = "";
          bodyTa.value = "";
          load();
        });
    });

    load();
  }

  function run() {
    document.querySelectorAll("[data-magic-board]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
