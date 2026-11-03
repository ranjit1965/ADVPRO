r"""Master › Batch Import.

The batch file comes from BATCH_IMPORT_PATH in backend/.env (a folder such as the shared
\\192.168.0.129\Test\DAILY_REPORT_SOFTWARE_2026, or one file), or else from the path saved on the page.
It is imported automatically once a month (BATCH_IMPORT_DAY / BATCH_IMPORT_HOUR) and whenever
Manager / Admin click "Import batches". The import reads every batch with its allotted faculty
short name, matches the short name to an employee code and saves the batch in Master › Batch (master_batches) assigned to that
employee. The Class tab then offers each faculty the batches assigned to them.
"""
import logging
import re
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..batch_files import DEFAULT_TABLE, BatchRow, read_file, resolve_file
from ..config import settings
from ..security import require_roles

log = logging.getLogger("der.batch_import")
router = APIRouter(prefix="/batch-import", tags=["batch-import"])
master_roles = require_roles("MANAGER", "ADMIN")
SETTINGS_ID = "batchImport"
AUTO_USER = {"name": "Monthly auto import"}
CHECK_EVERY_SECONDS = 30 * 60
CLOSE_AFTER_DAYS = 60  # a batch whose end date is older than this is counted as Completed
CLASS_TYPES = {"weekdays": "WeekDays", "weekday": "WeekDays", "weekend": "WeekEnd", "weekends": "WeekEnd"}


class SettingsIn(BaseModel):
    filePath: str = Field(min_length=1, max_length=500)  # folder or file
    tableName: str = Field(default=DEFAULT_TABLE, max_length=64)


class MapIn(BaseModel):
    shortName: str = Field(min_length=1, max_length=50)
    code: str | None = None  # employee code; empty removes the link


def _settings() -> dict:
    return db.db.settings.find_one({"_id": SETTINGS_ID}) or {"_id": SETTINGS_ID, "filePath": "", "tableName": DEFAULT_TABLE, "facultyMap": {}}


def _source(s: dict) -> tuple[str, str]:
    """(folder or file path, Access table name): backend/.env first, then the path saved on the page."""
    env_path = settings.batch_import_path.strip().strip('"')
    return (env_path or s.get("filePath") or ""), (settings.batch_import_table.strip() if env_path else s.get("tableName")) or DEFAULT_TABLE


def _local_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)


def _public(s: dict) -> dict:
    out = {k: s.get(k) for k in ("lastImport", "lastAutoMonth", "lastAutoError", "updatedBy", "updatedAt")}
    out["filePath"], out["tableName"] = _source(s)
    out["fromEnv"] = bool(settings.batch_import_path.strip())
    out["autoDay"], out["autoHour"] = settings.batch_import_day, settings.batch_import_hour
    out["facultyMap"] = s.get("facultyMap") or {}
    try:
        out["file"], out["fileError"] = (str(resolve_file(out["filePath"])) if out["filePath"] else None), None
    except Exception as exc:  # share offline, no permission, empty folder
        out["file"], out["fileError"] = None, str(exc)
    return out


def _map_key(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().upper().replace(".", "_").replace("$", "_")


def _today() -> date:
    return (datetime.now(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)).date()


def batch_status(r: BatchRow, today: date) -> str:
    """Planned / Running / Break / Completed from the Access Status (C = closed, B = break) and the dates."""
    if r.status == "C" or (r.actualEndDate and r.actualEndDate <= today):
        return "Completed"
    if r.endDate and r.endDate < today - timedelta(days=CLOSE_AFTER_DAYS):
        return "Completed"
    if r.status == "B":
        return "Break"
    if r.startDate and r.startDate > today:
        return "Planned"
    return "Running"


@router.get("/settings")
def get_settings(_: dict = Depends(master_roles)):
    return _public(_settings())


@router.put("/settings")
def save_settings(body: SettingsIn, me: dict = Depends(master_roles)):
    if settings.batch_import_path.strip():
        raise HTTPException(400, "The path is set in backend/.env (BATCH_IMPORT_PATH). Change it there and restart the backend.")
    path = body.filePath.strip().strip('"')
    try:
        resolve_file(path)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    db.db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$set": {"filePath": path, "tableName": (body.tableName or DEFAULT_TABLE).strip(), "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return _public(_settings())


@router.put("/map")
def save_map(body: MapIn, me: dict = Depends(master_roles)):
    """Links a faculty short name from the Access file to an employee, then imports again."""
    key = _map_key(body.shortName)
    if body.code:
        if not db.users.find_one({"code": body.code}):
            raise HTTPException(400, "Unknown employee")
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"facultyMap.{key}": body.code}}, upsert=True)
    else:
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$unset": {f"facultyMap.{key}": ""}})
    return run_import(_settings(), me)


