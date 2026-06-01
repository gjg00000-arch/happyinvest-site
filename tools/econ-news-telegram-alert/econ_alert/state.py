from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


@dataclass
class SentState:
    path: Path
    notified: dict[str, str]  # event_id -> ISO8601 UTC when we sent

    @staticmethod
    def load(path: Path) -> "SentState":
        if not path.is_file():
            return SentState(path=path, notified={})
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return SentState(path=path, notified={})
        n = raw.get("notified")
        if not isinstance(n, dict):
            return SentState(path=path, notified={})
        out: dict[str, str] = {}
        for k, v in n.items():
            if isinstance(k, str) and isinstance(v, str):
                out[k] = v
        return SentState(path=path, notified=out)

    def prune(self, *, max_age_days: int = 14) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        keep: dict[str, str] = {}
        for eid, iso in self.notified.items():
            try:
                ts = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except ValueError:
                continue
            if ts >= cutoff:
                keep[eid] = iso
        self.notified = keep

    def already(self, event_id: str) -> bool:
        return event_id in self.notified

    def mark(self, event_id: str, when: datetime | None = None) -> None:
        w = when or datetime.now(timezone.utc)
        self.notified[event_id] = w.isoformat()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload: dict[str, Any] = {"notified": self.notified}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
