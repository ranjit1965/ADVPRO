"""WhatsApp template messages through the Pinbot partner API (WhatsApp Business, Meta template format).

Settings in backend/.env:
    WA_API_BASE=https://partnersv1.pinbot.ai/v3
    WA_API_KEY=...            (sent as the "apikey" header)
    WA_PHONE_NUMBER_ID=...    (the sending WhatsApp number's id in Pinbot)
    WA_TEMPLATE_NAME=...      (approved template name)
    WA_TEMPLATE_ID=...        (template id in Pinbot, kept for reference)
    WA_TEMPLATE_LANG=en
    WA_NOTIFY_NUMBERS=919xxxxxxxxx,919xxxxxxxxx   (Manager and Admin, with country code, no +)

The course request template must be created and approved in Pinbot with 4 body variables, for example:
    New course request from {{1}}.
    Course: {{2}}
    Suggested Course ID: {{3}}
    Remarks: {{4}}
    Please add it in Master > Courses & Chapters of the Daily Entry Report.
A failed WhatsApp message never stops the request: the email is the main channel.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from .config import settings

log = logging.getLogger("der.whatsapp")


def configured() -> bool:
    return bool(settings.wa_api_key and settings.wa_phone_number_id and settings.wa_template_name and notify_numbers())


def notify_numbers() -> list[str]:
    return [n.strip().lstrip("+").replace(" ", "") for n in settings.wa_notify_numbers.split(",") if n.strip()]


def send_template(to: str, params: list[str]) -> None:
    """Sends the configured template to one number with the given body variables. Raises on failure."""
    url = f"{settings.wa_api_base.rstrip('/')}/{settings.wa_phone_number_id}/messages"
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": {
            "name": settings.wa_template_name,
            "language": {"code": settings.wa_template_lang or "en"},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": (p or "-")[:900]} for p in params]}],
        },
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json", "apikey": settings.wa_api_key})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status >= 300:
                raise RuntimeError(f"HTTP {res.status}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:300].decode(errors='replace')}") from e


def notify(params: list[str]) -> dict:
    """Sends the template to every WA_NOTIFY_NUMBERS number. Returns {"sent": n, "errors": [...]}, never raises."""
    if not configured():
        return {"sent": 0, "errors": ["WhatsApp is not configured (WA_* settings in backend/.env)"]}
    sent, errors = 0, []
    for n in notify_numbers():
        try:
            send_template(n, params)
            sent += 1
        except Exception as exc:  # noqa: BLE001 - keep going with the other numbers
            log.warning("WhatsApp to %s failed: %s", n, exc)
            errors.append(f"{n}: {exc}")
    return {"sent": sent, "errors": errors}
