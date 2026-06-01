/**
 * 약관·정책: 팝업(iframe) + 끝까지 스크롤 후 "동의하고 체크하기" 활성화
 * - data-legal-kind="terms|privacy" → 가입 체크박스(agree_terms / agree_privacy)
 * - data-legal-src + data-legal-title + data-legal-read-token → 결제 등(이벤트만)
 */
(function () {
  var KIND_DEFAULTS = {
    terms: { url: "../legal/terms.html", title: "이용약관", checkId: "agree_terms" },
    privacy: { url: "../legal/privacy.html", title: "개인정보 처리방침", checkId: "agree_privacy" },
  };

  var INJECT_HTML =
    '<div id="reg-legal-modal" class="reg-legal-modal" role="dialog" aria-modal="true" aria-labelledby="reg-legal-modal-title" aria-describedby="reg-legal-modal-hint" hidden>' +
    '<div class="reg-legal-modal__backdrop" data-reg-legal-close tabindex="-1"></div>' +
    '<div class="reg-legal-modal__dialog">' +
    '<div class="reg-legal-modal__head">' +
    '<h3 id="reg-legal-modal-title" class="reg-legal-modal__title">이용약관</h3>' +
    '<button type="button" class="reg-legal-modal__x" data-reg-legal-close aria-label="닫기">&times;</button>' +
    "</div>" +
    '<p id="reg-legal-modal-hint" class="reg-legal-modal__hint">' +
    "내용을 <strong>아래까지 모두 스크롤</strong>하면 하단 <strong>동의하고 체크하기</strong> 버튼이 활성화됩니다. " +
    '<a id="reg-legal-open-tab" class="reg-legal-modal__tablink" href="../legal/terms.html" target="_blank" rel="noopener">새 탭에서 같은 문서 열기</a>' +
    "</p>" +
    '<iframe id="reg-legal-iframe" class="reg-legal-modal__frame" title="약관·정책 문서" src="about:blank"></iframe>' +
    '<div class="reg-legal-modal__foot">' +
    '<button type="button" class="btn reg-legal-modal__confirm" id="reg-legal-modal-confirm" disabled>동의하고 체크하기</button>' +
    '<button type="button" class="reg-legal-modal__cancel" data-reg-legal-close>닫기</button>' +
    "</div></div></div>";

  var modal;
  var iframe;
  var btnConfirm;
  var titleEl;
  var tabLink;
  var scrollCleanup = null;
  /** @type {{ title: string, url: string, checkId: string | null, readToken: string | null } | null} */
  var session = null;
  var globalBound = false;

  function toast(msg) {
    if (window.HappyUX && typeof HappyUX.toast === "function") {
      HappyUX.toast(msg, { duration: 4500 });
    } else {
      alert(msg);
    }
  }

  function ensureModal() {
    modal = document.getElementById("reg-legal-modal");
    if (!modal) {
      var wrap = document.createElement("div");
      wrap.innerHTML = INJECT_HTML;
      document.body.appendChild(wrap.firstElementChild);
      modal = document.getElementById("reg-legal-modal");
    }
    iframe = document.getElementById("reg-legal-iframe");
    btnConfirm = document.getElementById("reg-legal-modal-confirm");
    titleEl = document.getElementById("reg-legal-modal-title");
    tabLink = document.getElementById("reg-legal-open-tab");
    return !!(modal && iframe && btnConfirm);
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    try {
      if (scrollCleanup) scrollCleanup();
    } catch (e) {}
    scrollCleanup = null;
    iframe.src = "about:blank";
    session = null;
  }

  function attachScrollGate() {
    if (scrollCleanup) {
      try {
        scrollCleanup();
      } catch (e) {}
      scrollCleanup = null;
    }
    var win = iframe.contentWindow;
    var doc = iframe.contentDocument;
    if (!win || !doc) {
      btnConfirm.disabled = false;
      return;
    }

    function atBottom() {
      var se = doc.documentElement;
      var body = doc.body;
      var scrollTop =
        win.pageYOffset != null ? win.pageYOffset : Math.max(se.scrollTop || 0, body.scrollTop || 0);
      var scrollHeight = Math.max(body.scrollHeight, se.scrollHeight);
      var clientHeight = win.innerHeight || se.clientHeight;
      return scrollTop + clientHeight >= scrollHeight - 56;
    }

    function sync() {
      if (atBottom()) btnConfirm.disabled = false;
    }

    win.addEventListener("scroll", sync, { passive: true });
    scrollCleanup = function () {
      win.removeEventListener("scroll", sync);
    };

    setTimeout(function () {
      try {
        var se = doc.documentElement;
        var body = doc.body;
        var h = Math.max(body.scrollHeight, se.scrollHeight);
        var v = win.innerHeight || se.clientHeight;
        if (h <= v + 80) {
          btnConfirm.disabled = false;
        } else {
          sync();
        }
      } catch (e) {
        btnConfirm.disabled = false;
      }
    }, 150);
  }

  function openSession(s) {
    if (!ensureModal()) return;
    session = s;
    if (titleEl) titleEl.textContent = s.title;
    btnConfirm.disabled = true;
    if (tabLink && s.url) tabLink.setAttribute("href", s.url);
    iframe.src = s.url;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function resolveOpenButton(btn) {
    var kind = (btn.getAttribute("data-legal-kind") || "").trim();
    if (kind && KIND_DEFAULTS[kind]) {
      var def = KIND_DEFAULTS[kind];
      return {
        title: def.title,
        url: def.url,
        checkId:
          (btn.getAttribute("data-legal-check") || "").trim() || def.checkId,
        readToken: (btn.getAttribute("data-legal-read-token") || "").trim() || null,
      };
    }
    var url = (btn.getAttribute("data-legal-src") || "").trim();
    var title = (btn.getAttribute("data-legal-title") || "").trim() || "약관·정책 문서";
    if (!url) return null;
    return {
      title: title,
      url: url,
      checkId: (btn.getAttribute("data-legal-check") || "").trim() || null,
      readToken: (btn.getAttribute("data-legal-read-token") || "").trim() || null,
    };
  }

  function wireModalOnce() {
    if (!ensureModal()) return;
    iframe.addEventListener("load", function () {
      try {
        attachScrollGate();
      } catch (e) {
        btnConfirm.disabled = false;
      }
    });

    btnConfirm.addEventListener("click", function () {
      if (btnConfirm.disabled || !session) return;
      if (session.checkId) {
        var cb = document.getElementById(session.checkId);
        if (cb) {
          cb.checked = true;
          cb.classList.remove("reg-check__input--locked");
        }
      }
      if (session.readToken) {
        document.dispatchEvent(
          new CustomEvent("reg-legal-read", {
            detail: { token: session.readToken, title: session.title },
          })
        );
      }
      if (session.checkId) {
        toast(session.title + " 동의가 반영되었습니다.");
      } else {
        toast(session.title + " · 끝까지 읽기 완료");
      }
      closeModal();
    });

    modal.querySelectorAll("[data-reg-legal-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeModal();
      });
    });
  }

  function bindGlobalOnce() {
    if (globalBound) return;
    globalBound = true;
    wireModalOnce();

    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target && e.target.closest && e.target.closest(".reg-legal-open");
        if (!btn) return;
        e.preventDefault();
        var s = resolveOpenButton(btn);
        if (!s) return;
        openSession(s);
      },
      false
    );

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !modal.hidden) closeModal();
    });
  }

  function wireLockedCheckboxes() {
    ["agree_terms", "agree_privacy"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (!el.classList.contains("reg-check__input--locked")) return;
      el.addEventListener(
        "click",
        function (e) {
          if (!el.classList.contains("reg-check__input--locked")) return;
          e.preventDefault();
          e.stopPropagation();
          toast(
            "'" +
              (id === "agree_terms" ? "이용약관" : "개인정보 처리방침") +
              "' 이름을 눌러 팝업을 연 뒤, 문서 하단까지 스크롤 후 동의 버튼을 눌러 주세요."
          );
        },
        true
      );
    });
  }

  bindGlobalOnce();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLockedCheckboxes);
  } else {
    wireLockedCheckboxes();
  }

  window.RegLegalConsent = {
    close: closeModal,
    openUrl: function (url, title) {
      openSession({
        url: url,
        title: title || "문서",
        checkId: null,
        readToken: null,
      });
    },
  };
})();
