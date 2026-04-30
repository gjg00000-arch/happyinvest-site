#!/usr/bin/env python3
"""
Ledger / BIP 확장 공개키(xpub · ypub · zpub)로 비트코인 **받기(receive)** 주소를 파생합니다.

전제:
  - Ledger Live 등에서 **계정(account)** 깊이로 내보낸 문자열이라고 가정합니다.
  - 기본: **외부 체인(받기) = `m/…/change/address_index`** 중 change=CHAIN_EXT (=0),

의존: `bip-utils` — 세그위트(네이티브·중첩)와 레거시 주소 인코드를 한 줄로 처리.
(`bip32utils` 단독은 zpub/bech32 쪽이 번거로워 포함하지 않습니다.)

예:
  set RECEIVE_EXT_KEY=zpub6....
  python derive_receive_address.py 12

  python derive_receive_address.py --ext-key=zpub.... --range 0-5
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import List, Sequence, Tuple

from bip_utils import (
    Bip44,
    Bip44Coins,
    Bip44Changes,
    Bip49,
    Bip49Coins,
    Bip84,
    Bip84Coins,
)

_RECEIPT_ENV_KEYS = ("RECEIVE_EXT_KEY", "RECEIVE_ZPUB", "RECEIVE_YPUB", "RECEIVE_XPUB")
_RANGE_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


def _detect_ctx(ext_key: str):
    k = ext_key.strip()
    if k.startswith("zpub"):
        return Bip84.FromExtendedKey(k, Bip84Coins.BITCOIN), "BIP84 · native SegWit (bc1…)"
    if k.startswith("ypub"):
        return Bip49.FromExtendedKey(k, Bip49Coins.BITCOIN), "BIP49 · nested SegWit (3…)"
    if k.startswith("xpub"):
        return Bip44.FromExtendedKey(k, Bip44Coins.BITCOIN), "BIP44 · legacy P2PKH (1…)"
    raise ValueError(
        "BTC mainnet 확장키 접두어는 xpub / ypub / zpub 중 하나여야 합니다. "
        "(tpub 등 테스트넷 전용 문자열은 이 스크립트 기본 플로우 없음)"
    )


def derive(ext_key: str, indices: Sequence[int], *, internal_chain: bool) -> Tuple[str, List[str]]:
    ctx, hint = _detect_ctx(ext_key)
    chain = Bip44Changes.CHAIN_INT if internal_chain else Bip44Changes.CHAIN_EXT

    addresses: List[str] = []
    for i in indices:
        pk = ctx.Change(chain).AddressIndex(int(i)).PublicKey()
        addresses.append(pk.ToAddress())
    return hint, addresses


def _read_ext_key(cli_key: str | None, prompt_tty: bool) -> str:
    if cli_key and cli_key.strip():
        return cli_key.strip()

    acc = ""
    for ek in _RECEIPT_ENV_KEYS:
        raw = os.environ.get(ek)
        if raw and raw.strip():
            acc = raw.strip()
            break

    if not acc and prompt_tty and sys.stdin.isatty():
        acc = input("확장 공개키(xpub / ypub / zpub)를 붙여넣으세요:\n").strip()

    if not acc.strip():
        print(
            "확장 공개키 필요: --ext-key=… 또는 환경변수 "
            "%s 설정"
            % " / ".join(_RECEIPT_ENV_KEYS),
            file=sys.stderr,
        )
        raise SystemExit(2)
    return acc.strip()


def _indices_from_args(ns: argparse.Namespace) -> List[int]:
    if ns.range:
        m = _RANGE_RE.match(ns.range)
        if not m:
            raise SystemExit("--range 예: 0-9 또는 100-104")
        a, b = int(m.group(1)), int(m.group(2))
        if b < a:
            a, b = b, a
        return list(range(a, b + 1))

    if ns.single_index is not None:
        return [int(ns.single_index)]

    cnt = max(1, int(ns.count))
    st = int(ns.start)
    return list(range(st, st + cnt))


def _parse_argv() -> argparse.Namespace:
    pa = argparse.ArgumentParser(
        description="Ledger류 xPub로 BTC 받기 주소를 인덱스별로 출력합니다.",
    )
    pa.add_argument(
        "single_index",
        nargs="?",
        type=int,
        default=None,
        metavar="INDEX",
        help="단일 받기 인덱스 (예: 7). 미지정이면 --start/--count 또는 --range",
    )
    pa.add_argument(
        "--ext-key",
        default=None,
        help="계정 깊이 확장 공개키(xpub·ypub·zpub 한 줄)",
    )
    pa.add_argument(
        "--start",
        type=int,
        default=0,
        help="연속 출력 시작 (--range·단일 인덱스 미사용 시)",
    )
    pa.add_argument(
        "--count",
        "-c",
        type=int,
        default=1,
        help="연속 출력 길이(기본 1)",
    )
    pa.add_argument(
        "--range",
        default=None,
        metavar="FROM-TO",
        help="포함 범위(예 0-9). --single_index/--start 과 함께 쓰지 마세요.",
    )
    pa.add_argument(
        "--internal",
        action="store_true",
        help="내부(변경) 체인 BIP CHANGE=1 — 테스트·특수 목적 외에는 쓰지 않는 편이 좋습니다",
    )
    pa.add_argument("--no-meta", action="store_true", help="# spec 주석 줄 생략")
    pa.add_argument(
        "--no-prompt",
        action="store_true",
        help="키가 없으면 stdin 대화 없이 실패(non-interactive용)",
    )
    ns = pa.parse_args()

    conflicting = ns.range is not None and ns.single_index is not None
    if conflicting:
        raise SystemExit("--range 와 positional INDEX 는 동시에 쓸 수 없습니다.")

    return ns


def main() -> None:
    ns = _parse_argv()
    indices = _indices_from_args(ns)

    prompt = not ns.no_prompt
    key = _read_ext_key(ns.ext_key, prompt_tty=prompt)

    hint, addrs = derive(key, indices, internal_chain=bool(ns.internal))

    out = sys.stdout
    if not ns.no_meta:
        print(f"# {hint}", file=out)
    if len(indices) == 1:
        print(addrs[0], file=out)
    else:
        for i, addr in zip(indices, addrs):
            print(f"{i}\t{addr}", file=out)


if __name__ == "__main__":
    main()
