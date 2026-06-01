from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from econ_alert.config import Settings, load_settings, validate_settings
from econ_alert.finnhub_calendar import fetch_finnhub_economic_calendar
from econ_alert.message_fmt import format_alert
from econ_alert.state import SentState
from econ_alert.telegram_send import send_telegram_message


def run_single_cycle(s: Settings, state: SentState, state_path: Path) -> int:
    """한 번 캘린더를 조회하고 조건에 맞으면 텔레그램 전송. 전송한 건수 반환."""
    now = datetime.now(timezone.utc)
    today = now.date()
    horizon = today + timedelta(days=3)

    events = fetch_finnhub_economic_calendar(
        s.finnhub_api_key,
        today,
        horizon,
        event_countries=s.event_countries,
        impact_levels=s.impact_levels,
        source_tz=s.source_tz,
    )

    state.prune()
    alert_delta = timedelta(minutes=s.alert_minutes_before)
    sent = 0

    for ev in events:
        if state.already(ev.event_id):
            continue
        if now >= ev.instant_utc:
            continue
        alert_at = ev.instant_utc - alert_delta
        if now < alert_at:
            continue

        text = format_alert(ev, s)
        ok = send_telegram_message(
            s.telegram_bot_token,
            s.telegram_chat_id,
            text,
            dry_run=s.dry_run,
        )
        if ok:
            state.mark(ev.event_id, now)
            sent += 1
            logging.info("알림 전송: %s (%s)", ev.title, ev.country)

    try:
        state.save()
    except OSError:
        logging.exception("상태 파일 저장 실패: %s", state_path)

    return sent


def run_once() -> None:
    """Cron·웹훅에서 subprocess 로 1회 실행할 때 사용."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    s = load_settings()
    errs = validate_settings(s)
    for err in errs:
        logging.error("%s", err)
    if errs:
        raise SystemExit(1)

    state_path = Path(s.state_file)
    state = SentState.load(state_path)
    n = run_single_cycle(s, state, state_path)
    logging.info("1회 실행 완료 — 전송 %s건", n)


def run_forever() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    s = load_settings()
    errs = validate_settings(s)
    for err in errs:
        logging.error("%s", err)
    if errs:
        raise SystemExit(1)

    state_path = Path(s.state_file)
    state = SentState.load(state_path)

    logging.info(
        "데몬 시작 — 알림 %s분 전, 폴링 %ss, 국가=%s, 임팩트=%s, 표시 TZ=%s",
        s.alert_minutes_before,
        s.poll_interval_sec,
        ",".join(sorted(s.event_countries)),
        ",".join(sorted(s.impact_levels)),
        s.display_tz,
    )

    while True:
        try:
            run_single_cycle(s, state, state_path)
        except Exception:
            logging.exception("Finnhub 경제 캘린더 처리 실패")

        time.sleep(s.poll_interval_sec)
