"""Make an employee inactive when they saved no daily entry on their last 3 working days.

v60:
* The Super Admin picks which roles are checked (Employees › Missing entries check), e.g. Faculty, Lab Support
  or a role they created; the default is Faculty. Super Admin, Admin and HR are never checked (NEVER below).
* On the 4th morning (AUTO_INACTIVE_TIME) each person found first gets a WhatsApp message on their phone
  (WA_INACTIVE_TEMPLATE_*) and an email to their personal and official email, then is made inactive.
* Holidays from Admin › Yearly Holidays and days the person declared Absent / Week off are not counted.
* An inactive employee cannot sign in; their name still shows in the lists and reports.
* The check also starts by itself on the first request after AUTO_INACTIVE_TIME (kick()), so it runs on a
  host where no background thread stays alive (e.g. Vercel). It runs once per day.

Rules (all set in backend/.env, see AUTO_INACTIVE_* in .env.example):
* Working days are Monday to Saturday (AUTO_INACTIVE_WEEKLY_OFF=6 means Sunday is off) minus the
  dates in AUTO_INACTIVE_HOLIDAYS.
* Today is never counted (the employee may still enter it). The job looks at the 3 most recent
  working days before today; if none of them has a single entry, the employee is set inactive.
* Only days on or after the day this feature went live are counted, and only days AFTER the
  employee was created or last made active again by a manager / admin. So someone reactivated
  today gets 3 fresh working days before the job can switch them off again.

Run it:
* automatically inside the API (AUTO_INACTIVE_ENABLED=true, at AUTO_INACTIVE_TIME local time), or
* from cron / Windows Task Scheduler:  cd backend && python -m app.auto_inactive
  (add --dry-run to only list who would be made inactive).
"""
import argparse
import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone

from . import db
from .config import settings

log = logging.getLogger("der.auto_inactive")
SETTINGS_ID = "autoInactive"
ROLES = ("FACULTY",)  # default roles checked, until the Super Admin picks others
NEVER = ("MANAGER", "ADMIN", "HR", "MIS")  # never made inactive by this job

NOTICE_SUBJECT = "Daily entry not submitted: your login is made inactive"
NOTICE_TEXT = """Dear {name},

Our records show that no daily entry was submitted in the Daily Entry Report for {count} working days in a row: {days}.

As per the office rule, your login is made inactive from today ({date}). Your entries and records are kept.

Please contact HR or your Admin to make your login active again, and submit the pending daily entries.

Regards,
HR Team
Vectra Technosoft Pvt. Ltd. - Advantage Pro"""


def checked_roles() -> list[str]:
    """Roles the Super Admin picked (settings.autoInactive.roles), never Super Admin / Admin / HR."""
    cfg = db.db.settings.find_one({"_id": SETTINGS_ID}, {"roles": 1}) or {}
    roles = cfg.get("roles") or list(ROLES)
    return [r for r in roles if r not in NEVER]


def set_roles(roles: list[str], by: str) -> list[str]:
    clean = sorted({r.strip().upper() for r in roles if r.strip() and r.strip().upper() not in NEVER})
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"roles": clean, "rolesBy": by, "rolesAt": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return clean
MAX_LOOKBACK_DAYS = 60  # 3 working days are always found well inside this window


def local_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)


def local_today() -> date:
    return local_now().date()


def _csv(value: str) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def holidays() -> set[str]:
    """AUTO_INACTIVE_HOLIDAYS plus the holidays saved in Admin › Yearly Holidays / Add H."""
    return set(_csv(settings.auto_inactive_holidays)) | {h["_id"] for h in db.db.holidays.find({}, {"_id": 1})}


def declared(code: str) -> set[str]:
    """Days the person declared Absent / Week off in the daily entry (v60): not counted as missing."""
    return {d["date"] for d in db.db.day_declarations.find({"code": code}, {"_id": 0, "date": 1})}


def weekly_off() -> set[int]:
    # ISO weekday: Monday=0 ... Sunday=6 (Python date.weekday()).
    return {int(v) for v in _csv(settings.auto_inactive_weekly_off)}


def ensure_settings() -> dict:
    """Remember the day the feature went live, so days before it never count."""
    db.db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$setOnInsert": {"startDate": settings.auto_inactive_start_date or local_today().isoformat()}},
        upsert=True,
    )
    return db.db.settings.find_one({"_id": SETTINGS_ID})


