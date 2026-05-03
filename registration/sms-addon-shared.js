/** 문자 패키지 안내 모달 연결 ([data-open-sms-addon-modal]) */
(function () {
  function bind() {
    var overlay = document.getElementById("sms-addon-modal");
    if (!overlay) return;
    function open() {
      overlay.classList.add("is-open");
      var t = overlay.querySelector("h3");
      if (t) t.focus();
    }
    function close() {
      overlay.classList.remove("is-open");
    }
    document.querySelectorAll("[data-open-sms-addon-modal]").forEach(function (btn) {
      btn.addEventListener("click", open);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll("[data-close-sms-modal]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else bind();
})();
