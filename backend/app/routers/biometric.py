"""Biometric time in / time out (Master › Biometric and Admin › Data Upload).

Admin / Super Admin upload the device export (.xlsx, .xls or .csv; .txt / .tsv / .dat logs too).
v52: the file has "Employee Name" and the days 1 to 31 (no month), so after choosing the file the Admin picks
the month and year; the last rows "No.of Records 20" / "No of Holidays : 6" are saved for that month in
`biometric_months`. "Save" keeps the first and last punch of each person per day in
`biometric_days`; uploading a day again replaces it. People the system cannot match are kept in
`biometric_unmatched` until they are linked to an employee. The monthly report compares those
times with the person's daily entries. There is no folder path.
"""
import calendar
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from pymongo import UpdateOne

from .. import db, holidays
from ..biometric_files import ReadResult, read_rows, rows_from_upload
from ..security import manage_access, super_admin_only, is_super_admin, require_section, current_user, require_roles

router = APIRouter(prefix="/biometric", tags=["biometric"])
master_roles = manage_access  # Master or Admin menu, or HR menu for HR / Admin; Super Admin always
view_roles = require_section("master", "admin", "hr", roles=("ADMIN", "HR"))
SETTINGS_ID = "biometric"
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"


class MapIn(BaseModel):
    deviceKey: str = Field(min_length=1, max_length=200)  # device user id, or the name when the file has no id
    code: str | None = None  # employee code; empty removes the link


def _settings() -> dict:
    return db.db.settings.find_one({"_id": SETTINGS_ID}) or {"_id": SETTINGS_ID, "idMap": {}}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _map_key(text: str) -> str:
    """idMap key: normalised, without the characters MongoDB does not allow in field names."""
    return _norm(text).replace(".", "_").replace("$", "_")


def _minutes(hhmm: str | None) -> int | None:
    if not hhmm:
        return None
    h, m = map(int, hhmm.split(":")[:2])
    return h * 60 + m


def _unmatched() -> list[dict]:
    """People in uploaded files not linked to an employee yet, with how many days they have."""
    out: dict[str, dict] = {}
    for u in db.db.biometric_unmatched.find({}, {"_id": 0, "key": 1, "deviceKey": 1, "deviceId": 1, "name": 1}):
        item = out.setdefault(u["key"], {"deviceKey": u["deviceKey"], "deviceId": u.get("deviceId", ""), "name": u.get("name", ""), "days": 0})
        item["days"] += 1
    return sorted(out.values(), key=lambda v: _norm(v["name"] or v["deviceKey"]))


def _public(s: dict) -> dict:
    out = {k: s.get(k) for k in ("lastImport", "updatedBy", "updatedAt")}
    out["idMap"] = s.get("idMap") or {}
    if out["lastImport"]:
        out["lastImport"] = {**out["lastImport"], "unmatched": _unmatched()}
    return out


def _store_day(code: str, name: str, day: str, times: list[str], files: list[str], now, mark: str = "") -> UpdateOne:
    """mark: "H" or "C" from the day cell of the file (v54); kept with the day and shown in attendance."""
    times = sorted(set(times))
    return UpdateOne(
        {"_id": f"{code}|{day}"},
        {"$set": {"code": code, "name": name, "date": day, "timeIn": times[0] if times else None, "timeOut": times[-1] if len(times) > 1 else None,
                  "punches": len(times), "mark": mark or None, "files": sorted(set(files)), "importedAt": now}},
        upsert=True,
    )


@router.get("/settings")
def get_settings(_: dict = Depends(view_roles)):
    return _public(_settings())


def month_info(month: str) -> dict | None:
    """No of records and no of holidays saved for the month (from the last rows of the biometric file)."""
    return db.db.biometric_months.find_one({"_id": month}, {"_id": 0})


@router.get("/months")
def months(_: dict = Depends(view_roles)):
    """The months uploaded, newest first, with the no of records and no of holidays of each."""
    return list(db.db.biometric_months.find({}, {"_id": 0}).sort("month", -1))


@router.post("/upload")
async def upload(
    request: Request,
    name: str = Query(..., min_length=1, max_length=200),
    month: str | None = Query(None, pattern=MONTH_RE),
    me: dict = Depends(master_roles),
):
    """Admin / Super Admin upload the file (raw body, .xlsx / .xls / .csv) for the month and year they chose;
    it is read and saved to the database."""
    if not month:
        raise HTTPException(422, "Choose the month and year of the biometric file")
    data = await request.body()
    try:
        rows = await run_in_threadpool(rows_from_upload, name, data)
    except Exception as exc:  # wrong type, empty, unreadable
        raise HTTPException(400, f"Could not read the file: {exc}") from exc
    if not rows:
        raise HTTPException(400, "The file has no rows")
    return await run_in_threadpool(run_import, rows, name, month, me["name"])


