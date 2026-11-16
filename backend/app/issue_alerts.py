"""Issue alert: when a faculty saves any entry with "Issue faced? Yes", tell Ranjit and the managing person.

* Email to COURSE_REQUEST_EMAILS (Ranjit / Admin; or every active Manager and Admin when it is empty)
  and to the managing person of that place: the college of a College / OD class, the college picked in
  the entry (seminar, marketing ...), or "Center". Their email and phone are set by Manager / Admin in Master › Dropdown Values › Issue contacts.
* WhatsApp to WA_NOTIFY_NUMBERS and the managing person's phone, with the same template as course
  requests ("course" carries the issue, "remarks" the details).
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


def _text(e: dict, place: str, contact: dict) -> str:
    d = e.get("details") or {}
    when = datetime.fromisoformat(e["createdAt"]).astimezone(timezone(timedelta(minutes=settings.utc_offset_minutes))).strftime("%d %b %Y, %I:%M %p")
    lines = [
        "Dear Sir / Madam,",
        "",
        f"Sub: Issue faced at {place}",
        "",
        f"    Faculty              : {e['facultyName']} ({e['facultyCode']})",
        f"    Activity             : {ACTIVITY.get(e['activityType'], e['activityType'])}, {e['activityDate']}, {e['timeFrom']} to {e['timeTo']} ({'College / OD' if e.get('facultyIn') == 'Outstation' else 'Center'})",
        f"    Place                : {place}",
        f"    Course / Batch       : {d.get('courseId') or '-'} {('/ ' + d['batchNo']) if d.get('batchNo') else ''}",
        f"    Issue type           : {d.get('issueType') or '-'}",
        f"    Time lost            : {d.get('issueMinutes') or '-'} minutes",
        f"    Details              : {d.get('issueDetails') or '-'}",
        f"    Entry No             : {e['id']} (saved {when})",
        "",
        f"Managing person of {place}: {contact.get('name') or '-'}" if contact else f"No managing person is set for {place} in Master > Dropdown Values.",
        "",
        "Issues of more than 1 hour are listed in the Monthly Report > Issues section.",
        "",
        "--",
        "Sent from Daily Entry Report, Advantage Pro",
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
            send_mail(to, f"Issue faced: {e['facultyName']} at {place}, {d.get('issueType') or 'issue'} ({d.get('issueMinutes') or '?'} min)", _text(e, place, contact))
            result["emailedTo"] = to
        except Exception as exc:  # noqa: BLE001 - mail is down or not set up: keep the entry
            log.warning("Issue alert email for %s failed: %s", entry_id, exc)
            result["errors"].append(f"Email: {exc}")
    wa = whatsapp.notify(
        {
            "employee": e["facultyName"], "code": e["facultyCode"], "employeeCode": f"{e['facultyName']} ({e['facultyCode']})",
            "course": f"Issue at {place}: {d.get('issueType') or '-'} ({d.get('issueMinutes') or '?'} min)", "courseId": d.get("courseId") or "-",
            "remarks": d.get("issueDetails") or "-", "date": e["activityDate"], "email": "",
        },
        extra_numbers=[contact["phone"]] if contact.get("phone") else None,
    )
    result["whatsappTo"] = wa["sent"]
    result["errors"] += wa["errors"]
    db.entries.update_one({"id": entry_id}, {"$set": {"issueAlert": result}})
    return result
