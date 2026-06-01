from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from econ_alert.config import Settings
from econ_alert.models import EconEvent


def format_alert(ev: EconEvent, s: Settings) -> str:
    utc = ev.instant_utc
    disp = ZoneInfo(s.display_tz)
    local = utc.astimezone(disp)
    utc_str = utc.strftime("%Y-%m-%d %H:%M UTC")
    local_str = local.strftime("%Y-%m-%d %H:%M %Z")
    return (
        "📊 경제지표 사전 알림 (고임팩트)\n\n"
        f"• 지표: {ev.title}\n"
        f"• 국가: {ev.country}  ·  중요도: {ev.impact}\n"
        f"• 발표 예정(표시 TZ: {s.display_tz}): {local_str}\n"
        f"• 발표 예정(UTC): {utc_str}\n"
        f"• 약 {s.alert_minutes_before}분 후 발표 예정입니다.\n\n"
        "변동성·스프레드·슬리피지에 유의하세요.\n"
        "(포지션 여부와 무관한 일정 안내입니다.)"
    )
