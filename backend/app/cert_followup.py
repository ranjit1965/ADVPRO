"""Halfyearly certifications after a quarter ends (HR › Certification Status).

When the ending month of a row is over and a target certification is not completed (Achieved is not Yes):
  * Carry over: the unfinished targets move to the next quarter of that employee, marked "Carried forward"
    (H1 → H2 ... H6 → H1, same number of months, starting the month after the old ending month). If HR already
    assigned that next quarter, the targets are added to it. The old row keeps them, marked as carried.
    This runs once a day inside the API (CERT_FOLLOWUP_ENABLED) and whenever the report is opened.
Emails are sent only when HR clicks Send (never automatically), from the HR mail to the employee's email in Employees:
  * Deferred Report: one per ended row with unfinished certifications (marked `deferredMail`).
  * Certification Completed: one per row for the certifications newly marked Completed Yes (each target marked
    `completedMail`).
HR edits both email templates in HR › Certification Status ({name}, {quarter}, {courses} ... are filled in).
The HR mail id is set by the Super Admin; it is the Reply-To and gets a copy (CC).
"""
import logging
import threading
import time
from datetime import date, datetime, timezone

from . import db, mailer
from .auto_inactive import local_now, local_today
from .config import settings

log = logging.getLogger("der.certs")
SETTINGS_ID = "certFollowup"
QUARTERS = ("H1", "H2", "H3", "H4", "H5", "H6")
col = db.db.halfyearly_reports


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def month_of(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def add_months(m: str, n: int) -> str:
    y, mo = (int(x) for x in m.split("-"))
    k = y * 12 + (mo - 1) + n
    return f"{k // 12:04d}-{k % 12 + 1:02d}"


def months_between(a: str, b: str) -> int:
    (ya, ma), (yb, mb) = ((int(x) for x in a.split("-")), (int(x) for x in b.split("-")))
    return (yb * 12 + mb) - (ya * 12 + ma)


def month_label(m: str) -> str:
    return datetime.strptime(m + "-01", "%Y-%m-%d").strftime("%b %Y") if m else ""


def next_quarter(q: str | None) -> str | None:
    return QUARTERS[(QUARTERS.index(q) + 1) % len(QUARTERS)] if q in QUARTERS else None


def pending_targets(row: dict) -> list[dict]:
    return [t for t in row.get("targets", []) if t.get("achieved") != "Yes" and t.get("name")]


def ended(row: dict, today: date | None = None) -> bool:
    return bool(row.get("endMonth")) and row["endMonth"] < month_of(today or local_today())


# ------------------------------------------------------------------ settings (HR mail id, email templates)

PLACEHOLDERS = {
    "name": "Employee name",
    "code": "Employee code",
    "quarter": "Quarter (H1 ... H6)",
    "period": "Quarter months, e.g. Jan 2026 to Jun 2026",
    "courses": "The certifications, one per line",
    "nextQuarter": "Next quarter (Deferred Report)",
    "nextPeriod": "Months of the next quarter (Deferred Report)",
    "hrEmail": "HR mail id",
}
DEFAULT_TEMPLATES = {
    "deferred": {
        "subject": "Deferred Report: certification pending for {quarter} ({period})",
        "body": (
            "Dear {name},\n\n"
            "As per the Halfyearly Program Report, the target certification(s) assigned to you for {quarter} ({period}) "
            "were not completed by the end of the quarter:\n\n{courses}\n\n"
            "These certification(s) are carried forward to {nextQuarter} ({nextPeriod}) and are shown as Carried forward "
            "on your dashboard.\nPlease complete them within this quarter and share the completion date and certification "
            "code with HR.\n\nFor any help, reply to this email or write to {hrEmail}.\n\nRegards,\nHR\nAdvantage Pro"
        ),
    },
    "completed": {
        "subject": "Congratulations: certification completed ({quarter})",
        "body": (
            "Dear {name},\n\n"
            "Congratulations! As per the Halfyearly Program Report, you have completed the following target "
            "certification(s) for {quarter} ({period}):\n\n{courses}\n\n"
            "Thank you for your effort. Keep it up!\n\nRegards,\nHR\nAdvantage Pro"
        ),
    },
}
KINDS = tuple(DEFAULT_TEMPLATES)


def templates() -> dict:
    doc = db.db.settings.find_one({"_id": SETTINGS_ID}) or {}
    saved = doc.get("templates") or {}
    return {k: {**DEFAULT_TEMPLATES[k], **{f: v for f, v in (saved.get(k) or {}).items() if f in ("subject", "body", "updatedBy", "updatedAt")}} for k in KINDS}


def get_settings() -> dict:
    doc = db.db.settings.find_one({"_id": SETTINGS_ID}) or {}
    return {"hrEmail": doc.get("hrEmail", ""), "updatedBy": doc.get("updatedBy"), "updatedAt": doc.get("updatedAt"),
            "lastRun": doc.get("lastRun"), "lastSend": doc.get("lastSend") or {}, "enabled": settings.cert_followup_enabled,
            "time": settings.cert_followup_time, "templates": templates(), "placeholders": PLACEHOLDERS}


def save_settings(hr_email: str, by: str) -> dict:
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"hrEmail": hr_email.strip(), "updatedBy": by, "updatedAt": now()}}, upsert=True)
    return get_settings()


