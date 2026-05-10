from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class EconEvent:
    """단일 경제 지표 일정 (비교·중복 키용 시각은 UTC 고정)."""

    event_id: str
    country: str
    title: str
    impact: str
    instant_utc: datetime
