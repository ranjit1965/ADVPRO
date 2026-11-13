r"""Master › Batch Import and Admin › Data Upload (Batch Master).

Admin / Manager upload the BatchMaster Excel file (.xlsx, .xls or .csv, any column order).
"Save" reads it and stores every batch with its allotted faculty
short name, matched to an employee code, in Master › Batch (master_batches). The Class tab then
offers each faculty the batches assigned to them. There is no folder path or automatic import.
"""
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from pymongo import InsertOne, UpdateOne

from .. import db
from ..batch_files import BatchRow, read_rows
from ..biometric_files import rows_from_upload
from ..config import settings
from ..security import require_roles

router = APIRouter(prefix="/batch-import", tags=["batch-import"])
master_roles = require_roles("MANAGER", "ADMIN")
SETTINGS_ID = "batchImport"
CLOSE_AFTER_DAYS = 60  # a batch whose end date is older than this is counted as Completed
CLASS_TYPES = {"weekdays": "WeekDays", "weekday": "WeekDays", "weekend": "WeekEnd", "weekends": "WeekEnd"}


class MapIn(BaseModel):
    shortName: str = Field(min_length=1, max_length=50)
    code: str | None = None  # employee code; empty removes the link


def _settings() -> dict:
    return db.db.settings.find_one({"_id": SETTINGS_ID}) or {"_id": SETTINGS_ID, "facultyMap": {}}


def _public(s: dict) -> dict:
    return {"lastImport": s.get("lastImport"), "facultyMap": s.get("facultyMap") or {}}


def _map_key(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().upper().replace(".", "_").replace("$", "_")


def _today() -> date:
    return (datetime.now(timezone.utc) + timedelta(minutes=settings.utc_offset_minutes)).date()


def batch_status(r: BatchRow, today: date) -> str:
    """Planned / Running / Break / Completed from the Status column (C = closed, B = break) and the dates."""
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


@router.post("/upload")
async def upload(request: Request, name: str = Query(..., min_length=1, max_length=200), me: dict = Depends(master_roles)):
    """Admin / Manager upload the file (raw body, .xlsx / .xls / .csv); it is read and saved to the database."""
    data = await request.body()
    try:
        rows = await run_in_threadpool(rows_from_upload, name, data)
    except Exception as exc:  # wrong type, empty, unreadable
        raise HTTPException(400, f"Could not read the file: {exc}") from exc
    if not rows:
        raise HTTPException(400, "The file has no rows")
    return await run_in_threadpool(run_import, rows, name, me)


@router.put("/map")
def save_map(body: MapIn, me: dict = Depends(master_roles)):
    """Links a faculty short name from the file to an employee and assigns that short name's batches."""
    key = _map_key(body.shortName)
    s = _settings()
    old_code = (s.get("facultyMap") or {}).get(key)
    if body.code:
        if not db.users.find_one({"code": body.code}):
            raise HTTPException(400, "Unknown employee")
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"facultyMap.{key}": body.code}}, upsert=True)
    else:
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$unset": {f"facultyMap.{key}": ""}})

    col = db.db.master_batches
    now = datetime.now(timezone.utc).isoformat()
    ops = []
    for b in col.find({"facultyShort": {"$regex": rf"(^|, ){re.escape(body.shortName.strip().upper())}(,|$)"}}, {"_id": 0, "id": 1, "facultyCode": 1, "otherFaculty": 1}):
        codes = [c for c in [b.get("facultyCode") or "", *(b.get("otherFaculty") or "").split(", ")] if c]
        if old_code in codes:
            codes.remove(old_code)
        if body.code and body.code not in codes:
            codes.append(body.code)
        ops.append(UpdateOne({"id": b["id"]}, {"$set": {"facultyCode": codes[0] if codes else "", "otherFaculty": ", ".join(codes[1:]), "updatedBy": me["name"], "updatedAt": now}}))
    if ops:
        col.bulk_write(ops, ordered=False)

    last = s.get("lastImport") or {}
    if last and body.code:
        last["unmatched"] = [u for u in last.get("unmatched") or [] if _map_key(u["shortName"]) != key]
        last["assigned"] = col.count_documents({"importedAt": last.get("at"), "facultyCode": {"$ne": ""}})
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastImport": last}})
    return {**last, "linked": len(ops)}


def run_import(rows: list[list], file_name: str, me: dict) -> dict:
    try:
        result = read_rows(rows)
    except Exception as exc:  # no header row, wrong file
        raise HTTPException(400, f"Could not read the batch file: {exc}") from exc
    s = _settings()

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
    ops: list = []
    new_recs: list[dict] = []
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
            "source": "Upload",
            "importedAt": now,
        }
        old = existing.get(no.upper())
        if old:
            ops.append(UpdateOne({"id": old["id"]}, {"$set": {**rec, "batchNo": old["batchNo"] if old["batchNo"].upper() == no.upper() else no, "updatedBy": me["name"], "updatedAt": now}}))
            updated += 1
        else:
            rec.update(mode="Center", classMode="Offline", createdBy=me["name"], createdAt=now)
            new_recs.append(rec)
            existing[no.upper()] = rec
            created += 1

    # One round trip for all the new ids and one bulk write: fast even with thousands of batches.
    if new_recs:
        last_seq = db.counters.find_one_and_update({"_id": "master_batches"}, {"$inc": {"seq": len(new_recs)}}, upsert=True, return_document=True)["seq"]
        for i, rec in enumerate(new_recs):
            rec["id"] = f"BAT-{last_seq - len(new_recs) + i + 1:04d}"
            ops.append(InsertOne(rec))
    if ops:
        col.bulk_write(ops, ordered=False)

    summary = {
        "at": now,
        "file": file_name,
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
