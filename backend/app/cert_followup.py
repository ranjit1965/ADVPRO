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
v52: the mail ids come from the employee records (no typing): the email is sent from the HR mail (the HR user's
email in Employees; the HR who clicks Send, else the first active HR) with the Super Admin's email in CC.
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


def _email_of(q: dict) -> dict:
    u = db.users.find_one({**q, "active": {"$ne": False}, "email": {"$nin": [None, ""]}}, {"name": 1, "code": 1, "email": 1}, sort=[("name", 1)])
    return {"name": u.get("name", ""), "code": u.get("code", ""), "email": u["email"]} if u else {}


def mail_ids(me: dict | None = None) -> dict:
    """HR mail and Super Admin mail from the employee records: the HR clicking Send when they have an email,
    else the first active HR user with an email; the Super Admin (MANAGER) user's email for the CC."""
    hr = {"name": me.get("name", ""), "code": me.get("code", ""), "email": me["email"]} if me and me.get("role") == "HR" and me.get("email") else _email_of({"role": "HR"})
    return {"hr": hr, "superAdmin": _email_of({"role": "MANAGER"})}


def get_settings(me: dict | None = None) -> dict:
    doc = db.db.settings.find_one({"_id": SETTINGS_ID}) or {}
    ids = mail_ids(me)
    return {"hrEmail": ids["hr"].get("email", ""), "ccEmail": ids["superAdmin"].get("email", ""), "hrUser": ids["hr"], "superAdminUser": ids["superAdmin"], "updatedBy": doc.get("updatedBy"), "updatedAt": doc.get("updatedAt"),
            "lastRun": doc.get("lastRun"), "lastSend": doc.get("lastSend") or {}, "enabled": settings.cert_followup_enabled,
            "time": settings.cert_followup_time, "templates": templates(), "placeholders": PLACEHOLDERS}


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
    for old in list(col.find({"endMonth": {"$lt": month_of(today or local_today())}, "carriedTo": {"$exists": False}}, {"_id": 1}).sort("startMonth", 1)):
        # v58: read the row again; an earlier row of this run may have just added carried targets to it
        # (reading it once at the start wrote the old targets back and lost those carried targets).
        row = col.find_one({"_id": old["_id"]})
        if not row:
            continue
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


def _drop_copy(src_id: str, name: str, nxt_id: str) -> None:
    """Removes the carried copy of `name` (from row `src_id`) in row `nxt_id`, and further along if that copy
    was carried again. A copy with a status of its own (Yes, a date or a code) is kept."""
    nxt = col.find_one({"id": nxt_id})
    if not nxt:
        return
    keep, dropped = [], None
    for c in nxt.get("targets", []):
        copy = dropped is None and c.get("carriedFrom") == src_id and (c.get("name") or "").lower() == name
        if copy and c.get("achieved") != "Yes" and not c.get("completionDate") and not c.get("certificationCode"):
            dropped = c
            continue
        keep.append(c)
    if dropped is None:
        return
    if not keep and not nxt.get("deliveries") and str(nxt.get("assignedBy") or "").startswith("Carried forward"):
        col.delete_one({"_id": nxt["_id"]})  # the row only held carried copies
    else:
        col.update_one({"_id": nxt["_id"]}, {"$set": {"targets": keep, "updatedAt": now()}})
    if dropped.get("carriedTo"):
        _drop_copy(nxt["id"], name, dropped["carriedTo"])


def undo_completed_carries() -> int:
    """v58: a certification marked Completed Yes in its own quarter after it was carried forward is no longer
    carried: its copy in the next quarter(s) is removed (only while that copy has no status of its own), the
    "Moved to next quarter" mark goes, and a next-quarter row that only held carried copies is deleted."""
    fixed = 0
    for row in col.find({"targets": {"$elemMatch": {"achieved": "Yes", "carriedTo": {"$exists": True}}}}):
        targets = list(row.get("targets", []))
        for i, t in enumerate(targets):
            if t.get("achieved") == "Yes" and t.get("carriedTo"):
                _drop_copy(row["id"], (t.get("name") or "").lower(), t["carriedTo"])
                targets[i] = {k: v for k, v in t.items() if k != "carriedTo"}
                fixed += 1
        col.update_one({"_id": row["_id"]}, {"$set": {"targets": targets}})
    if fixed:
        log.info("Carried certifications undone after completion: %s", fixed)
    return fixed


