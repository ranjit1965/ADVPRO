"""Halfyearly certifications after a quarter ends (HR › Certification Status).

When the ending month of a row is over and a target certification is not completed (Achieved is not Yes):
  * Carry over: the unfinished targets move to the next quarter of that employee, marked "Carried forward"
    (H1 → H2 ... H6 → H1, same number of months, starting the month after the old ending month). If HR already
    assigned that next quarter, the targets are added to it. The old row keeps them, marked as carried.
  * Deferred report: one email per row, from the HR mail to the employee's email stored in Employees, listing the
    unfinished certifications. The HR mail id is set by the Super Admin; it is the Reply-To and gets a copy (CC).
Both run once a day inside the API (CERT_FOLLOWUP_ENABLED) and can be run at once by the Super Admin.
Every row is handled once: `carriedTo` and `deferredMail` mark it.
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


# ------------------------------------------------------------------ settings (HR mail id)

def get_settings() -> dict:
    doc = db.db.settings.find_one({"_id": SETTINGS_ID}) or {}
    doc.pop("_id", None)
    return {"hrEmail": doc.get("hrEmail", ""), "updatedBy": doc.get("updatedBy"), "updatedAt": doc.get("updatedAt"),
            "lastRun": doc.get("lastRun"), "enabled": settings.cert_followup_enabled, "time": settings.cert_followup_time}


def save_settings(hr_email: str, by: str) -> dict:
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"hrEmail": hr_email.strip(), "updatedBy": by, "updatedAt": now()}}, upsert=True)
    return get_settings()


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
        nxt = col.find_one({"employeeCode": row["employeeCode"], "startMonth": start, "id": {"$ne": row["id"]}})
        if nxt:
            have = {(t.get("name") or "").lower() for t in nxt.get("targets", [])}
            add = [t for t in carried if t["name"].lower() not in have]
            col.update_one({"_id": nxt["_id"]}, {"$push": {"targets": {"$each": add}}, "$set": {"updatedAt": now()}})
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


# ------------------------------------------------------------------ deferred report email

def deferred_mail(row: dict, name: str, hr_email: str) -> tuple[str, str]:
    """Subject and text of the Deferred Report: certifications not finished in the quarter."""
    pend = pending_targets(row)
    q = row.get("quarter") or "the quarter"
    period = f"{month_label(row['startMonth'])} to {month_label(row['endMonth'])}"
    nxt_start = add_months(row["endMonth"], 1)
    nxt_end = add_months(nxt_start, max(0, months_between(row["startMonth"], row["endMonth"])))
    nq = next_quarter(row.get("quarter")) or "the next quarter"
    lines = "\n".join(f"  {i}. {t['name']}" + (f" (Course {t['courseId']})" if t.get("courseId") else "") for i, t in enumerate(pend, 1))
    subject = f"Deferred Report: certification pending for {q} ({period})"
    text = (
        f"Dear {name},\n\n"
        f"As per the Halfyearly Program Report, the target certification(s) assigned to you for {q} ({period}) "
        f"were not completed by the end of the quarter:\n\n{lines}\n\n"
        f"These certification(s) are carried forward to {nq} ({month_label(nxt_start)} to {month_label(nxt_end)}) "
        "and are shown as Carried forward on your dashboard.\n"
        "Please complete them within this quarter and share the completion date and certification code with HR.\n\n"
        + (f"For any help, reply to this email or write to {hr_email}.\n\n" if hr_email else "")
        + "Regards,\nHR\nAdvantage Pro\n\n"
        "This is an automatic email from the Daily Entry Report."
    )
    return subject, text


def send_deferred(today: date | None = None, by: str = "System") -> dict:
    """Emails every ended row with unfinished targets that was not emailed yet. Returns a summary."""
    cfg = get_settings()
    hr_email = cfg["hrEmail"]
    sent, skipped, failed = [], [], []
    if not mailer.smtp_configured():
        return {"sent": [], "skipped": [], "failed": [], "error": "Email is not set up on the server (SMTP_* in backend/.env)."}
    for row in col.find({"endMonth": {"$lt": month_of(today or local_today())}, "deferredMail": {"$exists": False}}):
        if not pending_targets(row):
            continue
        u = db.users.find_one({"code": row["employeeCode"]}, {"email": 1, "name": 1}) or {}
        name = u.get("name") or row.get("employeeName", "")
        if not u.get("email"):
            col.update_one({"_id": row["_id"]}, {"$set": {"deferredMail": {"status": "No email", "at": now(), "by": by}}})
            skipped.append({"id": row["id"], "name": name, "reason": "No email in Employees"})
            continue
        subject, text = deferred_mail(row, name, hr_email)
        try:
            mailer.send_mail(u["email"], subject, text, reply_to=hr_email or None, cc=[hr_email] if hr_email else None)
            col.update_one({"_id": row["_id"]}, {"$set": {"deferredMail": {"status": "Sent", "to": u["email"], "from": hr_email, "at": now(), "by": by}}})
            sent.append({"id": row["id"], "name": name, "to": u["email"]})
        except Exception as e:  # noqa: BLE001 - one failure must not stop the others; tried again on the next run
            log.warning("Deferred report for %s failed: %s", row["id"], e)
            failed.append({"id": row["id"], "name": name, "error": str(e)})
    return {"sent": sent, "skipped": skipped, "failed": failed}


def run(today: date | None = None, by: str = "System") -> dict:
    carried = carry_over(today, by)
    mail = send_deferred(today, by)
    summary = {"at": now(), "by": by, "carried": carried, **mail}
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastRun": {k: (len(v) if isinstance(v, list) else v) for k, v in summary.items()}}}, upsert=True)
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
                log.info("Certification follow-up: %s carried, %s emailed", len(res["carried"]), len(res["sent"]))
        except Exception:  # never let the scheduler thread die
            log.exception("Certification follow-up failed")
        time.sleep(600)


def start_scheduler() -> None:
    if not settings.cert_followup_enabled:
        log.info("Certification follow-up inside the API is off (CERT_FOLLOWUP_ENABLED=false)")
        return
    threading.Thread(target=_loop, name="cert-followup", daemon=True).start()
    log.info("Certification follow-up runs daily at %s local time", settings.cert_followup_time)
