"""Biometric time in / time out (Master › Biometric and Admin › Data Upload).

Admin / Manager upload the device export (.xlsx, .xls or .csv; .txt / .tsv / .dat logs too).
"Save" keeps the first and last punch of each person per day in
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

from .. import db
from ..biometric_files import ReadResult, read_rows, rows_from_upload
from ..security import current_user, require_roles

router = APIRouter(prefix="/biometric", tags=["biometric"])
master_roles = require_roles("MANAGER", "ADMIN")
view_roles = require_roles("MANAGER", "ADMIN", "HR")
SETTINGS_ID = "biometric"
DEFAULT_TOLERANCE = 15  # minutes of difference still counted as matching


class SettingsIn(BaseModel):
    toleranceMinutes: int = Field(default=DEFAULT_TOLERANCE, ge=0, le=240)


class MapIn(BaseModel):
    deviceKey: str = Field(min_length=1, max_length=200)  # device user id, or the name when the file has no id
    code: str | None = None  # employee code; empty removes the link


def _settings() -> dict:
    return db.db.settings.find_one({"_id": SETTINGS_ID}) or {"_id": SETTINGS_ID, "toleranceMinutes": DEFAULT_TOLERANCE, "idMap": {}}


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
    out = {k: s.get(k) for k in ("toleranceMinutes", "lastImport", "updatedBy", "updatedAt")}
    out["toleranceMinutes"] = out["toleranceMinutes"] if out["toleranceMinutes"] is not None else DEFAULT_TOLERANCE
    out["idMap"] = s.get("idMap") or {}
    if out["lastImport"]:
        out["lastImport"] = {**out["lastImport"], "unmatched": _unmatched()}
    return out


def _store_day(code: str, name: str, day: str, times: list[str], files: list[str], now) -> UpdateOne:
    times = sorted(set(times))
    return UpdateOne(
        {"_id": f"{code}|{day}"},
        {"$set": {"code": code, "name": name, "date": day, "timeIn": times[0], "timeOut": times[-1] if len(times) > 1 else None,
                  "punches": len(times), "files": sorted(set(files)), "importedAt": now}},
        upsert=True,
    )


@router.get("/settings")
def get_settings(_: dict = Depends(view_roles)):
    return _public(_settings())


@router.put("/settings")
def save_settings(body: SettingsIn, me: dict = Depends(master_roles)):
    db.db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$set": {"toleranceMinutes": body.toleranceMinutes, "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
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
    return await run_in_threadpool(run_import, rows, name)


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
            ops.append(_store_day(u["code"], u["name"], d["date"], times, list(d.get("files") or []) + list(have.get("files") or []), now))
        if ops:
            db.db.biometric_days.bulk_write(ops, ordered=False)
        db.db.biometric_unmatched.delete_many({"key": key})
    else:
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$unset": {f"idMap.{key}": ""}})
    return _public(_settings())["lastImport"] or {"unmatched": _unmatched()}


def run_import(rows: list[list], file_name: str) -> dict:
    result = ReadResult()
    try:
        read_rows(rows, file_name, result)
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
            item = unmatched.setdefault((_map_key(dk), p.day.isoformat()), {"key": _map_key(dk), "deviceKey": dk, "deviceId": p.person_id, "name": p.name, "date": p.day.isoformat(), "times": [], "files": set()})
            item["times"] += hhmm
            item["files"].add(p.file)
            continue
        d = days.setdefault((u["code"], p.day.isoformat()), {"code": u["code"], "name": u["name"], "date": p.day.isoformat(), "times": [], "files": set()})
        d["times"] += hhmm
        d["files"].add(p.file)

    now = datetime.now(timezone.utc)
    # One bulk write per collection: fast even for a month of punches for everyone.
    if days:
        db.db.biometric_days.bulk_write([_store_day(code, d["name"], day, d["times"], list(d["files"]), now) for (code, day), d in days.items()], ordered=False)
    if unmatched:
        db.db.biometric_unmatched.bulk_write([
            UpdateOne({"_id": f"{k}|{day}"}, {"$set": {**{x: v for x, v in u.items() if x != "files"}, "times": sorted(set(u["times"])), "files": sorted(u["files"])}}, upsert=True)
            for (k, day), u in unmatched.items()
        ], ordered=False)

    summary = {
        "at": now.isoformat(),
        "files": result.files,
        "punchRows": len(result.punches),
        "skippedRows": result.skipped_rows,
        "daysStored": len(days),
        "people": len({c for c, _ in days}),
        "errors": result.errors,
    }
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastImport": summary}}, upsert=True)
    return {**summary, "unmatched": _unmatched()}


@router.get("/records")
def records(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), code: str | None = None, _: dict = Depends(view_roles)):
    y, m = map(int, month.split("-"))
    q: dict = {"date": {"$gte": f"{month}-01", "$lte": f"{month}-{calendar.monthrange(y, m)[1]:02d}"}}
    if code:
        q["code"] = code
    return list(db.db.biometric_days.find(q, {"_id": 0}).sort([("date", 1), ("name", 1)]))


def compare_month(code: str, month: str, entries: list[dict]) -> dict:
    """Day-by-day comparison of biometric Time In / Out with the first start and last finish of the entries."""
    tol = int(_settings().get("toleranceMinutes") or DEFAULT_TOLERANCE)
    y, m = map(int, month.split("-"))
    last = f"{month}-{calendar.monthrange(y, m)[1]:02d}"
    bio = {b["date"]: b for b in db.db.biometric_days.find({"code": code, "date": {"$gte": f"{month}-01", "$lte": last}}, {"_id": 0})}
    by_day: dict[str, list[dict]] = {}
    for e in entries:
        by_day.setdefault(e["activityDate"], []).append(e)

    rows = []
    for day in sorted(set(bio) | set(by_day)):
        b, es = bio.get(day), by_day.get(day, [])
        start = min((e["timeFrom"] for e in es), default=None)
        end = max((e["timeTo"] for e in es), default=None)
        entered = sum(e["minutes"] for e in es)
        t_in, t_out = (b or {}).get("timeIn"), (b or {}).get("timeOut")
        bio_minutes = _minutes(t_out) - _minutes(t_in) if t_in and t_out else None
        in_diff = _minutes(start) - _minutes(t_in) if start and t_in else None  # + : entries start after punch-in
        out_diff = _minutes(t_out) - _minutes(end) if end and t_out else None  # + : punch-out after entries end
        if not b:
            status = "No biometric"
        elif not es:
            status = "No entries"
        elif not t_out:
            status = "Missing out punch"
        elif abs(in_diff) <= tol and abs(out_diff) <= tol:
            status = "Matched"
        else:
            status = "Difference"
        rows.append({
            "date": day, "timeIn": t_in, "timeOut": t_out, "entryStart": start, "entryEnd": end,
            "inDiff": in_diff, "outDiff": out_diff, "bioMinutes": bio_minutes, "enteredMinutes": entered,
            "hoursDiff": (bio_minutes - entered) if bio_minutes is not None and es else None, "status": status,
        })

    count = lambda s: sum(r["status"] == s for r in rows)  # noqa: E731
    return {
        "toleranceMinutes": tol,
        "rows": rows,
        "summary": {
            "days": len(rows), "matched": count("Matched"), "different": count("Difference"),
            "noBiometric": count("No biometric"), "noEntries": count("No entries"), "missingOut": count("Missing out punch"),
            "bioMinutes": sum(r["bioMinutes"] or 0 for r in rows), "enteredMinutes": sum(r["enteredMinutes"] for r in rows if r["timeIn"]),
        },
        "hasData": bool(bio),
    }


@router.get("/compare")
def compare(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), facultyCode: str = Query(...), me: dict = Depends(current_user)):
    from .reports import fetch, month_range, scoped_code  # noqa: PLC0415
    from .entries import build_query  # noqa: PLC0415

    code = scoped_code(me, facultyCode)
    frm, to = month_range(month)
    return compare_month(code, month, fetch(build_query(facultyCode=code, dateFrom=frm, dateTo=to)))
