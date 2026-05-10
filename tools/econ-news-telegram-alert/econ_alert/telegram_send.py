from __future__ import annotations

import logging
from typing import Any

import requests


def send_telegram_message(
    bot_token: str,
    chat_id: str,
    text: str,
    *,
    timeout_sec: float = 25.0,
    dry_run: bool = False,
) -> bool:
    if dry_run:
        logging.info("[DRY_RUN] 텔레그램 메시지:\n%s", text)
        return True
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    r = requests.post(url, json=payload, timeout=timeout_sec)
    if not r.ok:
        logging.error("Telegram API 오류 %s: %s", r.status_code, r.text[:500])
        return False
    return True
