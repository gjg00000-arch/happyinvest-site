# Dodam_MagicTrading_* 빌드 생성기 — magic-core-rule-strategy.pine 을 템플릿으로 사용
#
# --sheet-nine: 표 기준 9종 (Regular/1month 마켓 8 + Marketfree 1month)만 덮어쓰기 — 다른 로컬 .pine 파일은 삭제하지 않음
# --only-monthly-markets: 마켓 8개만 (Marketfree 제외)
# --all: 마켓 8 + Marketfree + Marketfree_1weekfree
#
# 실행 예:
#   python _gen-dodam-variants.py --sheet-nine
#   python _gen-dodam-variants.py --only-monthly-markets
#   python _gen-dodam-variants.py --only-1weekfree
#   python _gen-dodam-variants.py --only-marketfree

from __future__ import annotations

import argparse
from pathlib import Path

root = Path(__file__).resolve().parent
src = root / "magic-core-rule-strategy.pine"


# 표 기준 Regular / 1month — 노란/흰색 마켓 8종 (파일명·전략 제목 동일)
VARIANTS_MONTHLY_MARKETS = [
    ("Dodam_MagicTrading_BondsMarket", "DMT_Bonds", "bonds"),
    ("Dodam_MagicTrading_CryptoMarket", "DMT_Crypto", "crypto"),
    ("Dodam_MagicTrading_EconomyMarket", "DMT_Econom", "economy"),
    ("Dodam_MagicTrading_ForexMarket", "DMT_Forex", "forex"),
    ("Dodam_MagicTrading_FundsMarket", "DMT_Funds", "funds"),
    ("Dodam_MagicTrading_FutuiresMarket", "DMT_Futur", "futures"),
    ("Dodam_MagicTrading_IndicesMarket", "DMT_Indic", "indices"),
    ("Dodam_MagicTrading_StocksMarket", "DMT_Stk", "stocks"),
]

VARIANTS_SHEET_NINE = VARIANTS_MONTHLY_MARKETS + [
    ("Dodam_MagicTrading_Marketfree", "DMT_Free", "marketfree"),
]


def build_one(fname: str, shorttitle: str, lic: str, tmpl: str) -> None:
    if len(shorttitle) > 10:
        raise SystemExit(f"shorttitle too long ({len(shorttitle)}): {shorttitle}")
    t = (
        tmpl.replace('"MagicIndicator Core Rule Strategy"', f'"{fname}"')
        .replace('shorttitle       = "MagicTrading"', f'shorttitle       = "{shorttitle}"')
        .replace('LICENSE_FIELD = "bonds"', f'LICENSE_FIELD = "{lic}"')
    )
    head = "// " + fname + " — 마켓 잠금: " + lic + "\n"
    if not t.startswith("//@version=5"):
        raise SystemExit("bad template header")
    t = t.replace("//@version=5\n", "//@version=5\n" + head, 1)
    out = root / (fname + ".pine")
    out.write_text(t, encoding="utf-8")
    print("wrote", out.name)


def main() -> None:
    p = argparse.ArgumentParser(description="Dodam_MagicTrading 빌드 .pine 생성")
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--all",
        action="store_true",
        help="마켓 8 + Marketfree + Marketfree_1weekfree 전부 생성",
    )
    mode.add_argument(
        "--sheet-nine",
        action="store_true",
        help="표 9종: 마켓 8 + Marketfree(1month)만 덮어쓰기",
    )
    mode.add_argument(
        "--only-monthly-markets",
        action="store_true",
        help="Regular/1month 마켓 8개만 (Marketfree 계열은 수정 안 함)",
    )
    mode.add_argument(
        "--only-1weekfree",
        action="store_true",
        help="Dodam_MagicTrading_Marketfree_1weekfree 로컬 .pine 한 개만 재생성 (이미 퍼블된 TV 스크립트는 수정하지 말 것; 레포 소스 동기화용)",
    )
    mode.add_argument(
        "--only-marketfree",
        action="store_true",
        help="Dodam_MagicTrading_Marketfree 로컬 .pine 한 개만 재생성",
    )
    args = p.parse_args()

    tmpl = src.read_text(encoding="utf-8")
    if '"MagicIndicator Core Rule Strategy"' not in tmpl:
        raise SystemExit("template title marker missing")

    if args.only_monthly_markets:
        for row in VARIANTS_MONTHLY_MARKETS:
            build_one(*row, tmpl)
        return

    if args.only_1weekfree:
        build_one(
            "Dodam_MagicTrading_Marketfree_1weekfree",
            "DMT_Free1w",
            "marketfree_1weekfree",
            tmpl,
        )
        return

    if args.only_marketfree:
        build_one("Dodam_MagicTrading_Marketfree", "DMT_Free", "marketfree", tmpl)
        return

    if args.sheet_nine:
        for row in VARIANTS_SHEET_NINE:
            build_one(*row, tmpl)
        return

    variants = VARIANTS_MONTHLY_MARKETS + [
        ("Dodam_MagicTrading_Marketfree", "DMT_Free", "marketfree"),
        ("Dodam_MagicTrading_Marketfree_1weekfree", "DMT_Free1w", "marketfree_1weekfree"),
    ]
    for row in variants:
        build_one(*row, tmpl)


if __name__ == "__main__":
    main()
