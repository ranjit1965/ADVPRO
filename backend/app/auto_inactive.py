"""Make an employee inactive when they saved no daily entry on their last 3 working days.

Rules (all set in backend/.env, see AUTO_INACTIVE_* in .env.example):
* Only employees with the FACULTY role are checked (AUTO_INACTIVE_ROLES). Manager, Admin, HR and
  Staff are never made inactive by this job.
* Working days are Monday to Saturday (AUTO_INACTIVE_WEEKLY_OFF=6 means Sunday is off) minus the
  dates in AUTO_INACTIVE_HOLIDAYS and minus that employee's own approved leave days.
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
MAX_LOOKBACK_DAYS = 60  # 3 working days are always found well inside this window


def local_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)


def local_today() -> date:
    return local_now().date()


def _csv(value: str) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def holidays() -> set[str]:
    return set(_csv(settings.auto_inactive_holidays))


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


def _leave_days(user_id: str, frm: date, to: date) -> set[str]:
    days: set[str] = set()
    q = {"userId": user_id, "status": "Approved", "kind": "Leave", "dateFrom": {"$lte": to.isoformat()}}
    for r in db.leave_requests.find(q):
        start = date.fromisoformat(r["dateFrom"])
        end = date.fromisoformat(r.get("dateTo") or r["dateFrom"])
        d = max(start, frm)
        while d <= min(end, to):
            days.add(d.isoformat())
            d += timedelta(days=1)
    return days


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
    leave = _leave_days(u["userId"], first, last)
    working: list[str] = []
    d = last
    while d >= first and len(working) < settings.auto_inactive_days:
        iso = d.isoformat()
        if d.weekday() not in off and iso not in hol and iso not in leave:
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
    roles = [r.upper() for r in _csv(settings.auto_inactive_roles)]
    found = []
    for u in db.users.find({"active": {"$ne": False}, "role": {"$in": roles}}).sort("name"):
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
            db.users.update_one(
                {"userId": f["userId"], "active": {"$ne": False}},
                {"$set": {"active": False, "autoInactive": True, "inactiveAt": now, "inactiveBy": by, "inactiveReason": reason}},
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
        "roles": _csv(settings.auto_inactive_roles),
        "weeklyOff": sorted(weekly_off()),
        "holidays": sorted(holidays()),
    }


# ------------------------------------------------------------ daily run inside the API process

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
