(function () {
  function apiBase() {
    var m = document.querySelector('meta[name="api-base"]');
    return (m && m.content) || "https://magicindicatorglobal.com";
  }

  /** POST body / storage slug — 서버 게시 카테고리 (임베드 data-category 값 그대로) */
  function apiCategoryFromEmbedDataCat(cat) {
    var s = cat == null ? "" : String(cat).trim();
    if (s === "indicator_optimizing") return "developer_journal";
    return s;
  }

  function dedupePostsById(arr) {
    var map = {};
    (arr || []).forEach(function (p) {
      var id = p && p._id != null ? String(p._id) : "";
      if (!id) return;
      if (!map[id]) map[id] = p;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function mergeHighlightDedupePosts(a, b) {
    var seen = {};
    var out = [];
    function pump(xs) {
      (xs || []).forEach(function (p) {
        var id = p && p._id != null ? String(p._id) : "";
        if (!id || seen[id]) return;
        seen[id] = true;
        out.push(p);
      });
    }
    pump(a);
    pump(b);
    return out;
  }

  function sortMergedEmbedPosts(posts) {
    var arr = (posts || []).slice();
    arr.sort(function (a, b) {
      var tb = new Date((b && b.created_at) || 0).getTime();
      var ta = new Date((a && a.created_at) || 0).getTime();
      return tb - ta;
    });
    return arr;
  }

  function mergeDualIndicatorEmbedPayloads(d1, d2) {
    var p1 = d1.posts || [];
    var p2 = d2.posts || [];
    var canRead = !(d1.canRead === false && d2.canRead === false);
    var message = d1.message || d2.message;
    var canWrite = d1.canWrite !== false || d2.canWrite !== false;
    var role = d1.role || d2.role || "";
    var mergedPosts = sortMergedEmbedPosts(dedupePostsById(p1.concat(p2)));
    return {
      canRead: canRead,
      canWrite: canWrite,
      message: message,
      role: role,
      posts: mergedPosts,
      highlightTopViews: mergeHighlightDedupePosts(d1.highlightTopViews, d2.highlightTopViews),
      highlightTopComments: mergeHighlightDedupePosts(d1.highlightTopComments, d2.highlightTopComments),
    };
  }

  function filterDeveloperJournalEmbedPayload(data) {
    function isDevJournal(p) {
      var c = p && p.category != null ? String(p.category).trim() : "";
      return c === "developer_journal" || c === "indicator_optimizing";
    }
    return {
      canRead: true,
      canWrite: data.role === "admin",
      canComment: true,
      message: data.message || "",
      role: data.role || "",
      posts: sortMergedEmbedPosts(dedupePostsById((data.posts || []).filter(isDevJournal))),
      highlightTopViews: (data.highlightTopViews || []).filter(isDevJournal),
      highlightTopComments: (data.highlightTopComments || []).filter(isDevJournal),
    };
  }

  /**
   * HappyUX.getLang() / happyinvest-lang 와 맞춤. ko|en|ja|zh|es 만 전용 사전;
   * 그 외 코드는 en 으로(사이트 UX 는 미지원 시 ko 일 수 있으나 보드 UI 는 EN 혼입 방지).
   */
  function normalizeBoardLang(code) {
    var raw = String(code || "ko")
      .toLowerCase()
      .replace(/_/g, "-");
    if (raw === "ko") return "ko";
    if (raw === "ja" || raw.indexOf("ja-") === 0) return "ja";
    if (raw === "zh" || raw === "cn" || raw.indexOf("zh-") === 0) return "zh";
    if (raw === "es" || raw.indexOf("es-") === 0) return "es";
    if (raw === "en" || raw.indexOf("en-") === 0) return "en";
    return "en";
  }

  function resolveBoardLang() {
    try {
      if (typeof window !== "undefined" && window.HappyUX && HappyUX.getLang) {
        return normalizeBoardLang(HappyUX.getLang());
      }
    } catch (e) {}
    return "ko";
  }

  function localeTagForBoard(lang) {
    return lang === "ko" ? "ko-KR" : "en-US";
  }

  var BOARD_I18N = {
    ko: {
      rteAriaToolbar: "본문 편집 도구",
      rteAriaFontColor: "글꼴·색",
      rteBold: "굵게",
      rteItalic: "기울임",
      rteUnderline: "밑줄",
      rteFontSelectTitle: "글꼴 (선택한 글자에 적용)",
      rteFontSelectAria: "글꼴",
      rteFontOption: "글꼴",
      rteFontGothic: "고딕",
      rteFontSerif: "명조",
      rteFontMono: "고정폭",
      rteFontHand: "손글씨 느낌",
      rteSizeSelectTitle: "글자 크기 (선택한 글자에 적용)",
      rteSizeSelectAria: "글자 크기",
      rteSizeOption: "크기",
      rteFgColorTitle: "글자 색",
      rteFgColorLabel: "글자색",
      rteFgColorAria: "글자 색",
      rteBgColorTitle: "선택 영역 배경색(형광펜)",
      rteBgColorLabel: "배경",
      rteBgColorAria: "글 배경색",
      rteAriaParagraph: "단락·미디어",
      rteH2: "중간 제목",
      rteP: "본문 단락",
      rteQuote: "인용",
      rteCode: "코드 블록",
      rteUl: "글머리 기호 목록",
      rteUlBtn: "· 목록",
      rteOl: "번호 목록",
      rteHr: "구분선",
      rteHrAria: "가로줄 삽입",
      rteLink: "링크 넣기",
      rteLinkAria: "링크",
      rteImage: "이미지 파일 삽입",
      rteImageAria: "이미지 삽입",
      rteImageBtn: "🖼 이미지",
      rteFileTitle: "이미지 파일 선택(본문 삽입)",
      rteFileAria: "파일 첨부",
      rteFileBtn: "📎 파일",
      errMagicAuthFirst: "먼저 magic-auth.js를 불러와 주세요.",
      viewSumLineLoading: "전체 조회 합계 · …",
      viewSumLineDash: "전체 조회 합계 · —",
      viewSumTooltipError: "목록을 불러오지 못해 합계를 표시할 수 없습니다.",
      viewSumTooltipDenied: "이 구역 글 열람 권한이 없어 합계를 표시할 수 없습니다.",
      viewSumLineZero: "전체 조회 합계 · 0",
      viewSumLineCount: "전체 조회 합계 · {count}",
      viewSumAreaTooltip: "이 구역({category})에 올라온 글의 누적 조회수 합계",
      labelLoginEmail: "로그인 이메일",
      phEmail: "나의 이메일",
      labelBoardRole: "게시판 권한",
      roleGuest: "방문 (guest)",
      roleFree: "무료 회원 (free)",
      roleTrial: "체험 (trial)",
      roleSub: "구독 (sub)",
      roleVip: "커뮤니티 VIP",
      roleAdmin: "운영 (admin)",
      btnApplyAuth: "이대로 적용",
      labelTitle: "제목",
      phTitle: "짧게 적어 주세요",
      labelBody: "내용 — 서식·이미지(파일 또는 편집 칸 붙여넣기)",
      phBodyRte:
        "나누고 싶은 이야기를 적어 보세요. 글자를 드래그한 뒤 크기·색을 바꿀 수 있습니다.",
      captionImageFile: "이미지 파일",
      btnPasteHint: "이미지 붙여넣기: 편집 칸 선택 후 Ctrl+V",
      btnSubmit: "올리기",
      composeHint: "많이 읽힌 글·답글이 많은 글이 위에 요약돼요. 글마다 답글을 달 수 있어요.",
      phBodyPlain: "나누고 싶은 이야기 (HTML 가능)",
      noTitle: "(제목 없음)",
      hlTopViews: "많이 본 글",
      hlTopComments: "댓글이 많은 글",
      metaViewsComments: "조회 {views} · 댓글 {comments}",
      metaCommentsViews: "댓글 {comments} · 조회 {views}",
      threadStats: "조회 {views} · 댓글 {comments}",
      phReply: "따뜻한 말 한마디",
      btnSendReply: "답 남기기",
      alertReplyEmpty: "내용을 한 줄이라도 적어 주세요.",
      replyDenied: "이 구역에는 아직 답글을 남길 수 없어요.",
      replyLoadErr: "답글을 불러오지 못했어요. 잠시 후 다시 눌러 주세요. ({message})",
      viewSumLoadingTitle: "불러오는 중입니다.",
      msgCannotRead: "이 구역은 아직 열람할 수 없어요",
      msgReadDeniedSuffix: " (현재 권한: {role})",
      adminWriteHint:
        "이 구역은 운영(관리자)만 새 글을 올릴 수 있어요. 진행 상황·의견은 각 글의 「답글 펼치기」에서 댓글로 남겨 주세요.",
      emptyList: "아직 글이 없어요. 첫 이야기를 남겨 보시겠어요?",
      btnExpandThread: "답글 펼치기",
      btnCollapse: "접기",
      loadFailed: "연결이 끊겼어요. 잠시 후 다시 눌러 주세요. ({message})",
      alertTitleBodyRequired: "제목과 내용을 모두 적어 주세요.",
      uploadFailed: "upload failed",
    },
    en: {
      rteAriaToolbar: "Formatting toolbar",
      rteAriaFontColor: "Font and color",
      rteBold: "Bold",
      rteItalic: "Italic",
      rteUnderline: "Underline",
      rteFontSelectTitle: "Font (applies to selection)",
      rteFontSelectAria: "Font",
      rteFontOption: "Font",
      rteFontGothic: "Sans serif",
      rteFontSerif: "Serif",
      rteFontMono: "Monospace",
      rteFontHand: "Handwriting style",
      rteSizeSelectTitle: "Font size (applies to selection)",
      rteSizeSelectAria: "Font size",
      rteSizeOption: "Size",
      rteFgColorTitle: "Text color",
      rteFgColorLabel: "Text",
      rteFgColorAria: "Text color",
      rteBgColorTitle: "Highlight (selection background)",
      rteBgColorLabel: "Highlight",
      rteBgColorAria: "Background highlight",
      rteAriaParagraph: "Paragraph and media",
      rteH2: "Subheading",
      rteP: "Paragraph",
      rteQuote: "Quote",
      rteCode: "Code block",
      rteUl: "Bulleted list",
      rteUlBtn: "• List",
      rteOl: "Numbered list",
      rteHr: "Divider",
      rteHrAria: "Insert horizontal rule",
      rteLink: "Insert link",
      rteLinkAria: "Link",
      rteImage: "Insert image file",
      rteImageAria: "Insert image",
      rteImageBtn: "🖼 Image",
      rteFileTitle: "Choose image file (insert in body)",
      rteFileAria: "Attach file",
      rteFileBtn: "📎 File",
      errMagicAuthFirst: "Please load magic-auth.js first.",
      viewSumLineLoading: "Total views · …",
      viewSumLineDash: "Total views · —",
      viewSumTooltipError: "Totals are unavailable because the list could not be loaded.",
      viewSumTooltipDenied: "Totals are hidden because you cannot read posts in this area.",
      viewSumLineZero: "Total views · 0",
      viewSumLineCount: "Total views · {count}",
      viewSumAreaTooltip: "Cumulative views for all posts in this area ({category})",
      labelLoginEmail: "Sign-in email",
      phEmail: "Your email",
      labelBoardRole: "Board access level",
      roleGuest: "Visitor (guest)",
      roleFree: "Free member (free)",
      roleTrial: "Trial",
      roleSub: "Subscriber (sub)",
      roleVip: "Community VIP",
      roleAdmin: "Administrator (admin)",
      btnApplyAuth: "Apply",
      labelTitle: "Title",
      phTitle: "Keep it short",
      labelBody: "Body — formatting and images (file or paste in the editor)",
      phBodyRte:
        "Write what you would like to share. Select text to change size or color.",
      captionImageFile: "Image file",
      btnPasteHint: "Paste image: focus the editor, then Ctrl+V",
      btnSubmit: "Post",
      composeHint:
        "Popular posts and threads with many replies are summarized above. Each post accepts replies.",
      phBodyPlain: "Your message (HTML allowed)",
      noTitle: "(No title)",
      hlTopViews: "Most viewed",
      hlTopComments: "Most discussed",
      metaViewsComments: "{views} views · {comments} replies",
      metaCommentsViews: "{comments} replies · {views} views",
      threadStats: "{views} views · {comments} replies",
      phReply: "Write a thoughtful reply",
      btnSendReply: "Post reply",
      alertReplyEmpty: "Please enter at least one line.",
      replyDenied: "You cannot reply in this area yet.",
      replyLoadErr: "Could not load replies. Please try opening the thread again. ({message})",
      viewSumLoadingTitle: "Loading…",
      msgCannotRead: "You cannot view this area yet",
      msgReadDeniedSuffix: " (Current access: {role})",
      adminWriteHint:
        "Only administrators can create new topics here. For updates or opinions, leave a reply via “Expand replies” on each post.",
      emptyList: "No posts yet—be the first to share.",
      btnExpandThread: "Expand replies",
      btnCollapse: "Collapse",
      loadFailed: "Connection failed. Please try again. ({message})",
      alertTitleBodyRequired: "Please fill in both title and body.",
      uploadFailed: "upload failed",
    },
  };

  BOARD_I18N.ja = BOARD_I18N.en;
  BOARD_I18N.zh = BOARD_I18N.en;
  BOARD_I18N.es = BOARD_I18N.en;

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

  function fmtDate(d, localeTag) {
    if (!d) return "";
    try {
      var x = new Date(d);
      if (isNaN(x.getTime())) return "";
      return x.toLocaleDateString(localeTag, { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function expand(str, vars) {
    var s = String(str || "");
    if (!vars) return s;
    Object.keys(vars).forEach(function (k) {
      s = s.split("{" + k + "}").join(vars[k] != null ? String(vars[k]) : "");
    });
    return s;
  }

  function rteToolbarMarkup(t) {
    return (
      '<div class="board-rte-toolbar board-rte-toolbar--stack" role="toolbar" aria-label="' +
      t("rteAriaToolbar") +
      '">' +
      '<div class="board-rte-toolbar-row" role="group" aria-label="' +
      t("rteAriaFontColor") +
      '">' +
      '<button type="button" class="board-rte-btn board-rte-btn--toggle" title="' +
      t("rteBold") +
      '" data-rte-cmd="bold" aria-label="' +
      t("rteBold") +
      '"><strong>B</strong></button>' +
      '<button type="button" class="board-rte-btn board-rte-btn--toggle" title="' +
      t("rteItalic") +
      '" data-rte-cmd="italic" aria-label="' +
      t("rteItalic") +
      '"><em>I</em></button>' +
      '<button type="button" class="board-rte-btn board-rte-btn--toggle" title="' +
      t("rteUnderline") +
      '" data-rte-cmd="underline" aria-label="' +
      t("rteUnderline") +
      '"><span>U</span></button>' +
      '<select class="board-rte-select board-rte-select--font" data-rte-role="font-family" title="' +
      t("rteFontSelectTitle") +
      '" aria-label="' +
      t("rteFontSelectAria") +
      '">' +
      '<option value="">' +
      t("rteFontOption") +
      "</option>" +
      '<option value=\'system-ui, \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", sans-serif\'>' +
      t("rteFontGothic") +
      "</option>" +
      '<option value=\'Georgia, \"Times New Roman\", \"Noto Serif KR\", serif\'>' +
      t("rteFontSerif") +
      "</option>" +
      '<option value=\'ui-monospace, Consolas, \"D2Coding\", \"Courier New\", monospace\'>' +
      t("rteFontMono") +
      "</option>" +
      '<option value=\'\"Comic Sans MS\", \"Segoe Print\", fantasy\'>' +
      t("rteFontHand") +
      "</option>" +
      "</select>" +
      '<select class="board-rte-select" data-rte-role="font-size" title="' +
      t("rteSizeSelectTitle") +
      '" aria-label="' +
      t("rteSizeSelectAria") +
      '">' +
      '<option value="">' +
      t("rteSizeOption") +
      "</option>" +
      '<option value="12px">12px</option>' +
      '<option value="14px">14px</option>' +
      '<option value="16px">16px</option>' +
      '<option value="18px">18px</option>' +
      '<option value="20px">20px</option>' +
      '<option value="24px">24px</option>' +
      '<option value="28px">28px</option>' +
      '<option value="32px">32px</option>' +
      "</select>" +
      '<label class="board-rte-color-chip" title="' +
      t("rteFgColorTitle") +
      '"><span class="board-rte-color-chip-text">' +
      t("rteFgColorLabel") +
      "</span>" +
      '<input type="color" data-rte-role="fg-color" value="#1a1814" aria-label="' +
      t("rteFgColorAria") +
      '" /></label>' +
      '<label class="board-rte-color-chip" title="' +
      t("rteBgColorTitle") +
      '"><span class="board-rte-color-chip-text">' +
      t("rteBgColorLabel") +
      "</span>" +
      '<input type="color" data-rte-role="bg-color" value="#fff59d" aria-label="' +
      t("rteBgColorAria") +
      '" /></label>' +
      "</div>" +
      '<div class="board-rte-toolbar-row" role="group" aria-label="' +
      t("rteAriaParagraph") +
      '">' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteH2") +
      '" data-rte-cmd="formatBlock" data-rte-arg="h2">H2</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteP") +
      '" data-rte-cmd="formatBlock" data-rte-arg="p">P</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteQuote") +
      '" data-rte-cmd="formatBlock" data-rte-arg="blockquote">"</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteCode") +
      '" data-rte-cmd="formatBlock" data-rte-arg="pre">&lt;/&gt;</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteUl") +
      '" data-rte-cmd="insertUnorderedList" aria-label="' +
      t("rteUl") +
      '">' +
      t("rteUlBtn") +
      "</button>" +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteOl") +
      '" data-rte-cmd="insertOrderedList" aria-label="' +
      t("rteOl") +
      '">1.</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteHr") +
      '" data-rte-cmd="insertHorizontalRule" aria-label="' +
      t("rteHrAria") +
      '">—</button>' +
      '<button type="button" class="board-rte-btn" title="' +
      t("rteLink") +
      '" data-rte-action="rte-link" aria-label="' +
      t("rteLinkAria") +
      '">🔗</button>' +
      '<button type="button" class="board-rte-btn board-rte-btn--wide board-rte-btn--inline-tool magic-board__rte-img" title="' +
      t("rteImage") +
      '" aria-label="' +
      t("rteImageAria") +
      '">' +
      t("rteImageBtn") +
      "</button>" +
      '<button type="button" class="board-rte-btn board-rte-btn--wide board-rte-btn--inline-tool magic-board__rte-file" title="' +
      t("rteFileTitle") +
      '" aria-label="' +
      t("rteFileAria") +
      '">' +
      t("rteFileBtn") +
      "</button>" +
      "</div>" +
      "</div>"
    );
  }

  function mount(el) {
    if (!window.MagicAuth) {
      var fallbackPack = BOARD_I18N[resolveBoardLang()] || BOARD_I18N.en;
      el.textContent =
        fallbackPack.errMagicAuthFirst || BOARD_I18N.ko.errMagicAuthFirst;
      return;
    }
    var boardLang = resolveBoardLang();
    var localeTag = localeTagForBoard(boardLang);
    var pack = BOARD_I18N[boardLang] || BOARD_I18N.en;
    function t(key) {
      var s = pack[key];
      if (s == null) s = BOARD_I18N.en[key];
      if (s == null) s = BOARD_I18N.ko[key];
      if (s == null) s = key;
      return s;
    }

    var API = apiBase();
    var category = el.getAttribute("data-category") || "general";
    var title = el.getAttribute("data-title") || category;
    var compact = el.getAttribute("data-compact") === "1";
    var liveRaw = el.getAttribute("data-live-ms");
    var liveMs = parseInt(liveRaw != null && String(liveRaw).trim() !== "" ? liveRaw : "", 10);
    if (!isFinite(liveMs) || liveMs < 3000) {
      liveMs = el.getAttribute("data-live") === "1" ? 10000 : 0;
    }

    el.className = "magic-board" + (compact ? " magic-board--compact" : "");
    el.innerHTML = "";
    var headRow = h("div", "magic-board__head");
    headRow.appendChild(h("span", "magic-board__head-title", title));
    headRow.appendChild(
      h("span", "magic-board__head-views magic-board__head-views--loading", t("viewSumLineLoading"))
    );
    el.appendChild(headRow);

    function updateCategoryViewSum(postsArr, denied) {
      var hv = headRow.querySelector(".magic-board__head-views");
      if (!hv) return;
      hv.classList.remove("magic-board__head-views--loading");
      if (denied === true || denied === "__error__") {
        hv.textContent = t("viewSumLineDash");
        hv.title =
          denied === "__error__" ? t("viewSumTooltipError") : t("viewSumTooltipDenied");
        return;
      }
      var sum = 0;
      (postsArr || []).forEach(function (p) {
        sum += Number(p.views != null ? p.views : 0) || 0;
      });
      hv.textContent =
        !(postsArr && postsArr.length) && sum === 0
          ? t("viewSumLineZero")
          : expand(t("viewSumLineCount"), { count: sum.toLocaleString(localeTag) });
      hv.title = expand(t("viewSumAreaTooltip"), { category: category });
    }

    var authBox = h("div", "magic-board__auth");
    authBox.innerHTML =
      "<label>" +
      t("labelLoginEmail") +
      ' <input type="email" class="magic-email" placeholder="' +
      t("phEmail") +
      '" /></label>' +
      "<label>" +
      t("labelBoardRole") +
      ' <select class="magic-role">' +
      '<option value="guest">' +
      t("roleGuest") +
      "</option>" +
      '<option value="free">' +
      t("roleFree") +
      "</option>" +
      '<option value="trial">' +
      t("roleTrial") +
      "</option>" +
      '<option value="sub">' +
      t("roleSub") +
      "</option>" +
      '<option value="vip">' +
      t("roleVip") +
      "</option>" +
      '<option value="admin">' +
      t("roleAdmin") +
      "</option>" +
      "</select></label>" +
      '<button type="button" class="magic-save-auth">' +
      t("btnApplyAuth") +
      "</button>";
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
      "<label>" +
      t("labelTitle") +
      "</label>" +
      '<input type="text" class="magic-title" placeholder="' +
      t("phTitle") +
      '" />' +
      "<label>" +
      t("labelBody") +
      "</label>" +
      '<div class="board-rte-shell">' +
      rteToolbarMarkup(t) +
      '<div class="magic-body-ed board-rte-editor" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" tabindex="0" data-placeholder="' +
      t("phBodyRte") +
      '"></div>' +
      "</div>" +
      '<textarea class="magic-body visually-hidden" aria-hidden="true" tabindex="-1" rows="3"></textarea>' +
      '<div class="magic-board__tools magic-board__tools--rte">' +
      '<input type="file" class="magic-file" accept="image/*" />' +
      '<span class="magic-board__file-caption">' +
      t("captionImageFile") +
      "</span>" +
      '<button type="button" class="magic-btn--ghost magic-paste-hint">' +
      t("btnPasteHint") +
      "</button>" +
      "</div>" +
      '<button type="button" class="magic-btn magic-submit">' +
      t("btnSubmit") +
      "</button>" +
      '<p class="magic-board__hint">' +
      t("composeHint") +
      "</p>";
    el.appendChild(compose);

    var emailIn = authBox.querySelector(".magic-email");
    var roleIn = authBox.querySelector(".magic-role");
    var saveBtn = authBox.querySelector(".magic-save-auth");
    var titleIn = compose.querySelector(".magic-title");
    var bodyEd = compose.querySelector(".magic-body-ed");
    var bodyTa = compose.querySelector("textarea.magic-body");
    var bodyToolbar = compose.querySelector(".board-rte-toolbar");
    var pasteHintBtn = compose.querySelector(".magic-paste-hint");
    var fileIn = compose.querySelector(".magic-file");

    var rteCtl = null;

    function insertIntoMagicBody(snippet) {
      if (!snippet) return;
      if (rteCtl && typeof rteCtl.insertHtml === "function") rteCtl.insertHtml(snippet);
      else if (bodyTa) insertAtCursor(bodyTa, snippet);
    }

    function syncMagicBodyBeforeSend() {
      if (rteCtl && typeof rteCtl.sync === "function") rteCtl.sync();
    }

    function syncAuthFromStorage() {
      var a = MagicAuth.get();
      emailIn.value = a.email;
      roleIn.value = a.role;
    }
    syncAuthFromStorage();

    saveBtn.addEventListener("click", function () {
      MagicAuth.set(emailIn.value, roleIn.value);
      var chain = Promise.resolve();
      if (MagicAuth.ensureFreshToken) chain = MagicAuth.ensureFreshToken(API);
      if (MagicAuth.syncSessionProfile) {
        chain = chain.then(function () {
          return MagicAuth.syncSessionProfile(API);
        });
      }
      chain
        .then(function () {
          syncAuthFromStorage();
          load();
        })
        .catch(function () {
          load();
        });
    });

    function userHeaders() {
      MagicAuth.set(emailIn.value, roleIn.value);
      var hDict = Object.assign({}, MagicAuth.headers());
      if (window.HappyUX && HappyUX.getVisitorId) hDict["X-Visitor-Id"] = HappyUX.getVisitorId();
      return hDict;
    }
    function postHeaders() {
      return Object.assign({ "Content-Type": "application/json" }, userHeaders());
    }

    function scheduleEmbeddedBoardTranslate() {
      if (
        window.MagicContentTranslate &&
        window.MagicContentTranslate.refreshAfterLangSwitch &&
        window.HappyUX &&
        window.HappyUX.getLang
      ) {
        window.MagicContentTranslate.refreshAfterLangSwitch(window.HappyUX.getLang());
      }
    }

    function uploadImage(file) {
      var fd = new FormData();
      fd.append("file", file);
      return fetch(API + "/api/upload", { method: "POST", headers: userHeaders(), body: fd })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) throw new Error(x.j.error || t("uploadFailed"));
          return x.j.url;
        });
    }

    if (window.MagicBoardRte && bodyEd && bodyTa && bodyToolbar) {
      rteCtl = window.MagicBoardRte.mount({
        editor: bodyEd,
        textarea: bodyTa,
        toolbar: bodyToolbar,
        uploadImage: uploadImage,
      });
      var rteImgTb = compose.querySelector(".magic-board__rte-img");
      var rteFileTb = compose.querySelector(".magic-board__rte-file");
      function rteOpenComposeFileInput() {
        try {
          if (fileIn) fileIn.click();
        } catch (_e) {}
      }
      if (rteImgTb) rteImgTb.addEventListener("click", rteOpenComposeFileInput);
      if (rteFileTb) rteFileTb.addEventListener("click", rteOpenComposeFileInput);
    } else {
      var rteShellFb = compose.querySelector(".board-rte-shell");
      if (rteShellFb) rteShellFb.style.display = "none";
      if (bodyTa) {
        bodyTa.classList.remove("visually-hidden");
        bodyTa.removeAttribute("aria-hidden");
        bodyTa.placeholder = t("phBodyPlain");
        bodyTa.rows = Math.max(Number(bodyTa.rows) || 0, 8);
      }
    }

    if (!rteCtl && bodyTa) {
      bodyTa.addEventListener("paste", function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            e.preventDefault();
            var f = items[i].getAsFile();
            if (!f) return;
            uploadImage(f).then(function (url) {
              insertIntoMagicBody(
                '\n<img src="' +
                  url +
                  '" alt="" style="max-width:100%;height:auto;border-radius:6px" />\n'
              );
            });
            return;
          }
        }
      });
    }

    if (fileIn) {
      fileIn.addEventListener("change", function () {
        var f = fileIn.files && fileIn.files[0];
        if (!f) return;
        uploadImage(f).then(function (url) {
          insertIntoMagicBody(
            '\n<img src="' + url + '" alt="" style="max-width:100%;height:auto;border-radius:6px" />\n'
          );
          fileIn.value = "";
        });
      });
    }

    if (pasteHintBtn) {
      pasteHintBtn.addEventListener("click", function () {
        if (rteCtl) rteCtl.focus();
        else if (bodyTa) bodyTa.focus();
      });
    }

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
        var tt = h("p", "magic-board__hl-card-title", (p.title || t("noTitle")) + "");
        var mm = h("p", "magic-board__hl-card-meta", sub);
        card.appendChild(tt);
        card.appendChild(mm);
        return card;
      }

      if (tv.length) {
        var sec = h("div", "magic-board__hl-block");
        sec.appendChild(h("div", "magic-board__hl-label", t("hlTopViews")));
        var row = h("div", "magic-board__hl-row");
        tv.forEach(function (p) {
          var v = p.views != null ? p.views : 0;
          row.appendChild(
            miniCard(
              p,
              expand(t("metaViewsComments"), {
                views: v,
                comments: p.comment_count != null ? p.comment_count : 0,
              })
            )
          );
        });
        sec.appendChild(row);
        highlightsEl.appendChild(sec);
      }

      if (tc.length) {
        var sec2 = h("div", "magic-board__hl-block");
        sec2.appendChild(h("div", "magic-board__hl-label", t("hlTopComments")));
        var row2 = h("div", "magic-board__hl-row");
        tc.forEach(function (p) {
          var v = p.views != null ? p.views : 0;
          var cc = p.comment_count != null ? p.comment_count : 0;
          row2.appendChild(
            miniCard(p, expand(t("metaCommentsViews"), { comments: cc, views: v }))
          );
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
          statsEl.textContent = expand(t("threadStats"), {
            views: views != null ? views : 0,
            comments: cc != null ? cc : 0,
          });
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
                (c.author_id || "") + " · " + fmtDate(c.created_at, localeTag)
              )
            );
            var body = h("div", "magic-board__reply-body");
            body.innerHTML = c.content || "";
            liC.appendChild(body);
            ul.appendChild(liC);
          });
          threadEl.appendChild(ul);
          if (window.MagicContentTranslate && window.MagicContentTranslate.onMount) {
            window.MagicContentTranslate.onMount(ul.querySelectorAll(".magic-board__reply-body"));
          }

          if (data.canComment) {
            var ta = h("textarea", "magic-board__reply-input");
            ta.placeholder = t("phReply");
            ta.rows = 2;
            var send = h("button", "magic-btn magic-btn--small", t("btnSendReply"));
            send.type = "button";
            send.addEventListener("click", function () {
              var txt = (ta.value || "").trim();
              if (!txt) {
                alert(t("alertReplyEmpty"));
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
            threadEl.appendChild(h("p", "magic-board__reply-deny", t("replyDenied")));
          }
        })
        .catch(function (e) {
          threadEl.innerHTML = "";
          threadEl.appendChild(
            h(
              "p",
              "magic-board__reply-deny",
              expand(t("replyLoadErr"), { message: e.message || "" })
            )
          );
        });
    }

    function load() {
      msgEl.style.display = "none";
      listEl.innerHTML = "";
      var hv0 = headRow.querySelector(".magic-board__head-views");
      if (hv0) {
        hv0.classList.add("magic-board__head-views--loading");
        hv0.textContent = t("viewSumLineLoading");
        hv0.title = t("viewSumLoadingTitle");
      }

      function fetchJson(url) {
        return fetch(url, {
          headers: userHeaders(),
          cache: "no-store",
        }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        });
      }

      /** Embed has no 정렬 UI — boards 페이지 기본(최신)과 동일하게 sort=new */
      var sortQs = "&sort=new";
      var apiCategory = apiCategoryFromEmbedDataCat(category);
      var promiseList =
        apiCategory === "developer_journal"
          ? fetchJson(API + "/api/posts?sort=new").then(filterDeveloperJournalEmbedPayload)
          : fetchJson(API + "/api/posts?category=" + encodeURIComponent(apiCategory) + sortQs);

      promiseList
        .then(function (data) {
          if (data.canRead === false) {
            updateCategoryViewSum([], true);
            msgEl.textContent =
              (data.message || t("msgCannotRead")) +
              expand(t("msgReadDeniedSuffix"), { role: data.role || "" });
            msgEl.style.display = "block";
            compose.style.display = "none";
            highlightsEl.style.display = "none";
            scheduleEmbeddedBoardTranslate();
            return;
          }
          compose.style.display = "block";
          var sub = compose.querySelector(".magic-submit");
          var adminHint = compose.querySelector(".magic-board__admin-only-hint");
          if (!data.canWrite) {
            compose.style.opacity = "0.95";
            if (sub) sub.disabled = true;
            if (!adminHint) {
              adminHint = h("p", "magic-board__admin-only-hint");
              compose.insertBefore(adminHint, compose.firstChild);
            }
            adminHint.textContent = t("adminWriteHint");
            adminHint.style.display = "block";
          } else {
            compose.style.opacity = "1";
            if (sub) sub.disabled = false;
            if (adminHint) adminHint.style.display = "none";
          }

          var sumPosts = data.posts || [];
          updateCategoryViewSum(sumPosts, false);

          renderHighlights(data.highlightTopViews, data.highlightTopComments);

          var posts = sumPosts.slice();
          if (posts.length === 0) {
            listEl.appendChild(
              h(
                "li",
                "magic-board__item",
                '<p class="magic-board__item-meta">' + t("emptyList") + "</p>"
              )
            );
            scheduleEmbeddedBoardTranslate();
            return;
          }
          posts.forEach(function (p) {
            var li = h("li", "magic-board__item");
            var tEl = h("p", "magic-board__item-title");
            tEl.textContent = p.title || t("noTitle");
            li.appendChild(tEl);

            var b = h("div", "magic-board__item-body");
            b.innerHTML = p.content || "";
            var m = h("div", "magic-board__item-meta");
            m.textContent =
              (p.author_id || "") +
              " · " +
              fmtDate(p.created_at, localeTag) +
              " · " +
              (p.category || "");
            li.appendChild(b);
            li.appendChild(m);

            var stats = h("div", "magic-board__item-stats");
            var v0 = p.views != null ? p.views : 0;
            var c0 = p.comment_count != null ? p.comment_count : 0;
            stats.textContent = expand(t("threadStats"), { views: v0, comments: c0 });

            var toggleBtn = h(
              "button",
              "magic-btn magic-btn--small magic-btn--ghost magic-board__thread-toggle",
              t("btnExpandThread")
            );
            toggleBtn.type = "button";
            var threadEl = h("div", "magic-board__thread");
            threadEl.style.display = "none";

            var open = false;
            toggleBtn.addEventListener("click", function () {
              if (!open) {
                threadEl.style.display = "block";
                toggleBtn.textContent = t("btnCollapse");
                if (window.MagicContentTranslate && window.MagicContentTranslate.onMount) {
                  window.MagicContentTranslate.onMount(toggleBtn);
                }
                openThread(li, p, threadEl, stats, toggleBtn);
                open = true;
              } else {
                threadEl.style.display = "none";
                threadEl.innerHTML = "";
                delete threadEl.dataset.viewSent;
                toggleBtn.textContent = t("btnExpandThread");
                if (window.MagicContentTranslate && window.MagicContentTranslate.onMount) {
                  window.MagicContentTranslate.onMount(toggleBtn);
                }
                open = false;
              }
            });

            li.appendChild(stats);
            li.appendChild(toggleBtn);
            li.appendChild(threadEl);
            listEl.appendChild(li);
          });
          scheduleEmbeddedBoardTranslate();
        })
        .catch(function (e) {
          updateCategoryViewSum([], "__error__");
          msgEl.textContent = expand(t("loadFailed"), { message: e.message || "" });
          msgEl.style.display = "block";
          scheduleEmbeddedBoardTranslate();
        });
    }

    compose.querySelector(".magic-submit").addEventListener("click", function () {
      MagicAuth.set(emailIn.value, roleIn.value);
      syncMagicBodyBeforeSend();
      var payload = {
        title: titleIn.value,
        content: bodyTa.value,
        author_id: MagicAuth.get().email,
        category: apiCategoryFromEmbedDataCat(category),
      };
      if (!payload.title || !payload.content) {
        alert(t("alertTitleBodyRequired"));
        return;
      }
      if (!MagicAuth.getToken || !MagicAuth.getToken()) {
        alert("로그인이 필요합니다. 상단 메뉴의 로그인 또는 가입·등록에서 Google 로그인 후 다시 시도해 주세요.");
        return;
      }
      var subBtn = compose.querySelector(".magic-submit");
      var prevLabel = subBtn ? subBtn.textContent : "";
      if (subBtn) {
        subBtn.disabled = true;
        subBtn.textContent = "보내는 중…";
      }
      function sendPost() {
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
          if (rteCtl && typeof rteCtl.reset === "function") rteCtl.reset();
          else bodyTa.value = "";
          load();
        })
        .catch(function (e) {
          alert("올리기 실패: " + (e.message || e));
        })
        .finally(function () {
          if (subBtn) {
            subBtn.disabled = false;
            subBtn.textContent = prevLabel || "올리기";
          }
        });
      }
      if (MagicAuth.ensureFreshToken) {
        MagicAuth.ensureFreshToken(API).then(sendPost).catch(function (e) {
          alert("로그인 갱신 실패: " + (e.message || e));
          if (subBtn) {
            subBtn.disabled = false;
            subBtn.textContent = prevLabel || "올리기";
          }
        });
      } else {
        sendPost();
      }
    });

    load();

    if (liveMs >= 3000) {
      setInterval(load, liveMs);
    }
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
