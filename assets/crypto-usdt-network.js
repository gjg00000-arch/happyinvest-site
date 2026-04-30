/**
 * USDT 표기 블록체인 목록 로드 · 검색 + 셀렉트 · 참조표.
 * 결제 페이지(billing/index.html)에서 호출합니다.
 */
(function (global) {
  "use strict";

  var STORE = [];

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function filterList(q, arr) {
    var needle = norm(q);
    if (!needle) return arr.slice();
    return arr.filter(function (row) {
      var hay = norm(row.label + " " + (row.search || "") + " " + row.id);
      return hay.indexOf(needle) !== -1;
    });
  }

  function buildSelect(sel, rows, currentId) {
    var prev = "";
    if (currentId && rows.some(function (r) { return r.id === currentId; })) {
      prev = currentId;
    } else if (currentId && STORE.some(function (r) { return r.id === currentId; })) {
      prev = currentId;
    }
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— USDT 체인(네트워크) 선택 —";
    sel.appendChild(ph);
    rows.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = "USDT · " + r.label;
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

  function fillTable(tb) {
    if (!tb) return;
    tb.innerHTML = "";
    STORE.forEach(function (r, i) {
      var tr = document.createElement("tr");
      function td(v, isHtml) {
        var c = document.createElement("td");
        if (isHtml) {
          c.innerHTML = v;
        } else {
          c.textContent = v;
        }
        return c;
      }
      tr.appendChild(td(String(i + 1), false));
      tr.appendChild(td("<strong>USDT</strong>", true));
      tr.appendChild(td(r.label, false));
      tr.appendChild(
        td(
          '<code style="font-size:0.78rem;word-break:break-all">' + escapeHtml(r.id) + "</code>",
          true
        )
      );
      tb.appendChild(tr);
    });
  }

  function init(opts) {
    var jsonUrl = (opts && opts.jsonUrl) || "../assets/usdt-networks.json";
    var sel = document.getElementById("crypto-usdt-network");
    var filt = document.getElementById("crypto-usdt-filter");
    var wrap = document.getElementById("crypto-usdt-network-wrap");
    var curSel = document.getElementById("crypto-currency");
    var tb = document.getElementById("usdt-chain-ref-body");
    var refSearch = document.getElementById("usdt-chain-ref-filter");

    if (!sel || !wrap) return;

    function toggleUsdtChrome() {
      var isUsdt = curSel && curSel.value === "usdt";
      wrap.hidden = !isUsdt;
      if (!isUsdt) {
        sel.removeAttribute("required");
        sel.disabled = true;
      } else {
        sel.required = true;
        sel.disabled = STORE.length === 0;
      }
    }

    if (curSel) {
      curSel.addEventListener("change", toggleUsdtChrome);
      toggleUsdtChrome();
    }

    fetch(jsonUrl, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("bad json");
        STORE = data;
        buildSelect(sel, STORE, "");
        fillTable(tb);
        toggleUsdtChrome();

        function applyFilterInput() {
          var q = (filt && filt.value) || "";
          var filtered = filterList(q, STORE);
          var cur = sel.value;
          buildSelect(sel, filtered, cur);
        }

        if (filt) {
          filt.addEventListener("input", applyFilterInput);
          filt.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              var filtered = filterList(filt.value, STORE);
              if (filtered.length === 1) sel.value = filtered[0].id;
            }
          });
        }

        if (refSearch && tb) {
          refSearch.addEventListener("input", function () {
            var needle = norm(refSearch.value);
            [].slice.call(tb.querySelectorAll("tr")).forEach(function (tr) {
              var rowText = "";
              try {
                rowText =
                  norm(tr.cells[2] && tr.cells[2].textContent) +
                  " " +
                  norm(tr.cells[3] && tr.cells[3].textContent);
              } catch (_) {}
              var show = !needle || rowText.indexOf(needle) !== -1;
              tr.style.display = show ? "" : "none";
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
    if (!sel || !wrap || wrap.hidden) return "";
    return (sel.value || "").trim();
  };
})(typeof window !== "undefined" ? window : this);
