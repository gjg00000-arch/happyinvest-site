/**
 * 모임터·임베드 게시판 공통 리치 에디터 (글자 크기·색 등).
 * 다중 게시판이 같은 페이지에 있어도 인스턴스별 상태가 분리된다.
 */
(function (global) {
  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var v = textarea.value;
    textarea.value = v.slice(0, start) + text + v.slice(end);
    var pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
  }

  /**
   * @param {{
   *   editor: HTMLElement,
   *   textarea: HTMLTextAreaElement,
   *   toolbar: HTMLElement,
   *   uploadImage?: function(File): Promise<string>
   * }} opts
   */
  function mount(opts) {
    var editorEl = opts.editor;
    var hiddenTa = opts.textarea;
    var toolbarRoot = opts.toolbar;
    var uploadImageFn = opts.uploadImage;

    var noopRet = {
      sync: function () {},
      insertHtml: function () {},
      reset: function () {},
      focus: function () {},
    };

    if (!editorEl || !hiddenTa || !toolbarRoot) return noopRet;

    var rtePendingRange = null;

    function persistSelectionFromEditor() {
      rtePendingRange = null;
      try {
        var sel = global.getSelection && global.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var r = sel.getRangeAt(0);
        if (
          typeof editorEl.contains === "function" &&
          !(editorEl.contains(r.anchorNode) && editorEl.contains(r.focusNode))
        ) {
          return;
        }
        rtePendingRange = r.cloneRange();
      } catch (_eUn) {}
    }

    function restorePendingSelection() {
      if (!rtePendingRange || !editorEl) return false;
      try {
        var sel = global.getSelection && global.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(rtePendingRange);
        if (!editorEl.contains(sel.anchorNode)) {
          rtePendingRange = null;
          return false;
        }
        return true;
      } catch (_eRes) {
        rtePendingRange = null;
        return false;
      }
    }

    function syncHtmlFromEditor() {
      var raw = (editorEl.innerHTML || "").trim();
      hiddenTa.value = raw === "<br>" ? "" : raw;
    }

    function insertHtmlSnippet(htmlSnippet) {
      if (!htmlSnippet) return;
      try {
        editorEl.focus();
        if (typeof document.execCommand === "function") {
          var okExec = document.execCommand("insertHTML", false, htmlSnippet);
          if (okExec) {
            syncHtmlFromEditor();
            return;
          }
        }
      } catch (_eIns) {}
      try {
        editorEl.focus();
        var sel = global.getSelection && global.getSelection();
        if (sel && sel.rangeCount && editorEl.contains(sel.anchorNode)) {
          var r = sel.getRangeAt(0);
          r.deleteContents();
          var temp = document.createElement("div");
          temp.innerHTML = htmlSnippet;
          var frag = document.createDocumentFragment();
          while (temp.firstChild) frag.appendChild(temp.firstChild);
          r.insertNode(frag);
          sel.removeAllRanges();
          sel.addRange(r);
        } else {
          editorEl.insertAdjacentHTML("beforeend", htmlSnippet);
        }
      } catch (_e2Ins) {
        editorEl.insertAdjacentHTML("beforeend", htmlSnippet);
      }
      syncHtmlFromEditor();
    }

    function rteExec(cmd, arg) {
      if (!editorEl) return false;
      editorEl.focus();
      try {
        if (typeof document.execCommand === "function") {
          try {
            document.execCommand("styleWithCSS", false, "true");
          } catch (_eSx) {}
          return document.execCommand(cmd, false, arg != null && arg !== "" ? arg : undefined);
        }
      } catch (_eCmd) {}
      return false;
    }

    function rteApplySpan(prop, cssVal) {
      if (!editorEl || !cssVal) return false;
      editorEl.focus();
      try {
        var sel = global.getSelection && global.getSelection();
        if (!sel || !sel.rangeCount) return false;
        var r = sel.getRangeAt(0);
        if (r.collapsed) {
          alert("글자를 드래그로 선택한 뒤 적용해 주세요.");
          return false;
        }
        var wrap = document.createElement("span");
        wrap.style[prop] = cssVal;
        wrap.appendChild(r.extractContents());
        r.insertNode(wrap);
        sel.removeAllRanges();
        var rr = document.createRange();
        rr.selectNodeContents(wrap);
        rr.collapse(false);
        sel.addRange(rr);
        rtePendingRange = rr.cloneRange();
        syncHtmlFromEditor();
        return true;
      } catch (_eSpan) {
        alert("이 구간에서는 서식을 적용하기 어려워요. 다른 줄을 선택해 보세요.");
        return false;
      }
    }

    function wireToolbar() {
      toolbarRoot.addEventListener(
        "mousedown",
        function (ev) {
          var t = ev.target && ev.target.closest ? ev.target.closest("[data-rte-cmd]") : null;
          var isBtn = !!(t && t.tagName === "BUTTON");
          if (isBtn) ev.preventDefault();
          var selPick =
            ev.target && ev.target.closest ? ev.target.closest("select.board-rte-select") : null;
          if (isBtn || selPick) persistSelectionFromEditor();
        },
        true
      );
      toolbarRoot.addEventListener("touchstart", persistSelectionFromEditor);

      toolbarRoot.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-rte-cmd]") : null;
        if (!btn) return;
        ev.preventDefault();
        var cmd = btn.getAttribute("data-rte-cmd");
        if (!cmd) return;
        var arg = btn.getAttribute("data-rte-arg");
        rteExec(cmd, arg);
        syncHtmlFromEditor();
        persistSelectionFromEditor();
      });

      var linkBtnEl = toolbarRoot.querySelector('[data-rte-action="rte-link"]');
      if (linkBtnEl)
        linkBtnEl.addEventListener("click", function (ev) {
          ev.preventDefault();
          persistSelectionFromEditor();
          if (!rtePendingRange || rtePendingRange.collapsed) {
            alert("먼저 링크를 걸 텍스트를 드래그로 선택해 주세요.");
            return;
          }
          var u =
            typeof global.prompt === "function" ? global.prompt("링크 URL (예: https://…)", "") : "";
          if (!String(u || "").trim()) return;
          if (!restorePendingSelection()) {
            alert("선택 영역을 다시 잡고 시도해 주세요.");
            return;
          }
          var url = String(u).trim();
          if (/^mailto:/i.test(url) || /^https?:\/\//i.test(url) || /^\/\/?/i.test(url)) {
            rteExec("createLink", url);
          } else {
            rteExec("createLink", "https://" + url.replace(/^\/+/, ""));
          }
          syncHtmlFromEditor();
        });

      function wireFontSelect(sel, propName, emptyHint) {
        if (!sel) return;
        sel.addEventListener("change", function () {
          var v = sel.value;
          try {
            sel.blur();
          } catch (_b) {}
          if (!v) return;
          if (!rtePendingRange || rtePendingRange.collapsed) {
            alert(emptyHint);
            sel.selectedIndex = 0;
            return;
          }
          if (!restorePendingSelection()) {
            alert("선택 영역을 다시 잡고 시도해 주세요.");
            sel.selectedIndex = 0;
            return;
          }
          rteApplySpan(propName, v);
          sel.selectedIndex = 0;
        });
      }

      wireFontSelect(
        toolbarRoot.querySelector('[data-rte-role="font-family"]'),
        "fontFamily",
        "먼저 글꼴을 바꿀 부분을 드래그로 선택해 주세요."
      );
      wireFontSelect(
        toolbarRoot.querySelector('[data-rte-role="font-size"]'),
        "fontSize",
        "먼저 글자 크기를 바꿀 부분을 드래그로 선택해 주세요."
      );

      function wireColor(inp, hiliteBg) {
        if (!inp) return;
        inp.addEventListener("mousedown", persistSelectionFromEditor);
        inp.addEventListener("touchstart", persistSelectionFromEditor, { passive: true });
        inp.addEventListener("change", function () {
          if (!rtePendingRange || rtePendingRange.collapsed) {
            alert("먼저 색을 바꿀 부분을 드래그로 선택해 주세요.");
            return;
          }
          if (!restorePendingSelection()) {
            alert("선택 영역을 다시 잡고 시도해 주세요.");
            return;
          }
          try {
            if (hiliteBg) {
              if (!rteExec("hiliteColor", inp.value)) rteExec("backColor", inp.value);
            } else rteExec("foreColor", inp.value);
          } catch (_eCl) {}
          syncHtmlFromEditor();
          persistSelectionFromEditor();
        });
      }

      wireColor(toolbarRoot.querySelector('[data-rte-role="fg-color"]'), false);
      wireColor(toolbarRoot.querySelector('[data-rte-role="bg-color"]'), true);
    }

    wireToolbar();

    editorEl.addEventListener("keyup", persistSelectionFromEditor);
    editorEl.addEventListener("mouseup", persistSelectionFromEditor);

    ["input", "keyup", "mouseup", "paste"].forEach(function (evName) {
      editorEl.addEventListener(evName, function () {
        syncHtmlFromEditor();
      });
    });

    if (typeof uploadImageFn === "function") {
      editorEl.addEventListener("paste", function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            e.preventDefault();
            var f = items[i].getAsFile();
            if (!f) return;
            uploadImageFn(f)
              .then(function (url) {
                insertHtmlSnippet(
                  '\n<img src="' +
                    url +
                    '" alt="" style="max-width:100%;height:auto;border-radius:6px" />\n'
                );
              })
              .catch(function (err) {
                alert(String((err && err.message) || err));
              });
            return;
          }
        }
      });
    }

    syncHtmlFromEditor();

    return {
      sync: syncHtmlFromEditor,
      insertHtml: insertHtmlSnippet,
      reset: function () {
        editorEl.innerHTML = "";
        rtePendingRange = null;
        syncHtmlFromEditor();
      },
      focus: function () {
        try {
          editorEl.focus();
        } catch (_f) {}
      },
    };
  }

  global.MagicBoardRte = {
    mount: mount,
    insertAtCursor: insertAtCursor,
  };
})(typeof window !== "undefined" ? window : globalThis);
