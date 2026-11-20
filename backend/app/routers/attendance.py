"""Attendance › Staff (v53): Daily Entry Submission (was Attendance Entry), Print and Time Sheet.

v54: the sheet fills itself ("auto" marks), a manual mark saved by HR / Admin always wins:
  1. H on a date added with "Add H" (holidays for everyone, `holidays`),
  2. H or C written in the day cell of the biometric time in / time out file (`biometric_days.mark`),
  3. S when the employee has daily entries that day (S(L) when the biometric Time In is after the first
     entry's start time),
  4. # when the biometric file has a Time In that day but there is no daily entry.

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

from .. import db, holidays
from ..security import require_roles, super_admin_only

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
    {"code": "C", "label": "C (from the biometric file)", "key": "C"},
]
VALID = {c["code"] for c in CODES}


class Mark(BaseModel):
    code: str = Field(min_length=1, max_length=40)  # employee code
    day: int = Field(ge=1, le=31)
    mark: str = Field(default="", max_length=8)  # empty clears the day


class MarksIn(BaseModel):
    marks: list[Mark] = Field(max_length=5000)


class HolidayIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    name: str = Field(default="", max_length=100)


def auto_marks(month: str) -> dict[str, dict[str, str]]:
    """{code: {day: mark}} worked out from the holidays, the biometric file and the daily entries."""
    last = _days(month)
    rng = {"$gte": f"{month}-01", "$lte": f"{month}-{last:02d}"}
    out: dict[str, dict[str, str]] = {}
    first_start: dict[tuple[str, str], str] = {}
    for e in db.entries.find({"activityDate": rng}, {"_id": 0, "facultyCode": 1, "activityDate": 1, "timeFrom": 1}):
        k = (e["facultyCode"], e["activityDate"])
        first_start[k] = min(first_start.get(k, e.get("timeFrom") or "99:99"), e.get("timeFrom") or "99:99")
    bio = {(b["code"], b["date"]): b for b in db.db.biometric_days.find({"date": rng}, {"_id": 0, "code": 1, "date": 1, "timeIn": 1, "mark": 1})}
    for (code, date), start in first_start.items():
        t_in = (bio.get((code, date)) or {}).get("timeIn")
        out.setdefault(code, {})[str(int(date[8:]))] = "S(L)" if t_in and start != "99:99" and t_in > start else "S"
    for (code, date), b in bio.items():
        day = str(int(date[8:]))
        if b.get("mark") in ("H", "C"):
            out.setdefault(code, {})[day] = b["mark"]
        elif b.get("timeIn") and (code, date) not in first_start:
            out.setdefault(code, {})[day] = "#"
    hols = holidays.in_month(month)
    if hols:
        for p in _staff():
            for date in hols:
                out.setdefault(p["code"], {})[str(int(date[8:]))] = "H"
    return out


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
        "marks": {c: d.get("days", {}) for c, d in saved.items()},  # saved by hand: always win
        "auto": auto_marks(month),  # filled from holidays, the biometric file and the daily entries
        "holidays": list(holidays.in_month(month).values()),
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
    """First start and last end of the daily entries of each day, per employee, with the biometric punch in / out."""
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
    # v54: the biometric punch (Time In / Time Out from the uploaded file) next to the entry times of each day
    for b in db.db.biometric_days.find({"date": q["activityDate"]}, {"_id": 0, "code": 1, "name": 1, "date": 1, "timeIn": 1, "timeOut": 1, "mark": 1}):
        r = rows.setdefault(b["code"], {"code": b["code"], "name": b.get("name") or b["code"], "days": {}})
        cur = r["days"].setdefault(str(int(b["date"][8:10])), {"start": None, "end": None, "entries": 0})
        cur.update(punchIn=b.get("timeIn"), punchOut=b.get("timeOut"), mark=b.get("mark"))
    names = {u["code"]: u["name"] for u in db.users.find({"code": {"$in": list(rows)}}, {"_id": 0, "code": 1, "name": 1})}
    for c, r in rows.items():
        r["name"] = names.get(c, r["name"])
    return {"month": month, "days": last, "employees": sorted(rows.values(), key=lambda r: r["name"].lower())}


# ------------------------------------------------------------------ holidays for everyone ("Add H")

@router.get("/holidays")
def list_holidays(month: str = Query(..., pattern=MONTH_RE), _: dict = Depends(staff_roles)):
    return list(holidays.in_month(month).values())


@router.post("/holidays", status_code=201)
def add_holiday(body: HolidayIn, me: dict = Depends(staff_roles)):
    """The date becomes H (Official Holiday) for every employee in Daily Entry Submission and the monthly report."""
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(422, "Not a valid date") from exc
    doc = {"date": body.date, "name": body.name.strip() or "Official Holiday", "by": me["name"], "at": datetime.now(timezone.utc).isoformat()}
    holidays.col.update_one({"_id": body.date}, {"$set": doc}, upsert=True)
    return doc


@router.delete("/holidays/{date}")
def remove_holiday(date: str, _: dict = Depends(super_admin_only)):
    if not holidays.col.delete_one({"_id": date}).deleted_count:
        raise HTTPException(404, "Holiday not found")
    return True