@router.post("/import")
def import_now(me: dict = Depends(master_roles)):
    return run_import(_settings(), me)


_import_lock = threading.Lock()  # one import at a time (button and monthly job)


def run_import(s: dict, me: dict, trigger: str = "Manual") -> dict:
    if not _import_lock.acquire(timeout=0 if trigger == "Manual" else 600):
        raise HTTPException(409, "A batch import is already running. Try again in a minute.")
    try:
        return _run_import(s, me, trigger)
    finally:
        _import_lock.release()


def _run_import(s: dict, me: dict, trigger: str) -> dict:
    source, table = _source(s)
    if not source:
        raise HTTPException(400, "Set BATCH_IMPORT_PATH in backend/.env, or save the file path on this page first")
    try:
        file_path = resolve_file(source)
        result = read_file(str(file_path), table)
    except Exception as exc:  # share offline, driver missing, wrong table, unreadable file
        raise HTTPException(400, f"Could not read the batch file: {exc}") from exc

    # Faculty short name -> employee: saved links first, then employee code, login ID or name.
    users = list(db.users.find({}, {"_id": 0, "code": 1, "userId": 1, "name": 1}))
    by_code = {u["code"].upper(): u for u in users if u.get("code")}
    by_user_id = {u["userId"].upper(): u for u in users if u.get("userId")}
    by_name = {re.sub(r"\s+", " ", u["name"]).strip().upper(): u for u in users if u.get("name")}
    fmap = s.get("facultyMap") or {}

    def match(short: str, name: str):
        key = _map_key(short)
        if key and key in fmap:
            return by_code.get(fmap[key].upper())
        return by_code.get(key) or by_user_id.get(key) or (by_name.get(_map_key(name)) if name else None)

    # The same batch number can appear twice (Access keeps "C1774" and "C1774<tab>" apart).
    # Same course and start date = one batch taught by both faculty; otherwise the later row gets "-2".
    groups: dict[str, list[BatchRow]] = defaultdict(list)
    for r in result.rows:
        groups[r.batchNo.upper()].append(r)
    batches: list[tuple[str, list[BatchRow]]] = []
    renamed: list[dict] = []
    for rows in groups.values():
        parts: list[list[BatchRow]] = []
        for r in rows:
            same = next((p for p in parts if p[0].course == r.course and p[0].startDate == r.startDate), None)
            if same:
                same.append(r)
            else:
                parts.append([r])
        for i, p in enumerate(parts):
            no = p[0].batchNo if i == 0 else f"{p[0].batchNo}-{i + 1}"
            if i:
                renamed.append({"from": p[0].batchNo, "to": no, "faculty": p[0].faculty, "course": p[0].course})
            batches.append((no, p))

    today = _today()
    col = db.db.master_batches
    existing = {d["batchNo"].upper(): d for d in col.find({}, {"_id": 0, "id": 1, "batchNo": 1, "mode": 1}) if d.get("batchNo")}
    course_ids = {c["id"].upper() for c in db.courses.find({}, {"id": 1})}
    now = datetime.now(timezone.utc).isoformat()
    unmatched: dict[str, dict] = {}
    created = updated = assigned = 0
    missing_courses: dict[str, int] = defaultdict(int)
    status_count: dict[str, int] = defaultdict(int)
    faculty_codes: set[str] = set()

    for no, rows in batches:
        first = rows[0]
        shorts = list(dict.fromkeys(r.faculty for r in rows if r.faculty))
        codes: list[str] = []
        for r in rows:
            u = match(r.faculty, r.facultyName) if r.faculty else None
            if u:
                codes.append(u["code"])
            elif r.faculty:
                item = unmatched.setdefault(r.faculty, {"shortName": r.faculty, "name": r.facultyName, "batches": 0, "lastBatch": "", "lastStart": ""})
                item["batches"] += 1
                start = r.startDate.isoformat() if r.startDate else ""
                if start >= item["lastStart"]:
                    item["lastBatch"], item["lastStart"] = no, start
        codes = list(dict.fromkeys(codes))
        faculty_codes.update(codes)
        assigned += bool(codes)
        status = batch_status(first, today)
        status_count[status] += 1
        if first.course and first.course not in course_ids:
            missing_courses[first.course] += 1
        timing = " - ".join(t.strftime("%H:%M") for t in (first.timeIn, first.timeOut) if t)
        rec = {
            "batchNo": no,
            "courseId": first.course,
            "facultyCode": codes[0] if codes else "",
            "otherFaculty": ", ".join(codes[1:]),
            "facultyShort": ", ".join(shorts),
            "startDate": first.startDate.isoformat() if first.startDate else "",
            "endDate": (first.actualEndDate or first.endDate).isoformat() if (first.actualEndDate or first.endDate) else "",
            "timing": timing,
            "classType": CLASS_TYPES.get(first.classType.lower().replace(" ", ""), ""),
            "totalHours": first.totalHours if first.totalHours is not None else "",
            "courseType": first.courseType,
            "status": status,
            "source": "Access",
            "importedAt": now,
        }
        old = existing.get(no.upper())
        if old:
            col.update_one({"id": old["id"]}, {"$set": {**rec, "batchNo": old["batchNo"] if old["batchNo"].upper() == no.upper() else no, "updatedBy": me["name"], "updatedAt": now}})
            updated += 1
        else:
            rec.update(id=f"BAT-{db.next_seq('master_batches'):04d}", mode="Center", createdBy=me["name"], createdAt=now)
            col.insert_one(rec)
            existing[no.upper()] = rec
            created += 1

    summary = {
        "at": now,
        "file": file_path.name,
        "path": str(file_path),
        "trigger": trigger,
        "by": me["name"],
        "rowsRead": len(result.rows),
        "skippedRows": result.skipped_rows,
        "batches": len(batches),
        "created": created,
        "updated": updated,
        "assigned": assigned,
        "faculty": len(faculty_codes),
        "status": dict(status_count),
        "renamed": renamed,
        "unmatched": sorted(unmatched.values(), key=lambda v: (-v["batches"], v["shortName"])),
        "missingCourses": sorted(missing_courses),
    }
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastImport": summary}}, upsert=True)
    return summary


