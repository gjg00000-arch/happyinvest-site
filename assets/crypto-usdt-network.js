/**
 * USDT 표기 블록체인 목록 로드 · 검색 + 셀렉트 · 참조표.
 * 결제 페이지(billing/index.html)에서 호출합니다.
 */
(function (global) {
  "use strict";

  /** CDN·구버전 JSON이 섞여 와도 UI는 레저 허용 ID만 사용 */
  var LEDGER_USDT_IDS = ["tron-trc20", "solana-spl", "polygon-pos", "arbitrum-one"];

  var STORE = [];

  function clampStoreToLedger(rows) {
    if (!Array.isArray(rows)) return [];
    var byId = {};
    rows.forEach(function (r) {
      if (r && r.id) byId[r.id] = r;
    });
    return LEDGER_USDT_IDS.map(function (id) {
      return (
        byId[id] || {
          id: id,
          label: id,
          search: id,
        }
      );
    });
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** 상단 ② 코인 선택과 하단 입금 통화 중 USDT/USDC 기준 통일 */
  function getStableTickerForUi() {
    var pick = document.getElementById("crypto-pick-coin");
    var pv = pick && pick.value;
    if (pv === "usdt" || pv === "usdc") return pv;
    var cur = document.getElementById("crypto-currency");
    var cv = cur && cur.value;
    if (cv === "usdt" || cv === "usdc") return cv;
    return "";
  }

  function filterList(q, arr) {
    var needle = norm(q);
    if (!needle) return arr.slice();
    return arr.filter(function (row) {
      var hay = norm(row.label + " " + (row.search || "") + " " + row.id);
      return hay.indexOf(needle) !== -1;
    });
  }

  /** USDT: TRX·SOL·POLY / USDC: + ARB (운영 코인/네트워크 표와 동일) */
  function effectiveRows(q) {
    var tick = getStableTickerForUi();
    var base = STORE.slice();
    if (tick === "usdt") {
      base = base.filter(function (r) {
        return r.id !== "arbitrum-one";
      });
    }
    return filterList(q, base);
  }

  function buildSelect(sel, rows, currentId) {
    var tick = getStableTickerForUi();
    var lab = tick === "usdc" ? "USDC" : "USDT";
    var prev = "";
    if (currentId && rows.some(function (r) { return r.id === currentId; })) {
      prev = currentId;
    } else if (currentId && STORE.some(function (r) { return r.id === currentId; })) {
      prev = currentId;
    }
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— " + lab + " 체인(네트워크) 선택 —";
    sel.appendChild(ph);
    rows.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = lab + " · " + r.label;
      sel.appendChild(opt);
    });
    if (prev && [].slice.call(sel.options).some(function (o) { return o.value === prev; })) {
      sel.value = prev;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cryptoTicksHtml(id) {
    if (id === "arbitrum-one") {
      return '<span class="usdt-ref-tick usdt-ref-tick--usdc">USDC</span>';
    }
    return (
      '<span class="usdt-ref-tick usdt-ref-tick--usdt">USDT</span>' +
      '<span class="usdt-ref-tick-sep">·</span>' +
      '<span class="usdt-ref-tick usdt-ref-tick--usdc">USDC</span>'
    );
  }

  function fillRefList(container) {
    if (!container) return;
    container.innerHTML = "";
    STORE.forEach(function (r, i) {
      var item = document.createElement("div");
      item.className = "usdt-ref-list__item";
      item.setAttribute("role", "listitem");
      item.innerHTML =
        '<span class="usdt-ref-num">' +
        (i + 1) +
        '</span>' +
        '<div class="usdt-ref-crypto-col">' +
        cryptoTicksHtml(r.id) +
        "</div>" +
        '<div class="usdt-ref-desc">' +
        escapeHtml(r.label) +
        "</div>" +
        '<code class="usdt-ref-id">' +
        escapeHtml(r.id) +
        "</code>";
      container.appendChild(item);
    });
  }

  function init(opts) {
    var jsonUrl = (opts && opts.jsonUrl) || "../assets/usdt-networks.json?v=ledger5";
    var sel = document.getElementById("crypto-usdt-network");
    var filt = document.getElementById("crypto-usdt-filter");
    var wrap = document.getElementById("crypto-usdt-network-wrap");
    var curSel = document.getElementById("crypto-currency");
    var pickCoin = document.getElementById("crypto-pick-coin");
    var tb = document.getElementById("usdt-chain-ref-body");
    var refSearch = document.getElementById("usdt-chain-ref-filter");

    if (!sel || !wrap) return;

    function toggleUsdtChrome() {
      var t = getStableTickerForUi();
      var show = t === "usdt" || t === "usdc";
      wrap.hidden = !show;
      if (!show) {
        sel.removeAttribute("required");
        sel.disabled = true;
      } else {
        sel.required = true;
        sel.disabled = STORE.length === 0;
      }
      var titleEl = document.getElementById("crypto-stable-network-label-title");
      if (titleEl) {
        titleEl.textContent = t === "usdc" ? "USDC 체인(네트워크) *" : "USDT 체인(네트워크) *";
      }
      if (show && STORE.length) {
        try {
          buildSelect(sel, effectiveRows((filt && filt.value) || ""), sel.value);
        } catch (e) {}
      }
    }

    if (curSel) {
      curSel.addEventListener("change", toggleUsdtChrome);
    }
    if (pickCoin) {
      pickCoin.addEventListener("change", toggleUsdtChrome);
    }
    toggleUsdtChrome();

    fetch(jsonUrl, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("bad json");
        STORE = clampStoreToLedger(data);
        fillRefList(tb);
        buildSelect(sel, effectiveRows(""), "");
        toggleUsdtChrome();

        function applyFilterInput() {
          var cur = sel.value;
          buildSelect(sel, effectiveRows((filt && filt.value) || ""), cur);
        }

        if (filt) {
          filt.addEventListener("input", applyFilterInput);
          filt.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              var filtered = effectiveRows(filt.value);
              if (filtered.length === 1) sel.value = filtered[0].id;
            }
          });
        }

        if (refSearch && tb) {
          refSearch.addEventListener("input", function () {
            var needle = norm(refSearch.value);
            [].slice.call(tb.querySelectorAll(".usdt-ref-list__item")).forEach(function (el) {
              var rowText = norm(el.textContent || "");
              var show = !needle || rowText.indexOf(needle) !== -1;
              el.style.display = show ? "" : "none";
            });
          });
        }
      })
      .catch(function (e) {
        console.warn("[USDT 목록]", e);
        sel.innerHTML = '<option value="">목록 로드 실패 · 페이지 새로고침 또는 문의</option>';
      });
  }

  global.cryptoUsdtInit = init;

  global.getSelectedUsdtNetwork = function () {
    var wrap = document.getElementById("crypto-usdt-network-wrap");
    var sel = document.getElementById("crypto-usdt-network");
    var t = getStableTickerForUi();
    if (!sel || !wrap || wrap.hidden) return "";
    if (t !== "usdt" && t !== "usdc") return "";
    return (sel.value || "").trim();
  };
})(typeof window !== "undefined" ? window : this);