def save_template(kind: str, subject: str, body: str, by: str) -> dict:
    """HR changes the email text at any time; an empty subject or body goes back to the default."""
    tpl = {"subject": subject.strip() or DEFAULT_TEMPLATES[kind]["subject"], "body": body.strip() or DEFAULT_TEMPLATES[kind]["body"], "updatedBy": by, "updatedAt": now()}
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"templates.{kind}": tpl}}, upsert=True)
    return get_settings()


class _Keep(dict):
    def __missing__(self, key):  # an unknown {word} stays as it is
        return "{" + key + "}"


def fill(text: str, values: dict) -> str:
    return text.format_map(_Keep(values))


# ------------------------------------------------------------------ carry over

def carry_over(today: date | None = None, by: str = "System") -> list[str]:
    """Moves unfinished targets of every ended row to the next quarter. Returns the ids of the rows carried."""
    done = []
    for row in col.find({"endMonth": {"$lt": month_of(today or local_today())}, "carriedTo": {"$exists": False}}):
        pend = pending_targets(row)
        if not pend:
            continue
        span = max(0, months_between(row["startMonth"], row["endMonth"]))
        start = add_months(row["endMonth"], 1)
        end = add_months(start, span)
        carried = [{"name": t["name"], "courseId": t.get("courseId", ""), "achieved": None, "completionDate": None, "certificationCode": None,
                    "carriedForward": True, "carriedFrom": row["id"], "carriedFromQuarter": row.get("quarter")} for t in pend]
        # A row HR already assigned for the next quarter (same start month, or the next quarter label still running).
        nq = next_quarter(row.get("quarter"))
        alt = [{"startMonth": start}] + ([{"quarter": nq, "endMonth": {"$gte": start}}] if nq else [])
        nxt = col.find_one({"employeeCode": row["employeeCode"], "id": {"$ne": row["id"]}, "$or": alt}, sort=[("startMonth", 1)])
        if nxt:
            have = {(t.get("name") or "").lower(): i for i, t in enumerate(nxt.get("targets", []))}
            targets = list(nxt.get("targets", []))
            for t in carried:  # already assigned again by HR: just mark it Carried forward
                i = have.get(t["name"].lower())
                if i is None:
                    targets.append(t)
                else:
                    targets[i] = {**targets[i], "carriedForward": True, "carriedFrom": row["id"], "carriedFromQuarter": row.get("quarter")}
            col.update_one({"_id": nxt["_id"]}, {"$set": {"targets": targets, "updatedAt": now()}})
            new_id = nxt["id"]
        else:
            new_id = f"HY-{db.next_seq('halfyearly'):04d}"
            col.insert_one({
                "id": new_id, "employeeCode": row["employeeCode"], "employeeName": row.get("employeeName", ""),
                "quarter": next_quarter(row.get("quarter")), "startMonth": start, "endMonth": end,
                "targets": carried, "deliveries": [], "carriedForward": True, "carriedFrom": row["id"],
                "assignedBy": f"Carried forward ({by})", "createdAt": now(), "updatedAt": now(),
            })
        names = {t["name"].lower() for t in pend}
        targets = [{**t, "carriedTo": new_id} if (t.get("name") or "").lower() in names and t.get("achieved") != "Yes" else t for t in row["targets"]]
        col.update_one({"_id": row["_id"]}, {"$set": {"targets": targets, "carriedTo": new_id, "carriedAt": now()}})
        done.append(row["id"])
    if done:
        log.info("Certifications carried forward from %s", ", ".join(done))
    return done


