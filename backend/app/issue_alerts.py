"""Issue alert: when a faculty saves any entry with "Issue faced? Yes", tell Ranjit and the managing person.

* Email to COURSE_REQUEST_EMAILS (Ranjit / Admin; or every active Super Admin and Admin when it is empty)
  and to the managing person of that place: the college of a College / OD class, the college picked in
  the entry (seminar, marketing ...), or "Center". Their email and phone are set by Super Admin / Admin in Master › Dropdown Values › Issue contacts.
* WhatsApp to WA_NOTIFY_NUMBERS and the managing person's phone with the issue template
  (WA_ISSUE_TEMPLATE_NAME, its own approved text; v54). It no longer uses the course request template,
  whose fixed text said "New course request". No issue template set = no WhatsApp, the email still goes.
* Sent once per entry: when the entry is created with an issue, or when an issue is added to it later.
* It runs after the save, in the background, and a failure never stops the entry from being saved. The
  result is kept on the entry as issueAlert.
"""
import logging
from datetime import datetime, timedelta, timezone

from . import db, whatsapp
from .config import settings
from .mailer import send_mail

log = logging.getLogger("der.issue_alerts")
ACTIVITY = {"class": "Class", "seminar": "Seminar / Work Shop", "marketing": "Marketing Support", "learning": "Course Preparation", "selfLearning": "Self Learning / Knowledge Sharing", "facultyDevelopment": "Faculty Development", "travelling": "Travelling Time", "others": "Others"}


def has_issue(e: dict | None) -> bool:
    return bool(e) and (e.get("details") or {}).get("issueFaced") == "Yes"


def place_of(e: dict) -> str:
    college = ((e.get("outstation") or {}).get("collegeName") or (e.get("details") or {}).get("collegeName") or "").strip()
    if college:
        return college
    return "College / OD" if e.get("facultyIn") == "Outstation" else "Center"


def _recipients() -> list[str]:
    fixed = [x.strip() for x in settings.course_request_emails.split(",") if x.strip()]
    if fixed:
        return fixed
    return sorted({u["email"] for u in db.users.find({"role": {"$in": ["MANAGER", "ADMIN"]}, "active": True, "email": {"$nin": [None, ""]}}, {"email": 1})})


def _date(d: str) -> str:
    try:
        return datetime.strptime(d, "%Y-%m-%d").strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return d or "-"


def values(e: dict, place: str) -> dict:
    """The issue's details by name: used by the email and the WhatsApp issue template."""
    d = e.get("details") or {}
    return {
        "faculty": e["facultyName"], "code": e["facultyCode"], "place": place,
        "activity": ACTIVITY.get(e["activityType"], e["activityType"]), "date": _date(e["activityDate"]),
        "time": f"{e['timeFrom']} to {e['timeTo']}",
        "course": " / ".join(x for x in (d.get("courseId"), d.get("batchNo")) if x) or "-",
        "issueType": d.get("issueType") or "-", "minutes": str(d.get("issueMinutes") or "-"),
        "details": d.get("issueDetails") or "-", "entryId": e["id"],
    }


def subject(e: dict, place: str) -> str:
    d = e.get("details") or {}
    return f"Issue faced by {e['facultyName']} at {place}: {d.get('issueType') or 'issue'} ({d.get('issueMinutes') or '?'} min)"


def _text(e: dict, place: str, contact: dict) -> str:
    v = values(e, place)
    when = datetime.fromisoformat(e["createdAt"]).astimezone(timezone(timedelta(minutes=settings.utc_offset_minutes))).strftime("%d/%m/%Y, %H:%M")
    lines = [
        "Dear Sir / Madam,",
        "",
        f"An issue was reported in a daily entry by {v['faculty']} ({v['code']}).",
        "",
        f"Faculty: {v['faculty']} ({v['code']})",
        f"Place: {place}",
        f"Activity: {v['activity']} on {v['date']}, {v['time']}",
        f"Course / Batch: {v['course']}",
        f"Issue: {v['issueType']}",
        f"Time lost: {v['minutes']} minutes",
        f"Details: {v['details']}",
        f"Entry No: {v['entryId']} (saved {when})",
        "",
        f"Managing person of {place}: {contact.get('name') or '-'}" if contact else f"No managing person is set for {place} in Master > Dropdown Values.",
        "",
        "Issues of more than 1 hour are listed in the Monthly Report > Issues section.",
        "",
        "Regards,",
        "Daily Entry Report, Advantage Pro",
    ]
    return "\n".join(lines)


def send(entry_id: str) -> dict:
    """Send the alert for one saved entry. Never raises; stores and returns what was sent."""
    e = db.entries.find_one({"id": entry_id})
    if not has_issue(e):
        return {}
    d = e.get("details") or {}
    place = place_of(e)
    contact = db.db.place_contacts.find_one({"_id": place}) or {}
    result: dict = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "place": place, "emailedTo": [], "whatsappTo": 0, "errors": []}
    to = list(dict.fromkeys(_recipients() + ([contact["email"]] if contact.get("email") else [])))
    if to:
        try:
            send_mail(to, subject(e, place), _text(e, place, contact))
            result["emailedTo"] = to
        except Exception as exc:  # noqa: BLE001 - mail is down or not set up: keep the entry
            log.warning("Issue alert email for %s failed: %s", entry_id, exc)
            result["errors"].append(f"Email: {exc}")
    if settings.wa_issue_template_name:
        wa = whatsapp.notify(
            values(e, place),
            extra_numbers=[contact["phone"]] if contact.get("phone") else None,
            template=settings.wa_issue_template_name,
            spec=settings.wa_issue_template_params,
            lang=settings.wa_issue_template_lang or None,
        )
    else:  # the course request template's fixed text would say "New course request": no WhatsApp until set
        wa = {"sent": 0, "errors": ["WhatsApp issue template not set (WA_ISSUE_TEMPLATE_NAME in backend/.env)"]}
    result["whatsappTo"] = wa["sent"]
    result["errors"] += wa["errors"]
    db.entries.update_one({"id": entry_id}, {"$set": {"issueAlert": result}})
    return result
