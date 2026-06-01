#!/usr/bin/env python3
"""
이미 생성된 tv1000t_r_summary.csv → 한글 헤더 테이블 CSV만 추출 (배치 재실행 없이).

  python export_tv_table_from_summary.py
  python export_tv_table_from_summary.py --in tv1000t_r_summary.csv --out my_table.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

DIR_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR_HERE))

from batch_tv_1000t_folder import (  # noqa: E402
    DEFAULT_SUMMARY_CSV,
    DEFAULT_TABLE_CSV,
    build_korean_pnl_table_rows,
    ensure_csv_filename,
    normalize_summary_row_keys,
    write_korean_table_csv,
)


def main() -> None:
    ap = argparse.ArgumentParser(description="요약 CSV에서 r·손익 테이블만 추출")
    ap.add_argument(
        "--in",
        dest="inp",
        default=DEFAULT_SUMMARY_CSV,
        help=f"입력 요약 CSV (기본: {DEFAULT_SUMMARY_CSV}, 확장자 없으면 .csv 추가)",
    )
    ap.add_argument(
        "--out",
        default=DEFAULT_TABLE_CSV,
        help=f"출력 테이블 CSV (기본: {DEFAULT_TABLE_CSV}, 확장자 없으면 .csv 추가)",
    )
    args = ap.parse_args()
    args.inp = ensure_csv_filename(args.inp)
    args.out = ensure_csv_filename(args.out)

    src = (DIR_HERE / args.inp).resolve()
    if not src.is_file():
        print(f"파일 없음: {src}", file=sys.stderr)
        sys.exit(1)

    with open(src, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    norm: list[dict] = []
    for r in rows:
        row = normalize_summary_row_keys(dict(r))
        tr_s = row.get("거래수_권장r", "") or 0
        try:
            tr = int(float(tr_s))
        except (TypeError, ValueError):
            tr = 0
        loss_raw = (row.get("손실_거래수") or "").strip()
        win_raw = (row.get("이익_거래수") or "").strip()
        if win_raw not in ("", "None"):
            wins = int(float(win_raw))
            loss = tr - wins
        elif loss_raw not in ("", "None"):
            loss = int(float(loss_raw))
            wins = tr - loss
        else:
            wins, loss = ("", "")
        ts = (row.get("틱사이즈") or "").strip()
        dpt = (row.get("틱밸류_USD") or row.get("틱가치_USD") or "").strip()
        dpp = (row.get("포인트당_USD") or "").strip()
        if ts and not dpt and dpp:
            try:
                dpt = str(round(float(ts) * float(dpp), 8))
            except ValueError:
                pass
        avg_raw = row.get("거래당평균_USD", "")
        avg_val: object = ""
        if avg_raw not in ("", None):
            try:
                x = float(avg_raw)
                avg_val = round(x, 4) if not math.isnan(x) else ""
            except ValueError:
                avg_val = avg_raw
        row["거래수_권장r"] = tr
        row["손실_거래수"] = loss
        row["이익_거래수"] = wins
        row["틱사이즈"] = ts or row.get("틱사이즈", "")
        row["틱밸류_USD"] = dpt or row.get("틱밸류_USD", "") or row.get("틱가치_USD", "")
        row["포인트당_USD"] = dpp or row.get("포인트당_USD", "")
        row["거래당평균_USD"] = avg_val
        norm.append(row)

    table = build_korean_pnl_table_rows(norm)
    out = (DIR_HERE / args.out).resolve()
    write_korean_table_csv(out, table)
    print(f"저장(절대경로): {out.resolve()}  ({len(table)}행)")


if __name__ == "__main__":
    main()