# ------------------------------------------------------------------ emails (sent only when HR clicks Send)

def completed_targets(row: dict) -> list[dict]:
    return [t for t in row.get("targets", []) if t.get("achieved") == "Yes" and t.get("name") and not t.get("completedMail")]


def values_for(row: dict, name: str, hr_email: str, targets: list[dict], kind: str) -> dict:
    span = max(0, months_between(row["startMonth"], row["endMonth"])) if row.get("startMonth") and row.get("endMonth") else 0
    nxt_start = add_months(row["endMonth"], 1) if row.get("endMonth") else ""
    lines = []
    for i, t in enumerate(targets, 1):
        extra = f" (Course {t['courseId']})" if t.get("courseId") else ""
        if kind == "completed":
            done = ", ".join(x for x in (f"completed on {t['completionDate']}" if t.get("completionDate") else "", f"code {t['certificationCode']}" if t.get("certificationCode") else "") if x)
            extra += f" - {done}" if done else ""
        lines.append(f"  {i}. {t['name']}{extra}")
    return {
        "name": name, "code": row.get("employeeCode", ""), "quarter": row.get("quarter") or "the quarter",
        "period": f"{month_label(row.get('startMonth', ''))} to {month_label(row.get('endMonth', ''))}",
        "courses": "\n".join(lines), "nextQuarter": next_quarter(row.get("quarter")) or "the next quarter",
        "nextPeriod": f"{month_label(nxt_start)} to {month_label(add_months(nxt_start, span))}" if nxt_start else "",
        "hrEmail": hr_email or "HR",
    }


def compose(kind: str, row: dict, name: str, hr_email: str, targets: list[dict] | None = None) -> tuple[str, str]:
    tpl = templates()[kind]
    if targets is None:
        targets = pending_targets(row) if kind == "deferred" else completed_targets(row)
    v = values_for(row, name, hr_email, targets, kind)
    return fill(tpl["subject"], v), fill(tpl["body"], v)


def deferred_mail(row: dict, name: str, hr_email: str) -> tuple[str, str]:
    return compose("deferred", row, name, hr_email)


def pending_mails(kind: str, today: date | None = None) -> list[dict]:
    """Rows waiting for this email, with what would be sent."""
    out = []
    if kind == "deferred":
        rows = col.find({"endMonth": {"$lt": month_of(today or local_today())}, "deferredMail": {"$exists": False}})
        pick = pending_targets
    else:
        rows = col.find({"targets": {"$elemMatch": {"achieved": "Yes", "completedMail": {"$exists": False}}}})
        pick = completed_targets
    for row in rows:
        targets = pick(row)
        if targets:
            u = db.users.find_one({"code": row["employeeCode"]}, {"email": 1, "name": 1}) or {}
            out.append({"row": row, "targets": targets, "name": u.get("name") or row.get("employeeName", ""), "email": u.get("email") or ""})
    return out


