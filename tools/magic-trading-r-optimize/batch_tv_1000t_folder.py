#!/usr/bin/env python3
"""
TradingView 1000틱 OHLC CSV 폴더 일괄 스캔 → 종목별 r 요약 CSV(헤더 한글, r_권장_pct 등).
권장 r 는 PnL 1위 격자를 제외한 상위 K개 r 평균(과적합 완화).
틱사이즈·틱밸류(USD)는 instrument_tick_specs.csv 의 tick_size·dollars_per_tick 으로 계산해 결과 CSV에 기록합니다.
컬럼 의미: tv1000t_r_summary_columns_ko.txt 참고.

결과는 스크립트와 같은 폴더에 UTF-8 BOM **.csv** 만 씁니다(기본: tv1000t_r_summary.csv, tv1000t_r_pnl_table.csv).
Windows 탐색기에서 확장자 숨김이면 이름만 보일 수 있으나, 실제 파일은 .csv 입니다.
**수정 시각이 안 바뀌는 것은 배치를 다시 실행하지 않았기 때문**입니다. 코드만 저장해도 CSV는 갱신되지 않습니다.

사용 예:
  python batch_tv_1000t_folder.py --dir "C:\\Users\\LG\\notebook\\tradingview 1000Tick Low Data"
  python batch_tv_1000t_folder.py --dir "G:\\내 드라이브\\tradingview 1000Tick Low Data"
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path
from types import SimpleNamespace

DIR_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR_HERE))

import optimize_magic_r as om  # noqa: E402

# 배치 결과 파일명(항상 .csv 로 저장)
DEFAULT_SUMMARY_CSV = "tv1000t_r_summary.csv"
DEFAULT_TABLE_CSV = "tv1000t_r_pnl_table.csv"


def ensure_csv_filename(name: str) -> str:
    """출력·입력 파일명을 CSV로 통일. 확장자 없거나 .CSV 가 아니면 .csv 붙임."""
    base = (name or "").strip()
    if not base:
        return DEFAULT_SUMMARY_CSV
    low = base.lower()
    if low.endswith(".csv"):
        return base
    return f"{base}.csv"

# TV 파일명 접두어(긴 것 우선 매칭) → optimize_magic_r 의 심볼 키 (tick / $ 규칙용)
PREFIX_TO_SYMBOL: list[tuple[str, str]] = [
    ("CBOT_MINI_DL_YM", "YM=F"),
    ("CME_MINI_DL_NQ", "NQ=F"),
    ("CME_MINI_DL_ES", "ES=F"),
    ("CBOT_DL_ZN", "ZN=F"),
    ("CME_DL_6E", "6E=F"),
    ("CME_DL_6J", "6J=F"),
    ("COMEX_DL_GC", "GC=F"),
    ("COMEX_DL_SI", "SI=F"),
    ("NYMEX_DL_CL", "CL=F"),
    ("KRX_DLY_K2", "K2=F"),
    ("COINBASE_BTCUSD", "BTC-USD"),
    ("COINBASE_ETHUSD", "ETH-USD"),
    ("BINANCE_BNBUSDT", "BNB-USD"),
    ("BINANCE_SOLUSDT", "SOL-USD"),
    ("BINANCE_XRPUSDT", "XRP-USD"),
    ("OANDA_EURUSD", "EURUSD=X"),
    ("BATS_AAPL", "AAPL"),
    ("BATS_TSLA", "TSLA"),
    ("BATS_NVDA", "NVDA"),
    ("BATS_ETHA", "ETHA"),
    ("CAPITALCOM_RTY", "RTY=F"),
    ("CAPITALCOM_US100", "US100_CF"),
]

# tv1000t_r_summary.csv 헤더(한글, 이 순서로 저장)
SUMMARY_KO_COLUMNS: list[str] = [
    "TV_원본파일",
    "종목_티커",
    "틱사이즈",
    "틱밸류_USD",
    "포인트당_USD",
    "봉수",
    "거래시작일",
    "거래종료일",
    "거래일수",
    "r_단일최대PnL_참고_pct",
    "r_권장_pct",
    "r_상위K평균_참고_pct",
    "상위K개수",
    "누적수익_USD_단일최대r",
    "거래수_단일최대r",
    "MDD_USD_단일최대r",
    "누적수익_USD_권장r",
    "거래당평균_USD",
    "이익_거래수",
    "손실_거래수",
    "거래수_권장r",
    "MDD_USD_권장r",
]

# 구버전 영문 요약 CSV → 한글 키 (export 등 호환)
LEGACY_EN_TO_KO: dict[str, str] = {
    "filename": "TV_원본파일",
    "mapped_symbol": "종목_티커",
    "tick_size": "틱사이즈",
    "dollars_per_tick": "틱밸류_USD",
    "dollars_per_point": "포인트당_USD",
    "bars": "봉수",
    "trade_start_date": "거래시작일",
    "trade_end_date": "거래종료일",
    "trading_days": "거래일수",
    "cum_pnl_usd_robust": "누적수익_USD_권장r",
    "avg_pnl_per_trade_usd": "거래당평균_USD",
    "win_trades": "이익_거래수",
    "loss_trades": "손실_거래수",
    "max_dd_usd_robust": "MDD_USD_권장r",
    "r_max_pnl_pct": "r_단일최대PnL_참고_pct",
    "r_robust_mean_pct": "r_권장_pct",
    "r_mean_topk_including_max_pct": "r_상위K평균_참고_pct",
    "robust_top_k": "상위K개수",
    "pnl_usd_at_max": "누적수익_USD_단일최대r",
    "pnl_usd_at_robust": "누적수익_USD_권장r",
    "trades_at_max": "거래수_단일최대r",
    "trades_at_robust": "거래수_권장r",
    "max_dd_usd_at_max": "MDD_USD_단일최대r",
    "틱가치_USD": "틱밸류_USD",
}


def normalize_summary_row_keys(row: dict) -> dict:
    """이미 한글이면 그대로, 영문(구버전)이면 한글 키로 변환."""
    if any(
        k in row
        for k in ("종목_티커", "TV_원본파일", "틱사이즈", "틱밸류_USD", "틱가치_USD")
    ):
        r = dict(row)
        if "틱가치_USD" in r and "틱밸류_USD" not in r:
            r["틱밸류_USD"] = r.get("틱가치_USD", "")
        return r
    out: dict = {}
    for k, v in row.items():
        out[LEGACY_EN_TO_KO.get(k, k)] = v
    return out


def tv_csv_to_symbol(filename: str) -> str:
    """예: 'CME_MINI_DL_NQ1!, 1000T_d7e18.csv' → NQ=F"""
    base = filename.split(",")[0].strip().upper().replace("!", "")
    for prefix, sym in PREFIX_TO_SYMBOL:
        p = prefix.upper()
        if base.startswith(p) or p in base:
            return sym
    stem = Path(filename).stem.split(",")[0].strip().upper()
    for prefix, sym in PREFIX_TO_SYMBOL:
        if stem.startswith(prefix.upper()):
            return sym
    return "UNKNOWN"


def build_korean_pnl_table_rows(rows: list[dict]) -> list[dict[str, object]]:
    """엑셀용: r·틱·기간·누적·평균·손익건수·MDD (요약과 동일 한글 키 기준)."""
    out: list[dict[str, object]] = []
    for raw in rows:
        r = normalize_summary_row_keys(raw)
        tr_s = r.get("거래수_권장r", "") or 0
        try:
            tr = int(float(tr_s))
        except (TypeError, ValueError):
            tr = 0
        wv = r.get("이익_거래수")
        lv = r.get("손실_거래수")
        if wv not in ("", None) and str(wv).strip() != "":
            wins = int(float(wv))
            loss = (
                int(float(lv))
                if lv not in ("", None) and str(lv).strip() != ""
                else tr - wins
            )
        elif lv not in ("", None) and str(lv).strip() != "":
            loss = int(float(lv))
            wins = tr - loss
        else:
            wins, loss = ("", "")
        avg = r.get("거래당평균_USD", "")
        if avg == "" or avg is None:
            avg_fmt: object = ""
        elif isinstance(avg, float) and math.isnan(avg):
            avg_fmt = ""
        else:
            try:
                avg_fmt = round(float(avg), 4)
            except (TypeError, ValueError):
                avg_fmt = avg
        cum = r.get("누적수익_USD_권장r", "")
        mdd = r.get("MDD_USD_권장r", "")
        out.append(
            {
                "종목_티커": r.get("종목_티커", ""),
                "TV_원본파일": r.get("TV_원본파일", ""),
                "틱사이즈": r.get("틱사이즈", ""),
                "틱밸류_USD": r.get("틱밸류_USD", ""),
                "포인트당_USD": r.get("포인트당_USD", ""),
                "r_단일최대PnL_참고_pct": r.get("r_단일최대PnL_참고_pct", ""),
                "r_권장_pct": r.get("r_권장_pct", ""),
                "r_상위K평균_참고_pct": r.get("r_상위K평균_참고_pct", ""),
                "거래시작일": r.get("거래시작일", ""),
                "거래종료일": r.get("거래종료일", ""),
                "거래일수": r.get("거래일수", ""),
                "총_거래수": tr,
                "이익_거래수": wins,
                "손실_거래수": loss,
                "누적수익_USD": cum,
                "거래평균_USD": avg_fmt,
                "MDD_USD": mdd,
            }
        )
    return out


def write_korean_table_csv(path: Path, table_rows: list[dict[str, object]]) -> None:
    if not table_rows:
        return
    names = list(table_rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=names)
        w.writeheader()
        w.writerows(table_rows)


def print_korean_trade_table(rows: list[dict]) -> None:
    """권장 r(robust) 백테 기준 요약 표."""
    headers = (
        "종목",
        "거래시작일",
        "거래종료일",
        "거래일수",
        "누적수익(USD)",
        "거래평균(USD)",
        "손실횟수",
        "MDD(USD)",
    )
    col_w = (12, 12, 12, 8, 14, 14, 8, 12)
    line = " | ".join(h.ljust(w)[:w] for h, w in zip(headers, col_w))
    print("\n" + "=" * len(line))
    print(line)
    print("-" * len(line))
    for raw in rows:
        r = normalize_summary_row_keys(raw)
        sym = str(r.get("종목_티커", ""))[:12]
        sd = str(r.get("거래시작일", "") or "")[:12]
        ed = str(r.get("거래종료일", "") or "")[:12]
        td = r.get("거래일수", "")
        td_s = "" if td == "" or td is None else str(int(td))
        cum = r.get("누적수익_USD_권장r", "")
        cum_s = "" if cum == "" or cum is None else f"{float(cum):,.2f}"
        avg = r.get("거래당평균_USD", "")
        if avg == "" or avg is None or (isinstance(avg, float) and math.isnan(avg)):
            avg_s = ""
        else:
            avg_s = f"{float(avg):,.2f}"
        loss = r.get("손실_거래수", "")
        loss_s = "" if loss == "" or loss is None else str(int(loss))
        mdd = r.get("MDD_USD_권장r", "")
        mdd_s = "" if mdd == "" or mdd is None else f"{float(mdd):,.2f}"
        vals = (sym, sd, ed, td_s, cum_s, avg_s, loss_s, mdd_s)
        print(" | ".join(str(v).ljust(w)[:w] for v, w in zip(vals, col_w)))
    print("=" * len(line))
    print(
        "(누적·평균·MDD·손실횟수는 권장 r=r_권장_pct 기준 백테스트입니다.)\n"
    )


def build_args_ns(ap: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        interval="1h",
        period="730d",
        exit_near_pct=ap.exit_near_pct,
        stop_buffer_pct=ap.stop_buffer_pct,
        top=ap.top,
        robust_top_k=ap.robust_top_k,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="TV 1000T OHLC 폴더 일괄 r 스캔")
    ap.add_argument(
        "--dir",
        default=r"C:\Users\LG\notebook\tradingview 1000Tick Low Data",
        help="CSV 폴더 (기본: 로컬 노트북 경로)",
    )
    ap.add_argument("--r-min", type=float, default=0.08)
    ap.add_argument("--r-max", type=float, default=1.20)
    ap.add_argument("--r-step", type=float, default=0.01)
    ap.add_argument("--exit-near-pct", type=float, default=15.0)
    ap.add_argument("--stop-buffer-pct", type=float, default=30.0)
    ap.add_argument("--top", type=int, default=5, help="터미널에 찍을 상위 격자 개수 (파일당)")
    ap.add_argument("--robust-top-k", type=int, default=10)
    ap.add_argument(
        "--csv-out",
        default=DEFAULT_SUMMARY_CSV,
        help=f"전체 요약 CSV 파일명 (기본: {DEFAULT_SUMMARY_CSV}, 확장자 없으면 .csv 추가)",
    )
    ap.add_argument(
        "--table-out",
        default=DEFAULT_TABLE_CSV,
        help=f"요약 테이블 CSV (기본: {DEFAULT_TABLE_CSV}, 확장자 없으면 .csv 추가)",
    )
    ap.add_argument("--quiet", action="store_true", help="파일당 상세 테이블 생략")
    args = ap.parse_args()
    args.csv_out = ensure_csv_filename(args.csv_out)
    args.table_out = ensure_csv_filename(args.table_out)

    folder = Path(args.dir).expanduser().resolve()
    if not folder.is_dir():
        print(f"폴더 없음: {folder}", file=sys.stderr)
        sys.exit(1)

    csv_files = sorted(folder.glob("*.csv"))
    if not csv_files:
        print(f"CSV 없음: {folder}", file=sys.stderr)
        sys.exit(1)

    grid = om.build_grid(args.r_min, args.r_max, args.r_step)
    ns = build_args_ns(args)

    out_path = DIR_HERE / args.csv_out
    table_path = DIR_HERE / args.table_out
    rows: list[dict] = []

    print(f"[batch] === 계산 시작 (아래는 ‘준비’ 안내이며, 결과 숫자가 아닙니다) ===", flush=True)
    print(f"[batch] 완료 후 CSV 저장 위치: {DIR_HERE.resolve()}", flush=True)
    print(f"[batch] 읽을 OHLC 폴더: {folder}", flush=True)
    print(f"[batch] 처리할 입력 CSV: {len(csv_files)}개", flush=True)
    print(
        f"[batch] 끝나면 여기에 저장: {out_path.name} , {table_path.name}",
        flush=True,
    )
    print(
        f"[batch] 격자 {len(grid)}점/종목 → 종목당 백테 {len(grid)}회 (봉 많으면 종목당 수 분)",
        flush=True,
    )
    print("[batch] --- 이제부터 종목별 백테 실행 ---\n", flush=True)

    n_files = len(csv_files)
    for idx, fp in enumerate(csv_files, start=1):
        sym = tv_csv_to_symbol(fp.name)
        label = fp.name
        print(f"[batch] ({idx}/{n_files}) {label}", flush=True)
        print(f"[batch]     → OHLC 읽는 중...", flush=True)
        try:
            df = om.load_ohlc_csv(str(fp))
        except Exception as exc:
            print(f"[skip] {label} → {exc}", flush=True)
            continue

        tick, dpp = om.resolve_spec(sym, None, None)
        if sym == "UNKNOWN":
            tick, dpp = (0.01, 1.0)
        dollars_per_tick = float(tick) * float(dpp)

        if not args.quiet:
            print(f"--- {label}", flush=True)
            print(f"    매핑 심볼: {sym} | bars={len(df)} | tick={tick} $/pt={dpp}", flush=True)

        print(
            f"[batch]     → {sym} 봉={len(df)} | r 격자 {len(grid)}회 백테 실행 중… (잠시 대기)",
            flush=True,
        )
        best, results = om.find_best_r(
            df,
            grid,
            exit_near_pct=ns.exit_near_pct,
            stop_buffer_pct=ns.stop_buffer_pct,
            tick=tick,
            dollars_per_point=dpp,
        )
        r_robust, n_rob = om.robust_r_exclude_best_mean(results, ns.robust_top_k)
        r_mean_incl, n_incl = om.robust_r_mean_top_k(results, ns.robust_top_k)
        rob_bt = om.backtest_simple(
            df,
            r_robust,
            exit_near_half_band_pct=ns.exit_near_pct,
            stop_buffer_half_band_pct=ns.stop_buffer_pct,
            tick=tick,
            dollars_per_point=dpp,
        )

        t_start, t_end, n_days = om.tv_ohlc_csv_time_stats(str(fp.resolve()))
        loss_ct = rob_bt.trades - rob_bt.wins
        win_ct = rob_bt.wins
        avg_trade = (
            rob_bt.pnl_usd / rob_bt.trades if rob_bt.trades else float("nan")
        )

        if not args.quiet:
            for r in results[: ns.top]:
                wr = 100.0 * r.wins / r.trades if r.trades else 0.0
                print(
                    f"    {r.r_pct:8.4f} {r.trades:7d} {wr:6.1f}% "
                    f"{r.pnl_usd:12.2f} {r.max_dd_usd:12.2f}",
                    flush=True,
                )
            print(
                f"    => r_maxPnL={best.r_pct:.4f}% | r_robust={r_robust:.4f}% "
                f"(PnL1위 제외 다음{n_rob}개 평균) | 참고 상위{n_incl}개전체={r_mean_incl:.4f}%",
                flush=True,
            )
        print(f"[batch]     → {sym} 처리 완료\n", flush=True)

        rows.append(
            {
                "TV_원본파일": label,
                "종목_티커": sym,
                "틱사이즈": tick,
                "틱밸류_USD": round(dollars_per_tick, 8),
                "포인트당_USD": round(dpp, 8),
                "봉수": len(df),
                "거래시작일": t_start,
                "거래종료일": t_end,
                "거래일수": n_days,
                "r_단일최대PnL_참고_pct": round(best.r_pct, 6),
                "r_권장_pct": round(r_robust, 6),
                "r_상위K평균_참고_pct": round(r_mean_incl, 6),
                "상위K개수": n_rob,
                "누적수익_USD_단일최대r": round(best.pnl_usd, 2),
                "거래수_단일최대r": best.trades,
                "MDD_USD_단일최대r": round(best.max_dd_usd, 2),
                "누적수익_USD_권장r": round(rob_bt.pnl_usd, 2),
                "거래당평균_USD": round(avg_trade, 4)
                if rob_bt.trades
                else "",
                "이익_거래수": win_ct,
                "손실_거래수": loss_ct,
                "거래수_권장r": rob_bt.trades,
                "MDD_USD_권장r": round(rob_bt.max_dd_usd, 2),
            }
        )

    if rows:
        with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=SUMMARY_KO_COLUMNS, extrasaction="ignore")
            w.writeheader()
            for row in rows:
                w.writerow({k: row.get(k, "") for k in SUMMARY_KO_COLUMNS})
        print(
            f"저장 완료(절대경로): {out_path.resolve()}  ({len(rows)}종목)",
            flush=True,
        )
        table_rows = build_korean_pnl_table_rows(rows)
        write_korean_table_csv(table_path, table_rows)
        print(
            f"테이블 저장(절대경로): {table_path.resolve()}  (r·틱·기간·손익·MDD)",
            flush=True,
        )
        print(
            f"필드 설명: {(DIR_HERE / 'tv1000t_r_summary_columns_ko.txt').resolve()}",
            flush=True,
        )
        print_korean_trade_table(rows)
    else:
        print("결과 행 없음.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
