/**
 * Community (boards) page — KO DOM snapshot + EN labels. Non-Korean UI lang → EN copy.
 * Tab buttons are updated per-button (preserves click listeners bound on each button).
 */
(function () {
  function resolveLang() {
    try {
      if (typeof window !== "undefined" && window.HappyUX && HappyUX.getLang) {
        return String(HappyUX.getLang() || "ko").toLowerCase();
      }
    } catch (e) {}
    return "ko";
  }

  function isKo() {
    return resolveLang() === "ko";
  }

  var KO_BANNER = {
    "": "글 목록 — 전체",
    indicator_optimizing: "개발자 일지 — 작업 기록",
    developer_journal: "개발자 일지 — 작업 기록",
    quickview: "한눈에 보기",
    announcement: "공지",
    market_analysis: "시황 분석",
    head_daily_report: "본부 데일리 업무보고",
    qa: "질문과 답변",
    general: "자유 이야기",
    beta: "베타 소식",
    event: "이벤트",
    event_1w_free: "이벤트 · 7일 무료 체험",
    event_1m_usd: "MagicTrading · 1개월 이벤트",
    event_6m_recovery: "리커버리 · 2개월",
    membership: "회원 혜택",
    reflection: "실전 이야기",
    event_promo_shoutout: "책구매·추천·홍보 인증",
  };

  var KO_CAT = {
    indicator_optimizing: "개발자 일지",
    developer_journal: "개발자 일지",
    quickview: "한눈에 보기",
    announcement: "공지",
    market_analysis: "시황 분석",
    head_daily_report: "본부 데일리 업무보고",
    qa: "질문과 답변",
    general: "자유 이야기",
    beta: "베타 소식",
    event: "이벤트",
    event_1w_free: "이벤트 · 7일 무료 체험",
    event_1m_usd: "MagicTrading · 1개월 이벤트",
    event_6m_recovery: "리커버리 · 2개월",
    membership: "회원 혜택",
    reflection: "실전 이야기",
    event_promo_shoutout: "책구매·추천·홍보 인증",
  };

  var EN_BANNER = {
    "": "Topics — All",
    indicator_optimizing: "Developer journal — work log",
    developer_journal: "Developer journal — work log",
    quickview: "Quick view",
    announcement: "Announcement",
    market_analysis: "Market outlook",
    head_daily_report: "HQ Daily report",
    qa: "Q&A",
    general: "General chat",
    beta: "Beta news",
    event: "Events",
    event_1w_free: "Event · 7-day trial",
    event_1m_usd: "MagicTrading · Whop/MQL 1-month promo",
    event_6m_recovery: "Recovery · 2-month",
    membership: "Membership perks",
    reflection: "Field stories",
    event_promo_shoutout: "Book / referral / promo proofs",
  };

  var EN_CAT = {
    indicator_optimizing: "Developer journal",
    developer_journal: "Developer journal",
    quickview: "Quick view",
    announcement: "Announcement",
    market_analysis: "Market outlook",
    head_daily_report: "HQ Daily",
    qa: "Q&A",
    general: "General",
    beta: "Beta",
    event: "Events",
    event_1w_free: "7-day trial",
    event_1m_usd: "MagicTrading 1-month",
    event_6m_recovery: "Recovery 2-month",
    membership: "Membership perks",
    reflection: "Field stories",
    event_promo_shoutout: "Promo proofs",
  };

  var TAB_ORDER = [
    "",
    "developer_journal",
    "quickview",
    "announcement",
    "market_analysis",
    "head_daily_report",
    "qa",
    "general",
    "beta",
    "event",
    "event_1w_free",
    "event_1m_usd",
    "event_6m_recovery",
    "membership",
    "reflection",
    "event_promo_shoutout",
  ];

  var EN_TABS = {
    "": { p: "All topics", s: "Everything" },
    developer_journal: { p: "Developer journal", s: "Work log" },
    quickview: { p: "Quick view", s: "Snapshots" },
    announcement: { p: "Announcements", s: "News" },
    market_analysis: { p: "Market outlook", s: "Desk notes" },
    head_daily_report: { p: "HQ daily", s: "Ops report" },
    qa: { p: "Q&A", s: "Questions" },
    general: { p: "General chat", s: "Open lounge" },
    beta: { p: "Beta news", s: "Preview" },
    event: { p: "Events", s: "Campaigns" },
    event_1w_free: { p: "7-day trial event", s: "Free pass" },
    event_1m_usd: { p: "MagicTrading · Whop/MQL (30 d)", s: "Promo SKU" },
    event_6m_recovery: { p: "Recovery (2-month)", s: "Relief tier" },
    membership: { p: "Membership perks", s: "Benefits" },
    reflection: { p: "Field stories", s: "After action" },
    event_promo_shoutout: { p: "Book / referral promo", s: "Proof posts" },
  };

  function getCap() {
    return (window.__MAGIC_BOARDS_SHELL_KO = window.__MAGIC_BOARDS_SHELL_KO || { ok: false });
  }

  function captureKoOnce() {
    var cap = getCap();
    if (cap.ok) return cap;
    try {
      cap.heroEyebrow = document.querySelector(".board-hero__eyebrow");
      cap.heroEyebrowT = cap.heroEyebrow ? cap.heroEyebrow.textContent.trim() : "";

      cap.heroTitleEl = document.getElementById("board-hero-title");
      cap.heroTitleT = cap.heroTitleEl ? cap.heroTitleEl.textContent.trim() : "";

      cap.heroLead = document.querySelector(".board-hero__lead");
      cap.heroLeadH = cap.heroLead ? cap.heroLead.innerHTML.trim() : "";

      cap.pinTitleEl = document.getElementById("board-pinned-guide-title");
      cap.pinTitleT = cap.pinTitleEl ? cap.pinTitleEl.textContent.trim() : "";

      cap.pinTextEl = document.querySelector(".board-pinned-guide__text");
      cap.pinTextH = cap.pinTextEl ? cap.pinTextEl.innerHTML.trim() : "";

      cap.pinA1 = "";
      cap.pinA2 = "";
      var pact = document.querySelector(".board-pinned-guide__actions");
      if (pact && pact.children.length >= 2) {
        cap.pinA1 = pact.children[0].outerHTML.trim();
        cap.pinA2 = pact.children[1].outerHTML.trim();
      }

      var th = document.querySelector(".board-tech-hint");
      if (th) {
        cap.techSum = th.querySelector("summary") ? th.querySelector("summary").textContent.trim() : "";
        cap.techHintH = th.querySelector(".board-api-hint") ? th.querySelector(".board-api-hint").innerHTML.trim() : "";
      }

      cap.apiLbl = document.getElementById("api-base-label");
      cap.apiLblT = cap.apiLbl ? cap.apiLbl.textContent.trim() : "";

      /** Auth labels: clone & strip fields */
      var lbls = document.querySelectorAll(".board-auth-strip label");
      cap.authLbl0Full = lbls[0]
        ? (function () {
            var c = lbls[0].cloneNode(true);
            var inp = c.querySelector("input");
            if (inp) inp.remove();
            return c.innerHTML.trim();
          })()
        : "";
      cap.authLbl1Full = lbls[1]
        ? (function () {
            var c = lbls[1].cloneNode(true);
            var s = c.querySelector("select");
            if (s) s.remove();
            return c.innerHTML.trim();
          })()
        : "";

      var emIn = document.getElementById("board-email");
      cap.authMailPh = emIn ? emIn.getAttribute("placeholder") || "" : "";

      cap.roleSel = document.getElementById("board-role");
      cap.authRoleTitle = cap.roleSel ? cap.roleSel.getAttribute("title") || "" : "";
      cap.roleOptText = [];
      if (cap.roleSel) {
        Array.prototype.forEach.call(cap.roleSel.querySelectorAll("option"), function (o) {
          cap.roleOptText.push(o.textContent.trim());
        });
      }

      var saveB = document.getElementById("board-auth-save");
      cap.authSaveT = saveB ? saveB.textContent.trim() : "";

      /** Tabs snapshot by category */
      cap.tabHtmlByCat = {};
      document.querySelectorAll(".board-cats button[role=tab]").forEach(function (btn) {
        var c = btn.getAttribute("data-cat") || "";
        cap.tabHtmlByCat[c] = btn.innerHTML;
      });

      cap.catsAria = document.querySelector("ul.board-cats")
        ? document.querySelector("ul.board-cats").getAttribute("aria-label") || ""
        : "";

      var bs = document.getElementById("board-search");
      cap.searchPh = bs ? bs.getAttribute("placeholder") || "" : "";
      cap.searchAria = bs ? bs.getAttribute("aria-label") || "" : "";

      var tbar = document.querySelector(".board-feed__toolbar");
      cap.sortToolbarAria = tbar ? tbar.getAttribute("aria-label") || "" : "";

      var slbl = document.querySelector(".board-sort-label");
      cap.sortLbl = slbl ? slbl.textContent.trim() : "";

      cap.sortSelAria = "";
      cap.sortOptNew = "";
      cap.sortOptPop = "";
      var ssel = document.getElementById("board-sort");
      if (ssel) {
        cap.sortSelAria = ssel.getAttribute("aria-label") || "";
        var on = ssel.querySelector('option[value="new"]');
        var op = ssel.querySelector('option[value="popular"]');
        if (on) cap.sortOptNew = on.textContent.trim();
        if (op) cap.sortOptPop = op.textContent.trim();
      }

      var hl = document.getElementById("board-highlights");
      cap.hlAria = hl ? hl.getAttribute("aria-label") || "" : "";

      var dc = document.querySelector("details.board-compose");
      cap.composeSummaryT = dc && dc.querySelector("summary") ? dc.querySelector("summary").textContent.trim() : "";

      var cn = document.querySelector(".board-compose__note");
      cap.composeNote0 = cn ? cn.textContent.trim() : "";

      var phin = document.getElementById("board-promo-compose-hint");
      cap.composePromoH = phin ? phin.innerHTML.trim() : "";

      cap.labTitle =
        document.querySelector("label[for=p-title]") ? document.querySelector("label[for=p-title]").textContent.trim() : "";
      cap.phTitle = "";
      var pti = document.getElementById("p-title");
      if (pti) cap.phTitle = pti.getAttribute("placeholder") || "";

      cap.labAuthor =
        document.querySelector("label[for=p-author]")
          ? document.querySelector("label[for=p-author]").textContent.trim()
          : "";
      cap.phAuthor = "";
      var pai = document.getElementById("p-author");
      if (pai) cap.phAuthor = pai.getAttribute("placeholder") || "";

      cap.labCat =
        document.querySelector("label[for=p-cat]") ? document.querySelector("label[for=p-cat]").textContent.trim() : "";

      cap.labBody =
        document.querySelector("label[for=p-body-ed]")
          ? document.querySelector("label[for=p-body-ed]").textContent.trim()
          : "";

      var ped = document.getElementById("p-body-ed");
      cap.bodyDph = ped ? ped.getAttribute("data-placeholder") || "" : "";

      var imgLab = document.querySelector(".board-compose__img-label");
      cap.imgLabT = imgLab ? imgLab.textContent.trim() : "";

      var pbtn = document.getElementById("p-body-paste-hint");
      cap.pasteT = pbtn ? pbtn.textContent.trim() : "";

      cap.refLeadH =
        document.querySelector(".board-referral__lead")
          ? document.querySelector(".board-referral__lead").innerHTML.trim()
          : "";

      cap.refMtLbl =
        document.querySelector("label[for=ref-mt5]") ? document.querySelector("label[for=ref-mt5]").textContent.trim() : "";
      cap.refMtPh = "";
      var rm5 = document.getElementById("ref-mt5");
      if (rm5) cap.refMtPh = rm5.getAttribute("placeholder") || "";

      var brs = document.getElementById("btn-referral-save");
      cap.refBtnT = brs ? brs.textContent.trim() : "";

      var bpp = document.getElementById("btn-post");
      cap.btnPostT = bpp ? bpp.textContent.trim() : "";

      cap.pCatOptTxt = {};
      var pcat = document.getElementById("p-cat");
      if (pcat) {
        Array.prototype.forEach.call(pcat.querySelectorAll("option"), function (o) {
          cap.pCatOptTxt[o.value] = o.textContent.trim();
        });
      }

      cap.promoTitleT = "";
      cap.promoLeadH = "";
      cap.promoCards = [];
      var pkg = document.getElementById("board-promo-kit");
      if (pkg) {
        var h2 = pkg.querySelector("h2");
        if (h2) cap.promoTitleT = h2.textContent.trim();
        var pl = pkg.querySelector(".board-promo-kit__lead");
        if (pl) cap.promoLeadH = pl.innerHTML.trim();
        pkg.querySelectorAll(".promo-kit-card").forEach(function (card) {
          cap.promoCards.push({
            h: card.querySelector(".promo-kit-card__h") ? card.querySelector(".promo-kit-card__h").textContent.trim() : "",
            dl: card.querySelector(".js-promo-download") ? card.querySelector(".js-promo-download").textContent.trim() : "",
            ins: card.querySelector(".js-promo-insert") ? card.querySelector(".js-promo-insert").textContent.trim() : "",
            cimg: card.querySelector(".js-promo-copy-img") ? card.querySelector(".js-promo-copy-img").textContent.trim() : "",
            curl: card.querySelector(".js-promo-copy-url") ? card.querySelector(".js-promo-copy-url").textContent.trim() : "",
          });
        });
      }

      var rtb = document.querySelector(".board-compose .board-rte-toolbar");
      cap.rteToolbarH = rtb ? rtb.innerHTML : "";

      var vw0 = document.getElementById("board-category-total-views");
      cap.boardViewsTitleKo = vw0 ? vw0.getAttribute("title") || "" : "";

      cap.ok = true;
    } catch (_e) {
      cap.ok = true;
    }
    return cap;
  }

  function setTabHtml(cat, html) {
    var btn = document.querySelector('.board-cats button[role="tab"][data-cat="' + cat + '"]');
    if (btn && html != null) btn.innerHTML = html;
  }

  function setTabEn(cat, primary, slug) {
    var btn = document.querySelector('.board-cats button[role="tab"][data-cat="' + cat + '"]');
    if (!btn) return;
    btn.innerHTML =
      primary + "\n              " + '<span class="cat-slug">' + slug + "</span>\n            ";
  }

  function applyFeedCompose(lgKo) {
    var cap = captureKoOnce();
    if (lgKo) {
      var ulc = document.querySelector("ul.board-cats");
      if (ulc && cap.catsAria) ulc.setAttribute("aria-label", cap.catsAria);

      var bse = document.getElementById("board-search");
      if (bse) {
        if (cap.searchPh) bse.setAttribute("placeholder", cap.searchPh);
        if (cap.searchAria) bse.setAttribute("aria-label", cap.searchAria);
      }
      var tbe = document.querySelector(".board-feed__toolbar");
      if (tbe && cap.sortToolbarAria) tbe.setAttribute("aria-label", cap.sortToolbarAria);
      var sle = document.querySelector(".board-sort-label");
      if (sle && cap.sortLbl) sle.textContent = cap.sortLbl;
      var sortSelE = document.getElementById("board-sort");
      if (sortSelE) {
        if (cap.sortSelAria) sortSelE.setAttribute("aria-label", cap.sortSelAria);
        var on = sortSelE.querySelector('option[value="new"]');
        var op = sortSelE.querySelector('option[value="popular"]');
        if (on && cap.sortOptNew) on.textContent = cap.sortOptNew;
        if (op && cap.sortOptPop) op.textContent = cap.sortOptPop;
      }
      var hle = document.getElementById("board-highlights");
      if (hle && cap.hlAria) hle.setAttribute("aria-label", cap.hlAria);

      var detE = document.querySelector("details.board-compose summary");
      if (detE && cap.composeSummaryT) detE.textContent = cap.composeSummaryT;
      var n0 = document.querySelector(".board-compose__note");
      if (n0 && cap.composeNote0) n0.textContent = cap.composeNote0;
      var promoE = document.getElementById("board-promo-compose-hint");
      if (promoE && cap.composePromoH) promoE.innerHTML = cap.composePromoH;

      var ltt = document.querySelector("label[for=p-title]");
      if (ltt && cap.labTitle) ltt.textContent = cap.labTitle;
      var ptt = document.getElementById("p-title");
      if (ptt && cap.phTitle) ptt.setAttribute("placeholder", cap.phTitle);
      var lae = document.querySelector("label[for=p-author]");
      if (lae && cap.labAuthor) lae.textContent = cap.labAuthor;
      var pae = document.getElementById("p-author");
      if (pae && cap.phAuthor) pae.setAttribute("placeholder", cap.phAuthor);
      var lce = document.querySelector("label[for=p-cat]");
      if (lce && cap.labCat) lce.textContent = cap.labCat;
      var lbe = document.querySelector("label[for=p-body-ed]");
      if (lbe && cap.labBody) lbe.textContent = cap.labBody;
      var ede = document.getElementById("p-body-ed");
      if (ede && cap.bodyDph) ede.setAttribute("data-placeholder", cap.bodyDph);
      var ile = document.querySelector(".board-compose__img-label");
      if (ile && cap.imgLabT) ile.textContent = cap.imgLabT;
      var phe = document.getElementById("p-body-paste-hint");
      if (phe && cap.pasteT) phe.textContent = cap.pasteT;
      var rle = document.querySelector(".board-referral__lead");
      if (rle && cap.refLeadH) rle.innerHTML = cap.refLeadH;
      var rme = document.querySelector("label[for=ref-mt5]");
      if (rme && cap.refMtLbl) rme.textContent = cap.refMtLbl;
      var rmie = document.getElementById("ref-mt5");
      if (rmie && cap.refMtPh) rmie.setAttribute("placeholder", cap.refMtPh);
      var rbe = document.getElementById("btn-referral-save");
      if (rbe && cap.refBtnT) rbe.textContent = cap.refBtnT;
      var bpe = document.getElementById("btn-post");
      if (bpe && cap.btnPostT) bpe.textContent = cap.btnPostT;

      var pce = document.getElementById("p-cat");
      if (pce && cap.pCatOptTxt) {
        Array.prototype.forEach.call(pce.querySelectorAll("option"), function (op) {
          var t0 = cap.pCatOptTxt[op.value];
          if (t0) op.textContent = t0;
        });
      }

      var pk = document.getElementById("board-promo-kit");
      if (pk) {
        var h2 = pk.querySelector("h2");
        if (h2 && cap.promoTitleT) h2.textContent = cap.promoTitleT;
        var pl = pk.querySelector(".board-promo-kit__lead");
        if (pl && cap.promoLeadH) pl.innerHTML = cap.promoLeadH;
        var cards = pk.querySelectorAll(".promo-kit-card");
        cards.forEach(function (card, ix) {
          var d = cap.promoCards[ix];
          if (!d) return;
          var hh = card.querySelector(".promo-kit-card__h");
          if (hh && d.h) hh.textContent = d.h;
          var b1 = card.querySelector(".js-promo-download");
          if (b1 && d.dl) b1.textContent = d.dl;
          var b2 = card.querySelector(".js-promo-insert");
          if (b2 && d.ins) b2.textContent = d.ins;
          var b3 = card.querySelector(".js-promo-copy-img");
          if (b3 && d.cimg) b3.textContent = d.cimg;
          var b4 = card.querySelector(".js-promo-copy-url");
          if (b4 && d.curl) b4.textContent = d.curl;
        });
      }

      var rtb = document.querySelector(".board-compose .board-rte-toolbar");
      if (rtb && cap.rteToolbarH) rtb.innerHTML = cap.rteToolbarH;
      return;
    }

    var ulc = document.querySelector("ul.board-cats");
    if (ulc) ulc.setAttribute("aria-label", "Community areas");

    var bs = document.getElementById("board-search");
    if (bs) {
      bs.setAttribute("placeholder", "Search title or body");
      bs.setAttribute("aria-label", "Search title or body");
    }
    var tb = document.querySelector(".board-feed__toolbar");
    if (tb) tb.setAttribute("aria-label", "List tools");
    var sl = document.querySelector(".board-sort-label");
    if (sl) sl.textContent = "Sort";
    var ssort = document.getElementById("board-sort");
    if (ssort) {
      ssort.setAttribute("aria-label", "Sort topics");
      var on = ssort.querySelector('option[value="new"]');
      var op = ssort.querySelector('option[value="popular"]');
      if (on) on.textContent = "Newest";
      if (op) op.textContent = "Popular (views)";
    }
    var hl = document.getElementById("board-highlights");
    if (hl) hl.setAttribute("aria-label", "Trending this week");

    var dsum = document.querySelector("details.board-compose summary");
    if (dsum) dsum.textContent = "Create a post";

    var n0e = document.querySelector(".board-compose__note");
    if (n0e) n0e.textContent = "Posts publish when your login matches the simulated role.";

    var phin = document.getElementById("board-promo-compose-hint");
    if (phin) {
      phin.innerHTML =
        '<strong>Book / referral / promo proofs</strong> — Provide one compliant link or one screenshot when required. Referrals count once invitees sustain a paid plan for one month.';
    }

    var _lt = document.querySelector("label[for=p-title]");
    if (_lt) _lt.textContent = "Title";
    var _pt = document.getElementById("p-title");
    if (_pt) _pt.setAttribute("placeholder", "Short headline");

    var _la = document.querySelector("label[for=p-author]");
    if (_la) _la.textContent = "Author (email)";
    var _pa = document.getElementById("p-author");
    if (_pa) _pa.setAttribute("placeholder", "Matches the sandbox email");

    var _lc = document.querySelector("label[for=p-cat]");
    if (_lc) _lc.textContent = "Board";
    var _lb = document.querySelector("label[for=p-body-ed]");
    if (_lb) _lb.textContent = "Body (rich text supported)";

    var _pe = document.getElementById("p-body-ed");
    if (_pe)
      _pe.setAttribute(
        "data-placeholder",
        "Paste URLs or screenshots. Highlight text to change size / colour.",
      );

    var _iml = document.querySelector(".board-compose__img-label");
    if (_iml) _iml.textContent = "Choose file";

    var _php = document.getElementById("p-body-paste-hint");
    if (_php) _php.textContent = "Paste image: focus editor, then Ctrl+V";

    var _rl = document.querySelector(".board-referral__lead");
    if (_rl)
      _rl.innerHTML =
        "<strong>Optional referral capture</strong> — Store a friend's TRV username or MT5 credentials. Credits apply after they keep paid access for ≥1 month.";

    var _rml = document.querySelector("label[for=ref-mt5]");
    if (_rml) _rml.textContent = "MT5 invitee";

    var _rmi = document.getElementById("ref-mt5");
    if (_rmi) _rmi.setAttribute("placeholder", "Login or account number");

    var _rbs = document.getElementById("btn-referral-save");
    if (_rbs) _rbs.textContent = "Save referral";

    var _bps = document.getElementById("btn-post");
    if (_bps) _bps.textContent = "Publish";

    var pcee = document.getElementById("p-cat");
    if (pcee) {
      Array.prototype.forEach.call(pcee.querySelectorAll("option"), function (op) {
        if (EN_CAT[op.value]) op.textContent = EN_CAT[op.value];
      });
    }

    var pkg = document.getElementById("board-promo-kit");
    if (pkg) {
      var h22 = pkg.querySelector("h2");
      if (h22) h22.textContent = "Share-ready promo PNGs";

      var pl2 = pkg.querySelector(".board-promo-kit__lead");
      if (pl2)
        pl2.innerHTML =
          "Drop CI, legal trading name and the Magic homepage badge into SNS-ready overlays. <strong>Save PNG</strong>, <strong>insert into post</strong>, or attempt <strong>Copy image</strong> when the browser permits.";

      var metaC = [
        {
          h: "Chart showcase (MagicLine)",
          dl: "Save PNG",
          ins: "Insert into draft",
          cimg: "Copy image",
          curl: "Copy homepage URL only",
        },
        {
          h: "Welcome poster",
          dl: "Save PNG",
          ins: "Insert into draft",
          cimg: "Copy image",
          curl: "Copy homepage URL only",
        },
      ];
      pkg.querySelectorAll(".promo-kit-card").forEach(function (card, ix) {
        var m = metaC[ix];
        if (!m) return;
        card.querySelector(".promo-kit-card__h").textContent = m.h;
        card.querySelector(".js-promo-download").textContent = m.dl;
        card.querySelector(".js-promo-insert").textContent = m.ins;
        card.querySelector(".js-promo-copy-img").textContent = m.cimg;
        card.querySelector(".js-promo-copy-url").textContent = m.curl;
      });
    }

    var tbR = document.querySelector(".board-compose .board-rte-toolbar");
    if (tbR) {
      tbR.setAttribute("aria-label", "Formatting tools");
      var rows = tbR.querySelectorAll(".board-rte-toolbar-row");
      if (rows[0]) rows[0].setAttribute("aria-label", "Fonts & colours");
      if (rows[1]) rows[1].setAttribute("aria-label", "Paragraph & media");

      function setBtn(cmd, title, aria) {
        var b = tbR.querySelector('[data-rte-cmd="' + cmd + '"]');
        if (b) {
          if (title) b.setAttribute("title", title);
          if (aria) b.setAttribute("aria-label", aria);
        }
      }
      setBtn("bold", "Bold", "Bold");
      setBtn("italic", "Italic", "Italic");
      setBtn("underline", "Underline", "Underline");

      var ffs = tbR.querySelector(".board-rte-select--font");
      if (ffs) {
        ffs.setAttribute("title", "Font (selection)");
        ffs.setAttribute("aria-label", "Font family");
        var fo = ffs.querySelector('option[value=""]');
        if (fo) fo.textContent = "Family";
      }
      var fz = tbR.querySelector('select[data-rte-role="font-size"]');
      if (fz) {
        fz.setAttribute("title", "Font size");
        fz.setAttribute("aria-label", "Font size");
        var foz = fz.querySelector('option[value=""]');
        if (foz) foz.textContent = "Size";
      }

      var chips = tbR.querySelectorAll(".board-rte-color-chip-text");
      if (chips[0]) chips[0].textContent = "Text";
      if (chips[1]) chips[1].textContent = "Highlight";

      var orderBtn = tbR.querySelectorAll("button[data-rte-cmd],button[data-rte-action]");
      if (orderBtn[3]) orderBtn[3].setAttribute("title", "Subheading");
      if (orderBtn[4]) orderBtn[4].setAttribute("title", "Paragraph");
      if (orderBtn[5]) orderBtn[5].setAttribute("title", "Quote");
      if (orderBtn[6]) orderBtn[6].setAttribute("title", "Code block");
      if (orderBtn[7]) {
        orderBtn[7].setAttribute("title", "Bullets");
        orderBtn[7].setAttribute("aria-label", "Bullets");
      }
      if (orderBtn[8]) {
        orderBtn[8].setAttribute("title", "Numbered list");
        orderBtn[8].setAttribute("aria-label", "Numbered list");
      }
      if (orderBtn[9]) orderBtn[9].setAttribute("title", "Divider");
      if (orderBtn[10]) {
        orderBtn[10].setAttribute("title", "Insert link");
        orderBtn[10].setAttribute("aria-label", "Link");
      }

      var imb = document.getElementById("rte-board-img");
      if (imb) {
        imb.setAttribute("title", "Embed an image attachment");
        imb.setAttribute("aria-label", "Insert image");
        imb.textContent = "🖼 Image";
      }
      var fib = document.getElementById("rte-board-file");
      if (fib) {
        fib.setAttribute("title", "Opens the picker below");
        fib.setAttribute("aria-label", "Attach file");
        fib.textContent = "📎 File";
      }
    }
  }

  function applyHeroPinnedTechAuth(lgKo) {
    var cap = captureKoOnce();
    var meta = document.querySelector('meta[name="api-base"]');
    var API = ((meta && meta.content) || "https://magicindicatorglobal.com").replace(/\/$/, "");

    if (lgKo) {
      if (cap.heroEyebrow && cap.heroEyebrowT) cap.heroEyebrow.textContent = cap.heroEyebrowT;
      /** `#board-hero-title` 구역명은 boards/index 의 `setActiveTab` 만 갱신(쿼리 `?board=` 일치 유지).
       * 초기 KO 스냅샷이 항상 «모임터»라 applyBoardChrome·언어 재적용 시 덮어써 깨졌던 문제 회피. */
      if (cap.heroLead && cap.heroLeadH) cap.heroLead.innerHTML = cap.heroLeadH;

      if (cap.pinTitleEl && cap.pinTitleT) cap.pinTitleEl.textContent = cap.pinTitleT;
      if (cap.pinTextEl && cap.pinTextH) cap.pinTextEl.innerHTML = cap.pinTextH;
      var pa = document.querySelector(".board-pinned-guide__actions");
      if (pa && cap.pinA1 && cap.pinA2) pa.innerHTML = cap.pinA1 + "\n          " + cap.pinA2;

      var th = document.querySelector(".board-tech-hint");
      if (th && cap.techSum != null && th.querySelector("summary"))
        th.querySelector("summary").textContent = cap.techSum;
      if (th && cap.techHintH && th.querySelector(".board-api-hint"))
        th.querySelector(".board-api-hint").innerHTML = cap.techHintH;
      var ap = document.getElementById("api-base-label");
      if (ap) ap.textContent = cap.apiLblT || API;

      /** auth */
      var lbls = document.querySelectorAll(".board-auth-strip label");
      if (lbls[0] && cap.authLbl0Full) {
        var em = lbls[0].querySelector("#board-email");
        lbls[0].innerHTML = cap.authLbl0Full + "\n          ";
        if (em) lbls[0].appendChild(em);
      }
      if (lbls[1] && cap.authLbl1Full) {
        var rs = lbls[1].querySelector("#board-role");
        lbls[1].innerHTML = cap.authLbl1Full + "\n          ";
        if (rs) lbls[1].appendChild(rs);
      }
      var emIn = document.getElementById("board-email");
      if (emIn && cap.authMailPh != null) emIn.setAttribute("placeholder", cap.authMailPh);

      cap.roleSel = document.getElementById("board-role");
      if (cap.roleSel) {
        if (cap.authRoleTitle) cap.roleSel.setAttribute("title", cap.authRoleTitle);
        Array.prototype.forEach.call(cap.roleSel.querySelectorAll("option"), function (o, ix) {
          if (cap.roleOptText[ix] != null) o.textContent = cap.roleOptText[ix];
        });
      }

      var saveB = document.getElementById("board-auth-save");
      if (saveB && cap.authSaveT != null) saveB.textContent = cap.authSaveT;
      return;
    }

    if (cap.heroEyebrow) cap.heroEyebrow.textContent = "Community · Live";
    if (cap.heroTitleEl) cap.heroTitleEl.textContent = "Community lounge";
    if (cap.heroLead)
      cap.heroLead.textContent =
        "Read, contribute, reply—stay unhurried. Topic labels follow the locale you chose in the toolbar.";

    if (cap.pinTitleEl)
      cap.pinTitleEl.textContent = "TradingView MagicTrading — Inputs & tuning";
    if (cap.pinTextEl) {
      cap.pinTextEl.innerHTML =
        "Condensed explanation of <strong>Entry Mode, Adjust, Signals, Risk</strong> inside <strong>Inputs</strong>—fine-tune presets, webhook JSON, references.";
    }
    var paEn = document.querySelector(".board-pinned-guide__actions");
    if (paEn && paEn.children.length >= 2) {
      paEn.children[0].textContent = "Full tuning guide";
      paEn.children[1].textContent = "TRV cheat sheet";
    }

    var the = document.querySelector(".board-tech-hint");
    if (the && the.querySelector("summary")) the.querySelector("summary").textContent = "Connectivity (engineering)";
    if (the && the.querySelector(".board-api-hint")) {
      the.querySelector(".board-api-hint").innerHTML =
        'Server endpoint <span id="api-base-label">' + escapeHtml(API) + "</span>";
    }
    var apFresh = document.getElementById("api-base-label");
    if (apFresh) apFresh.textContent = API;

    var lbl0 = document.querySelectorAll(".board-auth-strip label");
    if (lbl0[0]) {
      var em = lbl0[0].querySelector("#board-email");
      lbl0[0].innerHTML = "Login email\n          ";
      if (em) lbl0[0].appendChild(em);
    }
    if (lbl0[1]) {
      var rss = lbl0[1].querySelector("#board-role");
      lbl0[1].innerHTML = "Board role\n          ";
      if (rss) lbl0[1].appendChild(rss);
    }
    var ein = document.getElementById("board-email");
    if (ein) ein.setAttribute("placeholder", "you@example.com");

    var rsel = document.getElementById("board-role");
    if (rsel) {
      rsel.setAttribute("title", "Sandbox role for previews");
      var roleLabelsEn = ["Visitor", "Free member", "Trial", "Subscriber", "VIP community", "Operator"];
      Array.prototype.forEach.call(rsel.querySelectorAll("option"), function (opt, ix) {
        opt.textContent = (roleLabelsEn[ix] ? roleLabelsEn[ix] + " (" + opt.value + ")" : "(" + opt.value + ")");
      });
    }

    var sav = document.getElementById("board-auth-save");
    if (sav) sav.textContent = "Apply";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyBoardChrome() {
    var ko = isKo();
    captureKoOnce();
    applyHeroPinnedTechAuth(ko);
    TAB_ORDER.forEach(function (cat) {
      if (ko) {
        var h = getCap().tabHtmlByCat[cat];
        setTabHtml(cat, h);
      } else if (EN_TABS[cat]) {
        setTabEn(cat, EN_TABS[cat].p, EN_TABS[cat].s);
      }
    });
    applyFeedCompose(ko);
    var vw = document.getElementById("board-category-total-views");
    if (vw) {
      vw.setAttribute(
        "title",
        ko
          ? getCap().boardViewsTitleKo || "이 구역 글 조회 합계"
          : "Combined views for posts in this zone",
      );
    }
  }

  function msg(key) {
    var ko = isKo();
    /** Central copy for KO/EN toggles inline JS may call directly */
    var KO = {
      loading: "불러오는 중이에요…",
      connectionError: "연결이 끊겼어요. 아래 버튼으로 다시 시도해 주세요.",
      toastFail: "글 목록을 불러오지 못했어요.",
      toastRetry: "다시 시도",
      viewsPrefix: "전체 조회 합계 · ",
      viewsDash: "전체 조회 합계 · —",
      viewsEllipsis: "전체 조회 합계 · …",
      viewsDeniedTitle: "이 구역 글 열람 권한이 없어 합계를 표시할 수 없습니다.",
      viewsErrorTitle: "목록을 불러오지 못해 합계를 표시할 수 없습니다.",
      viewsOkTitle: "현재 선택한 구역(필터·검색과 무관)에 올라온 모든 글의 조회수 합계",
      deniedPrefix: "이 구역은 아직 열람할 수 없어요",
      deniedRole: "(현재 권한: ",
      permissionOpen: " (현재 권한: ",
      deniedEmptyList: "이 모임은 게시판 권한에 따라 열려 있어요. 가입·권한 안내를 봐 주세요.",
      hlPopular: '<div class="board-hl-label">많이 본 글</div>',
      hlComments: '<div class="board-hl-label">댓글이 많은 글</div>',
      noTitle: "(제목 없음)",
      toggleOpen: "답글 펼치기",
      toggleClose: "접기",
      threadPlaceholder: "따뜻한 말 한마디",
      replyBtn: "답 남기기",
      threadDeny: "이 구역에는 아직 댓글을 남길 수 없어요. 게시판 권한을 확인해 주세요.",
      statsComments: function (cc) {
        return "댓글 " + cc;
      },
      statLineVC: function (v, cc) {
        return "조회 " + v + " · 댓글 " + cc;
      },
      statLineCV: function (cc, v) {
        return "댓글 " + cc + " · 조회 " + v;
      },
      badgeViews: function (vv) {
        return "조회 " + vv;
      },
      viewsAria: function (vv) {
        return "조회수 " + vv;
      },
      bannerFallback: "글 목록",
      sortNew: "최신순",
      sortPopular: "인기순(조회)",
      emptyNoSearch: "아직 글이 없어요. 첫 이야기를 남겨 보시겠어요?",
      emptyQuiet: "여기는 조용하네요. 아래 ‘새 글 올리기’에서 첫 글을 남겨 주세요.",
      emptySearchHint: "다른 검색어를 써 보시거나, 검색창을 비우면 전체 목록이 돌아와요.",
      noneSearch: function (raw, lab) {
        return "검색에 맞는 글이 없어요. (이 구역 글 " + raw + "개 중 · " + lab + ")";
      },
      searchMixed: function (n, raw, lab) {
        return "검색 결과 " + n + "개 · 전체 " + raw + "개 · " + lab;
      },
      totalLine: function (n, lab) {
        return "총 " + n + "개 · " + lab;
      },
      postSending: "보내는 중이에요…",
      postWarn: function (txt) {
        return "잠시 문제가 있어요: " + txt;
      },
      recovery: "게시글 등록 완료. 2개월 리커버리 쿠폰 처리를 진행합니다…",
      postedOk: "올렸어요. 고마워요!",
      refBusy: "등록 중…",
      refFail: "등록에 실패했어요.",
      refOk: function (t) {
        return "등록했어요. 누적 " + t + "건이에요.";
      },
      refHint: function (n) {
        return "누적 피추천 등록 " + n + "건 · 정규 플랜 최소 1개월 유지 시 추천 인정";
      },
    };
    var EN = {
      loading: "Loading…",
      connectionError: "We lost the connection—tap retry below.",
      toastFail: "Could not load topics.",
      toastRetry: "Retry",
      viewsPrefix: "Combined views · ",
      viewsDash: "Combined views · —",
      viewsEllipsis: "Combined views · …",
      viewsDeniedTitle: "Totals hidden for your role.",
      viewsErrorTitle: "Totals unavailable (list failed).",
      viewsOkTitle: "Sum of views across every post in this zone.",
      deniedPrefix: "This zone is not readable yet",
      deniedRole: "(role: ",
      permissionOpen: " (role: ",
      deniedEmptyList: "Posting opens per membership—check onboarding notes.",
      hlPopular: '<div class="board-hl-label">Trending reads</div>',
      hlComments: '<div class="board-hl-label">Buzzing replies</div>',
      noTitle: "(Untitled)",
      toggleOpen: "Show replies",
      toggleClose: "Hide",
      threadPlaceholder: "Thoughtful reply…",
      replyBtn: "Post reply",
      threadDeny: "Your role cannot comment in this zone yet.",
      statsComments: function (cc) {
        return cc + " comments";
      },
      statLineVC: function (v, cc) {
        return v + " views · " + cc + " comments";
      },
      statLineCV: function (cc, v) {
        return cc + " comments · " + v + " views";
      },
      badgeViews: function (vv) {
        return vv + " views";
      },
      viewsAria: function (vv) {
        return vv + " views";
      },
      bannerFallback: "Topics",
      sortNew: "Newest first",
      sortPopular: "Popular (views)",
      emptyNoSearch: "Nothing posted yet — start the story?",
      emptyQuiet: 'Quiet zone — expand “Create a post” below.',
      emptySearchHint: "Try other keywords or clear the search.",
      noneSearch: function (raw, lab) {
        return "No matches (" + raw + " posts · " + lab + ")";
      },
      searchMixed: function (n, raw, lab) {
        return "Matches " + n + " · zone total " + raw + " · " + lab;
      },
      totalLine: function (n, lab) {
        return n + " threads · " + lab;
      },
      postSending: "Publishing…",
      postWarn: function (txt) {
        return "Server said: " + txt;
      },
      recovery: "Saved. Applying the recovery coupon flow…",
      postedOk: "Published—thank you!",
      refBusy: "Saving…",
      refFail: "Could not save referral.",
      refOk: function (t) {
        return "Recorded. Lifetime invites: " + t + ".";
      },
      refHint: function (n) {
        return "Captured referrals " + n + " · Paid plan stays ≥1 month to qualify.";
      },
    };

    var m = ko ? KO : EN;
    var val = m[key];
    if (typeof val === "function") {
      /** caller must invoke with proper args separately */
      return val;
    }
    return val;
  }

  function tables() {
    return {
      bannerTitles: isKo() ? KO_BANNER : EN_BANNER,
      catLabels: isKo() ? KO_CAT : EN_CAT,
    };
  }

  window.MagicBoardsUiI18n = {
    captureKoBaseline: captureKoOnce,
    applyBoardChrome: applyBoardChrome,
    tables: tables,
    msg: msg,
    localeNumForPosts: function () {
      return isKo() ? "ko-KR" : "en-US";
    },
  };
})();