def preview(kind: str) -> list[dict]:
    return [{"id": p["row"]["id"], "employeeCode": p["row"]["employeeCode"], "name": p["name"], "email": p["email"], "quarter": p["row"].get("quarter"),
             "courses": [t["name"] for t in p["targets"]]} for p in pending_mails(kind)]


def send(kind: str, by: str, ids: list[str] | None = None) -> dict:
    """Sends the Deferred Report or the Certification Completed email to every row waiting for it (or only `ids`)."""
    hr_email = get_settings()["hrEmail"]
    sent, skipped, failed = [], [], []
    if not mailer.smtp_configured():
        return {"sent": [], "skipped": [], "failed": [], "error": "Email is not set up on the server (SMTP_* in backend/.env)."}
    for p in pending_mails(kind):
        row = p["row"]
        if ids and row["id"] not in ids:
            continue
        if not p["email"]:
            skipped.append({"id": row["id"], "name": p["name"], "reason": "No email in Employees"})
            continue
        subject, text = compose(kind, row, p["name"], hr_email, p["targets"])
        try:
            mailer.send_mail(p["email"], subject, text, reply_to=hr_email or None, cc=[hr_email] if hr_email else None)
        except Exception as e:  # noqa: BLE001 - one failure must not stop the others; can be sent again
            log.warning("%s email for %s failed: %s", kind, row["id"], e)
            failed.append({"id": row["id"], "name": p["name"], "error": str(e)})
            continue
        mark = {"status": "Sent", "to": p["email"], "from": hr_email, "at": now(), "by": by}
        if kind == "deferred":
            col.update_one({"_id": row["_id"]}, {"$set": {"deferredMail": mark}})
        else:
            names = {t["name"] for t in p["targets"]}
            targets = [{**t, "completedMail": mark} if t.get("name") in names and t.get("achieved") == "Yes" else t for t in row["targets"]]
            col.update_one({"_id": row["_id"]}, {"$set": {"targets": targets}})
        sent.append({"id": row["id"], "name": p["name"], "to": p["email"]})
    summary = {"at": now(), "by": by, "sent": len(sent), "skipped": len(skipped), "failed": len(failed)}
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"lastSend.{kind}": summary}}, upsert=True)
    return {"sent": sent, "skipped": skipped, "failed": failed}


def run(today: date | None = None, by: str = "System") -> dict:
    """Daily job: only the carry over. Emails are sent by HR with the Send buttons."""
    carried = carry_over(today, by)
    summary = {"at": now(), "by": by, "carried": carried}
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastRun": {"at": summary["at"], "by": by, "carried": len(carried)}}}, upsert=True)
    return summary


# ------------------------------------------------------------------ daily run inside the API process

def _claim_today(today: str) -> bool:
    """Only one API worker runs the job per day, even with several uvicorn workers."""
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$setOnInsert": {"hrEmail": ""}}, upsert=True)
    res = db.db.settings.update_one({"_id": SETTINGS_ID, "claimedDate": {"$ne": today}}, {"$set": {"claimedDate": today}})
    return res.modified_count == 1


def _loop() -> None:
    hh, mm = (int(x) for x in settings.cert_followup_time.split(":"))
    while True:
        try:
            t = local_now()
            if (t.hour, t.minute) >= (hh, mm) and _claim_today(t.date().isoformat()):
                res = run(by="Scheduled job")
                log.info("Certification carry over: %s row(s) carried", len(res["carried"]))
        except Exception:  # never let the scheduler thread die
            log.exception("Certification follow-up failed")
        time.sleep(600)


def start_scheduler() -> None:
    if not settings.cert_followup_enabled:
        log.info("Certification follow-up inside the API is off (CERT_FOLLOWUP_ENABLED=false)")
        return
    threading.Thread(target=_loop, name="cert-followup", daemon=True).start()
    log.info("Certification follow-up runs daily at %s local time", settings.cert_followup_time)