class DismissIn(BaseModel):
    deviceKey: str = Field(min_length=1, max_length=200)


@router.post("/dismiss")
def dismiss(body: DismissIn, _: dict = Depends(master_roles)):
    """Removes a device user from "not matched" (not an employee): their unmatched days are deleted and they are
    not listed again on later uploads."""
    key = _map_key(body.deviceKey)
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$addToSet": {"ignored": key}}, upsert=True)
    db.db.biometric_unmatched.delete_many({"key": key})
    return _public(_settings())["lastImport"] or {"unmatched": _unmatched()}


@router.put("/map")
def save_map(body: MapIn, _: dict = Depends(master_roles)):
    """Links a device user (id or name the system could not match) to an employee and moves
    that person's saved days to the employee."""
    key = _map_key(body.deviceKey)
    if body.code:
        u = db.users.find_one({"code": body.code}, {"_id": 0, "code": 1, "name": 1})
        if not u:
            raise HTTPException(400, "Unknown employee")
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"idMap.{key}": body.code}}, upsert=True)
        now = datetime.now(timezone.utc)
        ops = []
        for d in db.db.biometric_unmatched.find({"key": key}):
            have = db.db.biometric_days.find_one({"_id": f"{u['code']}|{d['date']}"}) or {}
            times = list(d.get("times") or []) + [t for t in (have.get("timeIn"), have.get("timeOut")) if t]
            ops.append(_store_day(u["code"], u["name"], d["date"], times, list(d.get("files") or []) + list(have.get("files") or []), now, d.get("mark") or have.get("mark") or ""))
        if ops:
            db.db.biometric_days.bulk_write(ops, ordered=False)
        db.db.biometric_unmatched.delete_many({"key": key})
    else:
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$unset": {f"idMap.{key}": ""}})
    return _public(_settings())["lastImport"] or {"unmatched": _unmatched()}


def run_import(rows: list[list], file_name: str, month: str | None = None, by: str = "") -> dict:
    result = ReadResult()
    ym = tuple(int(x) for x in month.split("-")) if month else None
    try:
        read_rows(rows, file_name, result, ym)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the file: {exc}") from exc
    if not result.punches:
        raise HTTPException(400, "No punches found. The file needs an employee code or name column and a date with time, or In / Out time columns.")
    result.files.append(file_name)
    s = _settings()

    users = list(db.users.find({}, {"_id": 0, "code": 1, "userId": 1, "name": 1}))
    by_code = {_norm(u["code"]): u for u in users}
    by_user_id = {_norm(u["userId"]): u for u in users if u.get("userId")}
    by_name = {_norm(u["name"]): u for u in users}
    id_map = s.get("idMap") or {}
    ignored = set(s.get("ignored") or [])  # device users dismissed from "not matched"

    def match(pid: str, name: str):
        for key in (pid, name):
            k = _map_key(key)
            if k and k in id_map:
                return next((u for u in users if u["code"] == id_map[k]), None)
        return by_code.get(_norm(pid)) or by_user_id.get(_norm(pid)) or by_name.get(_norm(name))

    days: dict[tuple[str, str], dict] = {}
    unmatched: dict[tuple[str, str], dict] = {}
    for p in result.punches:
        u = match(p.person_id, p.name)
        hhmm = [t.strftime("%H:%M") for t in p.times]
        if not u:
            dk = p.person_id or p.name
            if _map_key(dk) in ignored:
                continue
            item = unmatched.setdefault((_map_key(dk), p.day.isoformat()), {"key": _map_key(dk), "deviceKey": dk, "deviceId": p.person_id, "name": p.name, "date": p.day.isoformat(), "times": [], "files": set(), "mark": ""})
            item["times"] += hhmm
            item["mark"] = p.mark or item["mark"]
            item["files"].add(p.file)
            continue
        d = days.setdefault((u["code"], p.day.isoformat()), {"code": u["code"], "name": u["name"], "date": p.day.isoformat(), "times": [], "files": set(), "mark": ""})
        d["times"] += hhmm
        d["mark"] = p.mark or d["mark"]
        d["files"].add(p.file)

    now = datetime.now(timezone.utc)
    # One bulk write per collection: fast even for a month of punches for everyone.
    if days:
        db.db.biometric_days.bulk_write([_store_day(code, d["name"], day, d["times"], list(d["files"]), now, d["mark"]) for (code, day), d in days.items()], ordered=False)
    if unmatched:
        db.db.biometric_unmatched.bulk_write([
            UpdateOne({"_id": f"{k}|{day}"}, {"$set": {**{x: v for x, v in u.items() if x != "files"}, "times": sorted(set(u["times"])), "files": sorted(u["files"])}}, upsert=True)
            for (k, day), u in unmatched.items()
        ], ordered=False)

    summary = {
        "at": now.isoformat(),
        "month": month,
        "records": result.records,
        "holidays": result.holidays,
        "files": result.files,
        "punchRows": len(result.punches),
        "skippedRows": result.skipped_rows,
        "daysStored": len(days),
        "people": len({c for c, _ in days}),
        "errors": result.errors,
    }
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastImport": summary}}, upsert=True)
    if month:
        db.db.biometric_months.update_one({"_id": month}, {"$set": {
            "month": month, "records": result.records, "holidays": result.holidays, "file": file_name,
            "people": summary["people"], "daysStored": summary["daysStored"], "uploadedBy": by, "uploadedAt": summary["at"],
        }}, upsert=True)
    return {**summary, "unmatched": _unmatched()}