def _local_date(iso: str | None) -> date | None:
    """createdAt / reactivatedAt are saved in UTC; turn them into the office's local date."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt.astimezone(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)).date()


def check_user(u: dict, today: date, start_date: date, off: set[int], hol: set[str]) -> dict | None:
    """Return the missed working days if this employee should be made inactive, else None."""
    first = start_date
    for key in ("createdAt", "reactivatedAt"):
        d = _local_date(u.get(key))
        if d and d + timedelta(days=1) > first:
            first = d + timedelta(days=1)  # count only the days after creation / reactivation
    last = today - timedelta(days=1)
    if first > last:
        return None
    first = max(first, last - timedelta(days=MAX_LOOKBACK_DAYS))
    working: list[str] = []
    d = last
    mine = declared(u["code"])
    while d >= first and len(working) < settings.auto_inactive_days:
        iso = d.isoformat()
        if d.weekday() not in off and iso not in hol and iso not in mine:
            working.append(iso)
        d -= timedelta(days=1)
    if len(working) < settings.auto_inactive_days:
        return None  # not enough working days yet since go-live / reactivation
    if db.entries.find_one({"facultyCode": u["code"], "activityDate": {"$in": working}}, {"_id": 1}):
        return None
    return {"userId": u["userId"], "code": u["code"], "name": u.get("name", ""), "role": u.get("role", ""), "missedDays": sorted(working)}


def find_missing(today: date | None = None) -> list[dict]:
    cfg = ensure_settings()
    today = today or local_today()
    start = date.fromisoformat(cfg["startDate"])
    off, hol = weekly_off(), holidays()
    found = []
    for u in db.users.find({"active": {"$ne": False}, "role": {"$in": checked_roles()}}).sort("name"):
        hit = check_user(u, today, start, off, hol)
        if hit:
            found.append(hit)
    return found


def run(dry_run: bool = False, today: date | None = None, by: str = "Scheduled job") -> dict:
    """Make every employee who missed their last 3 working days inactive. Safe to run many times."""
    today = today or local_today()
    found = find_missing(today)
    if not dry_run:
        now = datetime.now(timezone.utc).isoformat()
        for f in found:
            reason = "No daily entry on " + ", ".join(f["missedDays"])
            notice = notify(f, today)  # WhatsApp + email first, then inactive
            db.users.update_one(
                {"userId": f["userId"], "active": {"$ne": False}, "role": {"$in": checked_roles()}},
                {"$set": {"active": False, "autoInactive": True, "inactiveAt": now, "inactiveBy": by, "inactiveReason": reason, "inactiveNotice": notice}},
            )
            log.info("Made %s (%s) inactive: %s", f["name"], f["code"], reason)
        db.db.settings.update_one(
            {"_id": SETTINGS_ID},
            {"$set": {"lastRunAt": now, "lastRunDate": today.isoformat(), "lastRunBy": by, "lastRunCount": len(found), "lastRunNames": [f"{f['name']} ({f['code']})" for f in found]}},
        )
    return {"dryRun": dry_run, "date": today.isoformat(), "count": len(found), "employees": found}


def status() -> dict:
    cfg = ensure_settings()
    cfg.pop("_id", None)
    return {
        **cfg,
        "enabled": settings.auto_inactive_enabled,
        "time": settings.auto_inactive_time,
        "days": settings.auto_inactive_days,
        "roles": checked_roles(),
        "never": list(NEVER),
        "whatsappTemplate": settings.wa_inactive_template_name,
        "emailSubject": NOTICE_SUBJECT,
        "emailText": NOTICE_TEXT,
        "weeklyOff": sorted(weekly_off()),
        "holidays": sorted(holidays()),
    }


# ------------------------------------------------------------ the message before making someone inactive

def _dmy(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}"


def notify(f: dict, today: date) -> dict:
    """WhatsApp (WA_INACTIVE_TEMPLATE_NAME) to the person's phone and an email to their personal and official
    email. Never raises: the result is kept on the user as inactiveNotice."""
    from . import whatsapp  # noqa: PLC0415
    from .mailer import send_mail  # noqa: PLC0415

    u = db.users.find_one({"userId": f["userId"]}) or {}
    days = ", ".join(_dmy(d) for d in f["missedDays"])
    values = {"name": u.get("name", ""), "code": u.get("code", ""), "employeeId": u.get("employeeId", ""), "days": days,
              "count": str(len(f["missedDays"])), "date": _dmy(today.isoformat())}
    out: dict = {"at": datetime.now(timezone.utc).isoformat(), "whatsapp": "", "email": ""}
    phone = str(u.get("phone") or "")
    if not settings.wa_inactive_template_name:
        out["whatsapp"] = "not set (WA_INACTIVE_TEMPLATE_NAME)"
    elif not phone:
        out["whatsapp"] = "no phone number"
    else:
        try:
            params = whatsapp.template_params(values, settings.wa_inactive_template_params)
            whatsapp.send_template(whatsapp._number(phone), params, settings.wa_inactive_template_name, settings.wa_inactive_template_lang or None)  # noqa: SLF001
            out["whatsapp"] = "sent"
        except Exception as exc:  # noqa: BLE001
            out["whatsapp"] = f"failed: {exc}"[:300]
    to = [e for e in dict.fromkeys([u.get("personalEmail"), u.get("email")]) if e]
    if not to:
        out["email"] = "no email"
    else:
        try:
            send_mail(to, NOTICE_SUBJECT, NOTICE_TEXT.format(**values))
            out["email"] = "sent to " + ", ".join(to)
        except Exception as exc:  # noqa: BLE001
            out["email"] = f"failed: {exc}"[:300]
    log.info("Inactive notice for %s: WhatsApp %s, email %s", values["name"], out["whatsapp"], out["email"])
    return out


# ------------------------------------------------------------ daily run inside the API process

_kicked = {"date": ""}


def kick() -> None:
    """Called on every request: after AUTO_INACTIVE_TIME, the first request of the day starts the check in the
    background (for hosts where no scheduler thread keeps running). Cheap: one memory check per request."""
    if not settings.auto_inactive_enabled:
        return
    now = local_now()
    today = now.date().isoformat()
    if _kicked["date"] == today:
        return
    hh, mm = (int(x) for x in settings.auto_inactive_time.split(":"))
    if (now.hour, now.minute) < (hh, mm):
        return
    _kicked["date"] = today

    def go():
        try:
            if _claim_today(today):
                res = run(by="Scheduled job")
                log.info("Missing-entry check done: %s employee(s) made inactive", res["count"])
        except Exception:  # noqa: BLE001
            log.exception("Missing-entry check failed")

    threading.Thread(target=go, name="auto-inactive-kick", daemon=True).start()

def _claim_today(today: str) -> bool:
    """Only one API worker runs the job per day, even with several uvicorn workers."""
    res = db.db.settings.update_one({"_id": SETTINGS_ID, "lastRunDate": {"$ne": today}, "claimedDate": {"$ne": today}}, {"$set": {"claimedDate": today}})
    return res.modified_count == 1


def _loop() -> None:
    hh, mm = (int(x) for x in settings.auto_inactive_time.split(":"))
    while True:
        try:
            now = local_now()
            if (now.hour, now.minute) >= (hh, mm) and _claim_today(now.date().isoformat()):
                res = run(by="Scheduled job")
                log.info("Missing-entry check done: %s employee(s) made inactive", res["count"])
        except Exception:  # never let the scheduler thread die
            log.exception("Missing-entry check failed")
        time.sleep(300)


def start_scheduler() -> None:
    if not settings.auto_inactive_enabled:
        log.info("Missing-entry check inside the API is off (AUTO_INACTIVE_ENABLED=false)")
        return
    ensure_settings()
    threading.Thread(target=_loop, name="auto-inactive", daemon=True).start()
    log.info("Missing-entry check runs daily at %s local time", settings.auto_inactive_time)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="Make employees inactive who saved no daily entry on their last 3 working days.")
    p.add_argument("--dry-run", action="store_true", help="only list who would be made inactive")
    p.add_argument("--date", help="pretend today is YYYY-MM-DD (for testing)")
    a = p.parse_args()
    res = run(dry_run=a.dry_run, today=date.fromisoformat(a.date) if a.date else None, by="Command line")
    verb = "Would make" if a.dry_run else "Made"
    print(f"{verb} {res['count']} employee(s) inactive (checked on {res['date']}).")
    for e in res["employees"]:
        print(f"  {e['name']} ({e['code']}, {e['role']}): no entry on {', '.join(e['missedDays'])}")


if __name__ == "__main__":
    main()
