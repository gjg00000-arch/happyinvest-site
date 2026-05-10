from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _truthy(v: str | None) -> bool:
    if v is None:
        return False
    return v.strip().lower() in ("1", "true", "yes", "y", "on")


@dataclass(frozen=True)
class Settings:
    finnhub_api_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    alert_minutes_before: int
    poll_interval_sec: int
    impact_levels: frozenset[str]
    event_countries: frozenset[str]
    source_tz: str
    display_tz: str
    dry_run: bool
    state_file: str


def load_settings() -> Settings:
    key = (os.getenv("FINNHUB_API_KEY") or "").strip()
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()

    impacts_raw = (os.getenv("IMPACT_LEVELS") or "high").lower()
    impacts = frozenset(x.strip() for x in impacts_raw.split(",") if x.strip())

    countries_raw = (os.getenv("EVENT_COUNTRIES") or "US").upper()
    countries = frozenset(x.strip() for x in countries_raw.split(",") if x.strip())

    return Settings(
        finnhub_api_key=key,
        telegram_bot_token=token,
        telegram_chat_id=chat,
        alert_minutes_before=max(1, int(os.getenv("ALERT_MINUTES_BEFORE") or "30")),
        poll_interval_sec=max(30, int(os.getenv("POLL_INTERVAL_SEC") or "120")),
        impact_levels=impacts,
        event_countries=countries,
        source_tz=(os.getenv("SOURCE_TIMEZONE") or "UTC").strip(),
        display_tz=(os.getenv("DISPLAY_TIMEZONE") or "America/New_York").strip(),
        dry_run=_truthy(os.getenv("DRY_RUN")),
        state_file=os.getenv("STATE_FILE", "sent_state.json").strip(),
    )


def validate_settings(s: Settings) -> list[str]:
    errs: list[str] = []
    if not s.finnhub_api_key:
        errs.append("FINNHUB_API_KEY 가 비어 있습니다.")
    if not s.telegram_bot_token:
        errs.append("TELEGRAM_BOT_TOKEN 이 비어 있습니다.")
    if not s.telegram_chat_id:
        errs.append("TELEGRAM_CHAT_ID 가 비어 있습니다.")
    return errs
