"""External faculty birthdays and wedding anniversaries (v59).

* Master › External Faculty has two optional dates: `dob` and `anniversary` (YYYY-MM-DD).
* HR, Admin and the Super Admin get a pop-up on the dashboard from CELEBRATION_REMINDER_DAYS (10) days before
  the day up to the day itself. Each person who sees it can:
    - Snooze: it comes back in the next session (morning 09:00 or evening 16:00, local time), every day
      until the day;
    - Dismiss: gone for that faculty and that year's date (for this user only).
  Kept in `celebration_seen`: {_id: "<userId>|<key>", snoozeUntil, dismissedAt}.
* On the day itself Master › External Faculty shows a "Send wishes" button that sends the birthday or
  anniversary WhatsApp template (WA_BIRTHDAY_TEMPLATE_*, WA_ANNIVERSARY_TEMPLATE_*) to the faculty's phone.
  The send is recorded in `celebration_sent` ({_id: key, sentAt, by}), so it is sent once per year.
A key is "<kind>|<faculty id>|<year>", e.g. "birthday|EXF-0001|2026".
"""
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from .. import db, whatsapp
from ..auto_inactive import local_now
from ..config import settings
from ..security import require_roles

router = APIRouter(prefix="/celebrations", tags=["celebrations"])
hr_roles = require_roles("HR", "ADMIN", "MANAGER")
KINDS = {"birthday": ("dob", "Birthday"), "anniversary": ("anniversary", "Anniversary")}
SESSIONS = (9, 16)  # morning and evening: a snoozed reminder shows again from the next of these hours
seen = db.db.celebration_seen
sent = db.db.celebration_sent


def _on(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:  # 29 February in a year without it
        return date(year, 2, 28)


def next_date(value: str | None, today: date) -> date | None:
    """This year's (or next year's, when it has passed) day of a YYYY-MM-DD date."""
    try:
        d = datetime.strptime(str(value or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
    n = _on(today.year, d.month, d.day)
    return n if n >= today else _on(today.year + 1, d.month, d.day)


def events(today: date, within: int | None = None) -> list[dict]:
    """Birthdays and anniversaries of active external faculties from today up to `within` days ahead."""
    within = settings.celebration_reminder_days if within is None else within
    out = []
    for f in db.db.master_externalFaculty.find({"status": {"$ne": "Inactive"}}, {"_id": 0}):
        for kind, (field, label) in KINDS.items():
            n = next_date(f.get(field), today)
            if not n or (n - today).days > within:
                continue
            key = f"{kind}|{f['id']}|{n.year}"
            born = str(f.get(field))[:4]
            out.append({
                "key": key, "kind": kind, "label": label, "facultyId": f["id"], "name": f.get("name", ""),
                "phone": f.get("phone", ""), "date": n.isoformat(), "daysLeft": (n - today).days,
                "years": n.year - int(born) if born.isdigit() else None, "sent": bool(sent.find_one({"_id": key})),
            })
    return sorted(out, key=lambda e: (e["daysLeft"], e["name"].lower()))


def next_session(now: datetime) -> datetime:
    for h in SESSIONS:
        t = now.replace(hour=h, minute=0, second=0, microsecond=0)
        if t > now:
            return t
    return (now + timedelta(days=1)).replace(hour=SESSIONS[0], minute=0, second=0, microsecond=0)


@router.get("/reminders")
def reminders(me: dict = Depends(hr_roles)):
    """The pop-up list for this user: not dismissed, and not snoozed until a later session."""
    now = local_now().replace(tzinfo=None)
    out = []
    for e in events(now.date()):
        s = seen.find_one({"_id": f"{me['userId']}|{e['key']}"}) or {}
        if s.get("dismissedAt") or (s.get("snoozeUntil") and s["snoozeUntil"] > now.isoformat()):
            continue
        out.append(e)
    return out


@router.get("/today")
def today_list(_: dict = Depends(hr_roles)):
    """Birthdays and anniversaries that are today (the "Send wishes" buttons on Master › External Faculty)."""
    return events(local_now().date(), within=0)


@router.post("/reminders/{action}")
def act(action: Literal["snooze", "dismiss"], body: dict, me: dict = Depends(hr_roles)):
    key = str(body.get("key") or "")
    if key.count("|") != 2 or key.split("|")[0] not in KINDS:
        raise HTTPException(422, "Unknown reminder")
    now = local_now().replace(tzinfo=None)
    upd = {"dismissedAt": datetime.now(timezone.utc).isoformat()} if action == "dismiss" else {"snoozeUntil": next_session(now).isoformat()}
    seen.update_one({"_id": f"{me['userId']}|{key}"}, {"$set": {**upd, "userId": me["userId"], "key": key}}, upsert=True)
    return {"ok": True, **upd}


@router.post("/send")
def send_wishes(body: dict, me: dict = Depends(hr_roles)):
    """Sends the birthday / anniversary WhatsApp template to the faculty, only on the day itself."""
    kind, fid = body.get("kind"), body.get("facultyId")
    if kind not in KINDS:
        raise HTTPException(422, "kind must be birthday or anniversary")
    ev = next((e for e in events(local_now().date(), within=0) if e["kind"] == kind and e["facultyId"] == fid), None)
    if not ev:
        raise HTTPException(400, f"Today is not this faculty's {KINDS[kind][1].lower()}")
    if ev["sent"]:
        raise HTTPException(409, "Wishes were already sent today")
    template = getattr(settings, f"wa_{kind}_template_name")
    if not template:
        raise HTTPException(400, f"Set WA_{kind.upper()}_TEMPLATE_NAME in the backend settings first")
    if not settings.wa_api_key or not settings.wa_phone_number_id:
        raise HTTPException(400, "WhatsApp is not set up (WA_API_KEY / WA_PHONE_NUMBER_ID)")
    if not ev["phone"]:
        raise HTTPException(400, "This faculty has no phone number")
    values = {"name": ev["name"], "date": datetime.strptime(ev["date"], "%Y-%m-%d").strftime("%d/%m/%Y"), "years": str(ev["years"] or ""), "phone": ev["phone"]}
    params = whatsapp.template_params(values, getattr(settings, f"wa_{kind}_template_params"))
    try:
        whatsapp.send_template(whatsapp._number(ev["phone"]), params, template, getattr(settings, f"wa_{kind}_template_lang") or None)  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"WhatsApp did not send: {exc}") from exc
    sent.insert_one({"_id": ev["key"], "sentAt": datetime.now(timezone.utc).isoformat(), "by": me["name"], "facultyId": fid, "kind": kind})
    return {"ok": True, "key": ev["key"]}
