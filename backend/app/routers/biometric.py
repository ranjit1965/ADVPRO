"""Biometric time in / time out.

Master (Manager / Admin) sets the folder where the device exports its files. "Import now" reads
every file there, keeps the first and last punch of each person per day in `biometric_days`,
and the monthly report compares those times with the person's daily entries.
"""
import calendar
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .. import db
from ..biometric_files import EXTENSIONS, read_folder
from ..security import current_user, require_roles

router = APIRouter(prefix="/biometric", tags=["biometric"])
master_roles = require_roles("MANAGER", "ADMIN")
view_roles = require_roles("MANAGER", "ADMIN", "HR")
SETTINGS_ID = "biometric"
DEFAULT_TOLERANCE = 15  # minutes of difference still counted as matching


class SettingsIn(BaseModel):
    folderPath: str = Field(default="", max_length=500)  # empty when files are uploaded instead
    toleranceMinutes: int = Field(default=DEFAULT_TOLERANCE, ge=0, le=240)


class MapIn(BaseModel):
    deviceKey: str = Field(min_length=1, max_length=200)  # device user id, or the name when the file has no id
    code: str | None = None  # employee code; empty removes the link


def _settings() -> dict:
    return db.db.settings.find_one({"_id": SETTINGS_ID}) or {"_id": SETTINGS_ID, "folderPath": "", "toleranceMinutes": DEFAULT_TOLERANCE, "idMap": {}}


def _public(s: dict) -> dict:
    out = {k: s.get(k) for k in ("folderPath", "toleranceMinutes", "lastImport", "updatedBy", "updatedAt")}
    out["idMap"] = s.get("idMap") or {}
    return out


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


@router.get("/settings")
def get_settings(_: dict = Depends(view_roles)):
    return _public(_settings())


@router.put("/settings")
def save_settings(body: SettingsIn, me: dict = Depends(master_roles)):
    folder = body.folderPath.strip()
    if folder and not Path(folder).is_dir():
        raise HTTPException(400, f"Folder not found on the server: {folder}")
    db.db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$set": {"folderPath": folder, "toleranceMinutes": body.toleranceMinutes, "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return _public(_settings())


@router.put("/map")
def save_map(body: MapIn, _: dict = Depends(master_roles)):
    """Links a device user (id or name the system could not match) to an employee, then re-imports."""
    key = _map_key(body.deviceKey)
    if body.code:
        if not db.users.find_one({"code": body.code}):
            raise HTTPException(400, "Unknown employee")
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {f"idMap.{key}": body.code}}, upsert=True)
    else:
        db.db.settings.update_one({"_id": SETTINGS_ID}, {"$unset": {f"idMap.{key}": ""}})
    return run_import(_settings())


@router.post("/import")
def import_now(_: dict = Depends(master_roles)):
    return run_import(_settings())


@router.post("/upload")
async def upload_and_import(request: Request, name: str = Query(..., min_length=1, max_length=200), _: dict = Depends(master_roles)):
    """Imports one device export file sent from the browser (raw file body), for a backend that
    cannot reach the folder, such as on Vercel."""
    if Path(name).suffix.lower() not in EXTENSIONS:
        raise HTTPException(400, "Upload a .xlsx, .xls, .csv, .txt, .tsv or .dat export from the biometric device")
    data = await request.body()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "The file is larger than 20 MB")
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / Path(name).name).write_bytes(data)
        return await run_in_threadpool(run_import, _settings(), tmp)


def run_import(s: dict, folder: str | None = None) -> dict:
    uploaded = folder is not None
    folder = folder or s.get("folderPath")
    if not folder:
        raise HTTPException(400, "Set the biometric folder path first, or upload the export file")
    if not Path(folder).is_dir():
        raise HTTPException(400, f"Folder not found on the server: {folder}. If the backend runs on Vercel, use Upload file instead.")
    result = read_folder(folder)
    if uploaded and result.errors and not result.files:
        raise HTTPException(400, "Could not read the file: " + "; ".join(result.errors))

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
    unmatched: dict[str, dict] = {}
    for p in result.punches:
        u = match(p.person_id, p.name)
        if not u:
            key = p.person_id or p.name
            item = unmatched.setdefault(_norm(key), {"deviceKey": key, "deviceId": p.person_id, "name": p.name, "days": set()})
            item["days"].add(p.day.isoformat())
            continue
        d = days.setdefault((u["code"], p.day.isoformat()), {"code": u["code"], "name": u["name"], "date": p.day.isoformat(), "times": [], "files": set()})
        d["times"] += p.times
        d["files"].add(p.file)

    now = datetime.now(timezone.utc)
    for (code, day), d in days.items():
        times = sorted(set(d["times"]))
        t_in, t_out = times[0].strftime("%H:%M"), (times[-1].strftime("%H:%M") if len(times) > 1 else None)
        db.db.biometric_days.update_one(
            {"_id": f"{code}|{day}"},
            {"$set": {"code": code, "name": d["name"], "date": day, "timeIn": t_in, "timeOut": t_out, "punches": len(times), "files": sorted(d["files"]), "importedAt": now}},
            upsert=True,
        )

    summary = {
        "at": now.isoformat(),
        "files": result.files,
        "punchRows": len(result.punches),
        "skippedRows": result.skipped_rows,
        "daysStored": len(days),
        "people": len({c for c, _ in days}),
        "unmatched": sorted(({**v, "days": len(v["days"])} for v in unmatched.values()), key=lambda v: _norm(v["name"] or v["deviceKey"])),
        "errors": result.errors,
    }
    db.db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"lastImport": summary}}, upsert=True)
    return summary


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
