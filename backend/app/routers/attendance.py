"""Attendance › Staff (v53): Attendance Entry, Print and Time Sheet.

* Attendance Entry: HR, Admin and the Super Admin mark each employee for each day of a month with one code
  (S, S(L), #, P, X, W, H), typed with one key or picked from a dropdown, like the old software's sheet.
  Stored in `staff_attendance`, one document per employee per month: {code, name, month, days: {"1": "S"}}.
* Print: the same sheet, read-only, for printing.
* Time Sheet: for each employee and day, the start time of the first daily entry and the end time of the last
  daily entry of that day (from the Faculty daily entries), for viewing and printing.
"""
import calendar
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo import UpdateOne

from .. import db
from ..security import require_roles

router = APIRouter(prefix="/attendance", tags=["attendance"])
staff_roles = require_roles("HR", "ADMIN", "MANAGER")
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"
col = db.db.staff_attendance

# code, meaning, key typed in the sheet
CODES = [
    {"code": "S", "label": "Report Submitted", "key": "S"},
    {"code": "S(L)", "label": "Report Submitted, Late to office", "key": "L"},
    {"code": "#", "label": "Report Not Submitted", "key": "N"},
    {"code": "P", "label": "Permission Taken", "key": "P"},
    {"code": "X", "label": "Leave", "key": "X"},
    {"code": "W", "label": "Week off", "key": "W"},
    {"code": "H", "label": "Official Holiday", "key": "H"},
]
VALID = {c["code"] for c in CODES}


class Mark(BaseModel):
    code: str = Field(min_length=1, max_length=40)  # employee code
    day: int = Field(ge=1, le=31)
    mark: str = Field(default="", max_length=8)  # empty clears the day


class MarksIn(BaseModel):
    marks: list[Mark] = Field(max_length=5000)


def _days(month: str) -> int:
    y, m = map(int, month.split("-"))
    return calendar.monthrange(y, m)[1]


def _staff() -> list[dict]:
    """Every active employee except the Super Admin, by name."""
    return list(db.users.find({"active": {"$ne": False}, "role": {"$ne": "MANAGER"}}, {"_id": 0, "code": 1, "name": 1, "role": 1}).sort("name", 1))


@router.get("/staff")
def get_sheet(month: str = Query(..., pattern=MONTH_RE), _: dict = Depends(staff_roles)):
    saved = {d["code"]: d for d in col.find({"month": month}, {"_id": 0})}
    people = _staff()
    known = {p["code"] for p in people}
    # someone marked earlier but inactive now still shows for that month
    people += [{"code": c, "name": d.get("name", c), "role": ""} for c, d in saved.items() if c not in known]
    return {
        "month": month,
        "days": _days(month),
        "codes": CODES,
        "employees": people,
        "marks": {c: d.get("days", {}) for c, d in saved.items()},
        "updatedAt": max((d.get("updatedAt") or "" for d in saved.values()), default=None),
    }


@router.put("/staff/{month}")
def save_sheet(month: str, body: MarksIn, me: dict = Depends(staff_roles)):
    import re  # noqa: PLC0415

    if not re.match(MONTH_RE, month):
        raise HTTPException(422, "Month must be YYYY-MM")
    last = _days(month)
    names = {u["code"]: u["name"] for u in db.users.find({}, {"_id": 0, "code": 1, "name": 1})}
    now = datetime.now(timezone.utc).isoformat()
    ops = []
    for m in body.marks:
        mark = m.mark.strip().upper()
        if mark and mark not in VALID:
            raise HTTPException(422, f"Unknown code {m.mark}. Use {', '.join(sorted(VALID))}")
        if m.day > last:
            raise HTTPException(422, f"{month} has {last} days")
        if m.code not in names:
            raise HTTPException(422, f"Unknown employee {m.code}")
        field = f"days.{m.day}"
        upd = {"$set": {"code": m.code, "name": names[m.code], "month": month, "updatedBy": me["name"], "updatedAt": now}}
        if mark:
            upd["$set"][field] = mark
        else:
            upd["$unset"] = {field: ""}
        ops.append(UpdateOne({"_id": f"{m.code}|{month}"}, upd, upsert=True))
    if ops:
        col.bulk_write(ops, ordered=True)
    return get_sheet(month, me)


@router.get("/timesheet")
def timesheet(month: str = Query(..., pattern=MONTH_RE), _: dict = Depends(staff_roles)):
    """First start and last end of the daily entries of each day, per employee."""
    last = _days(month)
    rows: dict[str, dict] = {}
    q = {"activityDate": {"$gte": f"{month}-01", "$lte": f"{month}-{last:02d}"}}
    for e in db.entries.find(q, {"_id": 0, "facultyCode": 1, "facultyName": 1, "activityDate": 1, "timeFrom": 1, "timeTo": 1}):
        if not (e.get("timeFrom") and e.get("timeTo")):
            continue
        r = rows.setdefault(e["facultyCode"], {"code": e["facultyCode"], "name": e.get("facultyName") or e["facultyCode"], "days": {}})
        day = str(int(e["activityDate"][8:10]))
        cur = r["days"].get(day)
        if cur:
            cur["start"] = min(cur["start"], e["timeFrom"])
            cur["end"] = max(cur["end"], e["timeTo"])
            cur["entries"] += 1
        else:
            r["days"][day] = {"start": e["timeFrom"], "end": e["timeTo"], "entries": 1}
    names = {u["code"]: u["name"] for u in db.users.find({"code": {"$in": list(rows)}}, {"_id": 0, "code": 1, "name": 1})}
    for c, r in rows.items():
        r["name"] = names.get(c, r["name"])
    return {"month": month, "days": last, "employees": sorted(rows.values(), key=lambda r: r["name"].lower())}