# ------------------------------------------------------------------ emails (sent only when HR clicks Send)

def completed_targets(row: dict) -> list[dict]:
    return [t for t in row.get("targets", []) if t.get("achieved") == "Yes" and t.get("name") and not t.get("completedMail")]


def period_of(row: dict) -> str:
    """'01 Jan 2026 to 30 Jun 2026' when HR picked dates (v52), else 'Jan 2026 to Jun 2026'."""
    if row.get("startDate") and row.get("endDate"):
        f = lambda d: datetime.strptime(d[:10], "%Y-%m-%d").strftime("%d/%m/%Y")  # noqa: E731
        return f"{f(row['startDate'])} to {f(row['endDate'])}"
    return f"{month_label(row.get('startMonth', ''))} to {month_label(row.get('endMonth', ''))}"


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
        "period": period_of(row),
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
            u = db.users.find_one({"code": row["employeeCode"]}, {"email": 1, "personalEmail": 1, "name": 1}) or {}
            out.append({"row": row, "targets": targets, "name": u.get("name") or row.get("employeeName", ""), "email": u.get("email") or u.get("personalEmail") or ""})
    return out


def running_not_completed(today: date | None = None) -> list[dict]:
    """Quarters still running with certifications not completed yet: listed under the Deferred Report, not emailed
    (the Deferred Report is for a quarter that has ended)."""
    out = []
    for row in col.find({"endMonth": {"$gte": month_of(today or local_today())}}).sort("endMonth"):
        targets = pending_targets(row)
        if targets:
            u = db.users.find_one({"code": row["employeeCode"]}, {"email": 1, "personalEmail": 1, "name": 1}) or {}
            out.append({"id": row["id"], "employeeCode": row["employeeCode"], "name": u.get("name") or row.get("employeeName", ""), "email": u.get("email") or u.get("personalEmail") or "",
                        "quarter": row.get("quarter"), "endMonth": row.get("endMonth"), "endLabel": month_label(row.get("endMonth", "")), "courses": [t["name"] for t in targets]})
    return out


def preview(kind: str) -> list[dict]:
    return [{"id": p["row"]["id"], "employeeCode": p["row"]["employeeCode"], "name": p["name"], "email": p["email"], "quarter": p["row"].get("quarter"),
             "courses": [t["name"] for t in p["targets"]]} for p in pending_mails(kind)]


def send(kind: str, by: str, ids: list[str] | None = None, me: dict | None = None) -> dict:
    """Sends the Deferred Report or the Certification Completed email to every row waiting for it (or only `ids`),
    from the HR mail with the Super Admin mail in CC (both from the employee records)."""
    cfg = get_settings(me)
    hr_email = cfg["hrEmail"]
    cc = [e for e in (cfg["ccEmail"],) if e and e.lower() != (hr_email or "").lower()]  # the Super Admin gets a copy
    sent, skipped, failed = [], [], []
    if not mailer.smtp_configured():
        return {"sent": [], "skipped": [], "failed": [], "error": "Email is not set up on the server (SMTP_* in backend/.env)."}
    if not hr_email:
        return {"sent": [], "skipped": [], "failed": [], "error": "No HR mail: add the email of the HR user in Employees."}
    for p in pending_mails(kind):
        row = p["row"]
        if ids and row["id"] not in ids:
            continue
        if not p["email"]:
            skipped.append({"id": row["id"], "name": p["name"], "reason": "No email in Employees"})
            continue
        subject, text = compose(kind, row, p["name"], hr_email, p["targets"])
        try:
            mailer.send_mail(p["email"], subject, text, reply_to=hr_email, cc=cc or None, from_name="HR", from_addr=hr_email)
        except Exception as e:  # noqa: BLE001 - one failure must not stop the others; can be sent again
            log.warning("%s email for %s failed: %s", kind, row["id"], e)
            failed.append({"id": row["id"], "name": p["name"], "error": str(e)})
            continue
        mark = {"status": "Sent", "to": p["email"], "from": hr_email, "cc": cc, "at": now(), "by": by}
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