_auto_lock = threading.Lock()


def auto_import_due(s: dict, now: datetime) -> bool:
    day = settings.batch_import_day
    return bool(day) and now.day >= day and now.hour >= settings.batch_import_hour and s.get("lastAutoMonth") != now.strftime("%Y-%m")


def run_auto_import(force: bool = False) -> dict | None:
    """The monthly import. Runs once a month, on BATCH_IMPORT_DAY or the first time the backend runs after it."""
    s, now = _settings(), _local_now()
    if not force and not auto_import_due(s, now):
        return None
    month = now.strftime("%Y-%m")
    try:
        with _auto_lock:
            if not force and not auto_import_due(_settings(), now):  # another check already did it
                return None
            summary = run_import(_settings(), AUTO_USER, trigger="Monthly")
            db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastAutoMonth": month, "lastAutoError": None}}, upsert=True)
    except Exception as exc:  # keep the error for the page; try again at the next check
        msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastAutoError": f"{now:%d-%m-%Y %H:%M}: {msg}"}}, upsert=True)
        log.warning("Monthly batch import failed: %s", msg)
        return None
    log.info("Monthly batch import from %s: %s batches (%s new, %s updated, %s assigned)", summary["path"], summary["batches"], summary["created"], summary["updated"], summary["assigned"])
    return summary


def start_scheduler() -> threading.Event:
    """Background thread that checks every 30 minutes whether this month's import is due."""
    stop = threading.Event()

    def loop():
        while not stop.is_set():
            try:
                run_auto_import()
            except Exception:  # never let the thread die
                log.exception("Monthly batch import check failed")
            stop.wait(CHECK_EVERY_SECONDS)

    if settings.batch_import_day:
        threading.Thread(target=loop, name="batch-import", daemon=True).start()
    return stop
