from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests

from econ_alert.models import EconEvent


def _norm_impact(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, (int, float)):
        return str(int(raw))
    return str(raw).strip().lower()


def _impact_allowed(impact: str, allowed: frozenset[str]) -> bool:
    if not allowed:
        return True
    imp = impact.lower()
    if imp in allowed:
        return True
    # 숫자 코드(일부 공급자): 3=high, 2=medium, 1=low
    if imp.isdigit() and imp in allowed:
        return True
    aliases = {
        "high": frozenset({"high", "h", "3", "strong"}),
        "medium": frozenset({"medium", "med", "m", "2", "moderate"}),
        "low": frozenset({"low", "l", "1", "weak"}),
    }
    for level, names in aliases.items():
        if level in allowed and imp in names:
            return True
    return False


def _parse_instant(
    row: dict[str, Any],
    source_tz_name: str,
) -> datetime | None:
    """행에서 UTC aware datetime 추출."""
    src_tz = ZoneInfo(source_tz_name)

    # Unix 초/밀리초
    for k in ("time", "timestamp", "releaseTime", "datetime"):
        v = row.get(k)
        if isinstance(v, (int, float)):
            sec = v / 1000.0 if v > 1e12 else v
            return datetime.fromtimestamp(sec, tz=timezone.utc)

    # ISO 문자열 (순수 날짜 yyyy-mm-dd 는 아래 date+time 조합으로 처리)
    for k in ("time", "datetime", "releaseTime", "releaseDate"):
        v = row.get(k)
        if isinstance(v, str) and v.strip():
            s = v.strip().replace("Z", "+00:00")
            if len(s) == 10 and s[4] == "-" and s[7] == "-":
                continue
            try:
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=src_tz)
                return dt.astimezone(timezone.utc)
            except ValueError:
                pass

    # date + time 분리
    d_raw = row.get("date")
    t_raw = row.get("time")
    if isinstance(d_raw, str) and d_raw.strip():
        d_part = d_raw.strip()[:10]
        try:
            d = date.fromisoformat(d_part)
        except ValueError:
            d = None
        if d is not None:
            tm = time(0, 0, tzinfo=src_tz)
            if isinstance(t_raw, str) and re.match(r"^\d{1,2}:\d{2}", t_raw.strip()):
                parts = t_raw.strip().split(":")
                hh = int(parts[0])
                mm = int(parts[1])
                ss = 0
                if len(parts) > 2 and parts[2][:2].isdigit():
                    ss = min(59, int(parts[2].split(".")[0]))
                tm = time(hh, mm, ss, tzinfo=src_tz)
            local = datetime.combine(d, tm)
            return local.astimezone(timezone.utc)

    return None


def _stable_event_id(country: str, title: str, instant_utc: datetime) -> str:
    raw = f"{country}|{title}|{instant_utc.isoformat()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def fetch_finnhub_economic_calendar(
    api_key: str,
    day_start: date,
    day_end: date,
    *,
    event_countries: frozenset[str],
    impact_levels: frozenset[str],
    source_tz: str,
    timeout_sec: float = 20.0,
) -> list[EconEvent]:
    url = "https://finnhub.io/api/v1/calendar/economic"
    params = {
        "from": day_start.isoformat(),
        "to": day_end.isoformat(),
        "token": api_key,
    }
    r = requests.get(url, params=params, timeout=timeout_sec)
    r.raise_for_status()
    data = r.json()

    rows: list[dict[str, Any]]
    if isinstance(data, dict) and isinstance(data.get("economicCalendar"), list):
        rows = data["economicCalendar"]
    elif isinstance(data, list):
        rows = data
    else:
        rows = []

    out: list[EconEvent] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        country = str(row.get("country") or "").strip().upper()
        if event_countries and country not in event_countries:
            continue
        title = str(row.get("event") or row.get("name") or "").strip()
        if not title:
            continue
        impact = _norm_impact(row.get("impact"))
        if not _impact_allowed(impact, impact_levels):
            continue
        instant = _parse_instant(row, source_tz)
        if instant is None:
            continue
        eid = _stable_event_id(country, title, instant)
        out.append(
            EconEvent(
                event_id=eid,
                country=country,
                title=title,
                impact=impact or "?",
                instant_utc=instant,
            )
        )

    out.sort(key=lambda e: e.instant_utc)
    return out
