"""Finnhub 경제 캘린더 → 텔레그램 사전 알림.

- 데몬: `python run.py`
- 서버 Cron이 subprocess로 1회만: `python run.py --once`
"""

import argparse

from econ_alert.daemon import run_forever, run_once


def main() -> None:
    p = argparse.ArgumentParser(description="경제 지표 사전 알림 (Finnhub → Telegram)")
    p.add_argument(
        "--once",
        action="store_true",
        help="한 번만 캘린더 조회·전송 후 종료 (웹훅/Cron용)",
    )
    args = p.parse_args()
    if args.once:
        run_once()
    else:
        run_forever()


if __name__ == "__main__":
    main()