@router.get("/records")
def records(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), code: str | None = None, _: dict = Depends(view_roles)):
    y, m = map(int, month.split("-"))
    q: dict = {"date": {"$gte": f"{month}-01", "$lte": f"{month}-{calendar.monthrange(y, m)[1]:02d}"}}
    if code:
        q["code"] = code
    return list(db.db.biometric_days.find(q, {"_id": 0}).sort([("date", 1), ("name", 1)]))


def compare_month(code: str, month: str, entries: list[dict]) -> dict:
    """Day-by-day biometric Time In / Out next to the first start and last finish of the entries (no tolerance:
    the differences are shown as they are), with the no of records / holidays of the month."""
    y, m = map(int, month.split("-"))
    last = f"{month}-{calendar.monthrange(y, m)[1]:02d}"
    bio = {b["date"]: b for b in db.db.biometric_days.find({"code": code, "date": {"$gte": f"{month}-01", "$lte": last}}, {"_id": 0})}
    by_day: dict[str, list[dict]] = {}
    for e in entries:
        by_day.setdefault(e["activityDate"], []).append(e)
    hols = holidays.in_month(month)  # dates marked H for everyone (Attendance › Add H)

    rows = []
    for day in sorted(set(bio) | set(by_day) | set(hols)):
        b, es = bio.get(day), by_day.get(day, [])
        start = min((e["timeFrom"] for e in es), default=None)
        end = max((e["timeTo"] for e in es), default=None)
        entered = sum(e["minutes"] for e in es)
        t_in, t_out = (b or {}).get("timeIn"), (b or {}).get("timeOut")
        bio_minutes = _minutes(t_out) - _minutes(t_in) if t_in and t_out else None
        in_diff = _minutes(start) - _minutes(t_in) if start and t_in else None  # + : entries start after punch-in
        out_diff = _minutes(t_out) - _minutes(end) if end and t_out else None  # + : punch-out after entries end
        mark = "H" if day in hols else (b or {}).get("mark") or None  # H / C from the biometric file
        if mark == "H":
            status = "Holiday (H)"
        elif mark in ("C", "E", "A"):  # v59: E and A too (shown as X in Daily Entry Submission)
            status = mark
        elif mark == "W":
            status = "Week off (W)"
        elif not b:
            status = "No biometric"
        elif not es:
            status = "No entries"
        elif not t_out:
            status = "Missing out punch"
        else:
            status = "Present"
        rows.append({
            "date": day, "timeIn": t_in, "timeOut": t_out, "entryStart": start, "entryEnd": end,
            "inDiff": in_diff, "outDiff": out_diff, "bioMinutes": bio_minutes, "enteredMinutes": entered,
            "hoursDiff": (bio_minutes - entered) if bio_minutes is not None and es else None, "status": status, "mark": mark,
            "holiday": (hols.get(day) or {}).get("name"),
        })

    count = lambda s: sum(r["status"] == s for r in rows)  # noqa: E731
    return {
        "rows": rows,
        "month": month_info(month),
        "summary": {
            "days": len(rows), "present": count("Present"), "holidays": count("Holiday (H)"), "c": count("C"),
            "noBiometric": count("No biometric"), "noEntries": count("No entries"), "missingOut": count("Missing out punch"),
            "bioMinutes": sum(r["bioMinutes"] or 0 for r in rows), "enteredMinutes": sum(r["enteredMinutes"] for r in rows if r["timeIn"]),
        },
        "hasData": bool(bio) or bool(hols),
    }


@router.get("/compare")
def compare(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), facultyCode: str = Query(...), me: dict = Depends(current_user)):
    from .reports import fetch, month_range, scoped_code  # noqa: PLC0415
    from .entries import build_query  # noqa: PLC0415

    code = scoped_code(me, facultyCode)
    frm, to = month_range(month)
    return compare_month(code, month, fetch(build_query(facultyCode=code, dateFrom=frm, dateTo=to)))
