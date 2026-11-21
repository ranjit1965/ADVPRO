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

v59:
  * the biometric letters C, E and A show as X (leave), H as H and W as W,
  * a past working day (not Sunday) with no daily entry shows # (also without a biometric Time In),
  * holidays: Excel import (Admin › Yearly Holidays), revoke by HR / Admin, a warning when someone already
    has daily entries on the date, and the Time Sheet shows them,
  * the sheet lists each employee's role, so the page can show only the chosen roles.
"""
import calendar
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from pymongo import UpdateOne

from .. import db, holidays
from ..auto_inactive import local_today
from ..biometric_files import parse_date, rows_from_upload
from ..security import BUILT_IN_LABELS, require_roles, roles_list

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
# v59: what a letter in the biometric file's day cell shows in Daily Entry Submission
BIO_MARKS = {"C": "X", "E": "X", "A": "X", "H": "H", "W": "W"}


class Mark(BaseModel):
    code: str = Field(min_length=1, max_length=40)  # employee code
    day: int = Field(ge=1, le=31)
    mark: str = Field(default="", max_length=8)  # empty clears the day


class MarksIn(BaseModel):
    marks: list[Mark] = Field(max_length=5000)


class HolidayIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    name: str = Field(default="", max_length=100)
    force: bool = False  # v59: add it even though some employees have daily entries on that date


def auto_marks(month: str, today: date | None = None) -> dict[str, dict[str, str]]:
    """{code: {day: mark}} worked out from the holidays, the biometric file and the daily entries."""
    last = _days(month)
    rng = {"$gte": f"{month}-01", "$lte": f"{month}-{last:02d}"}
    out: dict[str, dict[str, str]] = {}
    first_start: dict[tuple[str, str], str] = {}
    for e in db.entries.find({"activityDate": rng}, {"_id": 0, "facultyCode": 1, "activityDate": 1, "timeFrom": 1}):
        k = (e["facultyCode"], e["activityDate"])
        first_start[k] = min(first_start.get(k, e.get("timeFrom") or "99:99"), e.get("timeFrom") or "99:99")
    bio = {(b["code"], b["date"]): b for b in db.db.biometric_days.find({"date": rng}, {"_id": 0, "code": 1, "date": 1, "timeIn": 1, "mark": 1})}
    # 1. # on every past working day (not Sunday) without a daily entry, from the day the employee was added
    today = today or local_today()
    y, m = map(int, month.split("-"))
    staff = _staff()
    for p in staff:
        since = str(p.get("createdAt") or "")[:10]
        for d in range(1, last + 1):
            day = date(y, m, d)
            iso = day.isoformat()
            if day >= today or day.weekday() == 6 or (since and iso < since) or (p["code"], iso) in first_start:
                continue
            out.setdefault(p["code"], {})[str(d)] = "#"
    # 2. S / S(L) from the daily entries (S(L) when the biometric Time In is after the first entry's start)
    for (code, d8), start in first_start.items():
        t_in = (bio.get((code, d8)) or {}).get("timeIn")
        out.setdefault(code, {})[str(int(d8[8:]))] = "S(L)" if t_in and start != "99:99" and t_in > start else "S"
    # 3. the letter of the biometric file: C / E / A -> X, H -> H, W -> W
    for (code, d8), b in bio.items():
        if b.get("mark") in BIO_MARKS:
            out.setdefault(code, {})[str(int(d8[8:]))] = BIO_MARKS[b["mark"]]
    # 4. holidays for everyone
    hols = holidays.in_month(month)
    for p in staff:
        for d8 in hols:
            out.setdefault(p["code"], {})[str(int(d8[8:]))] = "H"
    return out


def _days(month: str) -> int:
    y, m = map(int, month.split("-"))
    return calendar.monthrange(y, m)[1]


def _staff() -> list[dict]:
    """Every active employee except the Super Admin, by name."""
    return list(db.users.find({"active": {"$ne": False}, "role": {"$ne": "MANAGER"}}, {"_id": 0, "code": 1, "name": 1, "role": 1, "createdAt": 1}).sort("name", 1))


def _role_options(people: list[dict]) -> list[dict]:
    """The roles of the people on the sheet, for the Roles filter (v59)."""
    labels = {r["key"]: r.get("label") or r["key"] for r in roles_list()}
    keys = sorted({p.get("role") or "" for p in people} - {""}, key=lambda k: labels.get(k, k).lower())
    return [{"value": k, "label": labels.get(k) or BUILT_IN_LABELS.get(k, k.title())} for k in keys]


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
        "employees": [{k: v for k, v in p.items() if k != "createdAt"} for p in people],
        "roles": _role_options(people),
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
    # v59: holidays show as H for everyone, so every employee is listed
    hols = holidays.in_month(month)
    if hols:
        for p in _staff():
            rows.setdefault(p["code"], {"code": p["code"], "name": p["name"], "days": {}})
    users = {u["code"]: u for u in db.users.find({"code": {"$in": list(rows)}}, {"_id": 0, "code": 1, "name": 1, "role": 1})}
    for c, r in rows.items():
        r["name"] = users.get(c, {}).get("name", r["name"])
        r["role"] = users.get(c, {}).get("role", "")
    return {
        "month": month, "days": last, "holidays": {str(int(d[8:])): h.get("name") or "Official Holiday" for d, h in hols.items()},
        "roles": _role_options(list(rows.values())), "employees": sorted(rows.values(), key=lambda r: r["name"].lower()),
    }


# ------------------------------------------------------------------ holidays for everyone ("Add H")

@router.get("/holidays")
def list_holidays(month: str = Query(..., pattern=MONTH_RE), _: dict = Depends(staff_roles)):
    return list(holidays.in_month(month).values())


def _entries_on(day: str) -> list[str]:
    """Names of the employees who have daily entries on the date."""
    codes = {e["facultyCode"] for e in db.entries.find({"activityDate": day}, {"_id": 0, "facultyCode": 1})}
    names = {u["code"]: u["name"] for u in db.users.find({"code": {"$in": list(codes)}}, {"_id": 0, "code": 1, "name": 1})}
    return sorted(names.get(c, c) for c in codes)


@router.post("/holidays", status_code=201)
def add_holiday(body: HolidayIn, me: dict = Depends(staff_roles)):
    """The date becomes H (Official Holiday) for every employee in Daily Entry Submission and the monthly report.
    v59: when someone already has daily entries (S) that day, it is refused with 409 and their names, unless
    `force` is true (the page asks HR / Admin to check first)."""
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(422, "Not a valid date") from exc
    if not body.force:
        names = _entries_on(body.date)
        if names:
            raise HTTPException(409, {"message": f"{len(names)} employee(s) have daily entries on this date", "names": names})
    doc = {"date": body.date, "name": body.name.strip() or "Official Holiday", "by": me["name"], "at": datetime.now(timezone.utc).isoformat()}
    holidays.col.update_one({"_id": body.date}, {"$set": doc}, upsert=True)
    return doc


@router.delete("/holidays/{date}")
def remove_holiday(date: str, _: dict = Depends(staff_roles)):  # v59: HR and Admin revoke too
    if not holidays.col.delete_one({"_id": date}).deleted_count:
        raise HTTPException(404, "Holiday not found")
    return True


# ------------------------------------------------------------------ Admin › Yearly Holidays (v59)

@router.get("/holidays/year")
def year_holidays(year: int = Query(..., ge=2000, le=2100), _: dict = Depends(staff_roles)):
    return list(holidays.col.find({"date": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}}, {"_id": 0}).sort("date", 1))


DATE_HEADS = ("date", "holidaydate", "day")
NAME_HEADS = ("festival", "festivalname", "name", "holiday", "holidayname", "occasion", "description", "reason")


def _head(v) -> str:
    return "".join(ch for ch in str(v or "").lower() if ch.isalnum())


def read_holidays(rows: list[list]) -> tuple[list[dict], list[str]]:
    """[{date, name}] from the rows: the Date (DD/MM/YYYY) and Festival name columns, found by their
    headings (else the first two columns). Returns the holidays and the rows that could not be read."""
    di, ni, start = 0, 1, 0
    for i, row in enumerate(rows[:20]):
        heads = [_head(c) for c in row]
        d = next((j for j, h in enumerate(heads) if h in DATE_HEADS or h.startswith("date")), None)
        n = next((j for j, h in enumerate(heads) if h in NAME_HEADS or h.startswith("festival")), None)
        if d is not None and n is not None:
            di, ni, start = d, n, i + 1
            break
    out, bad = [], []
    for i, row in enumerate(rows[start:], start + 1):
        cells = list(row) + [None, None]
        raw, name = cells[di], str(cells[ni] or "").strip()
        if raw in (None, "") and not name:
            continue
        if isinstance(raw, (int, float)) and 20000 < raw < 80000:  # an Excel serial date
            day = date(1899, 12, 30) + timedelta(days=int(raw))
        else:
            day = parse_date(raw)
        if not day:
            bad.append(f"Row {i}: date '{raw}' is not DD/MM/YYYY")
            continue
        out.append({"date": day.isoformat(), "name": name[:100] or "Official Holiday"})
    return out, bad


@router.post("/holidays/import")
async def import_holidays(request: Request, name: str = Query(..., min_length=1, max_length=200), me: dict = Depends(staff_roles)):
    """Admin › Yearly Holidays: an Excel / CSV file with Date (DD/MM/YYYY) and Festival name. Each date
    becomes H for everyone (a date already there gets the new name)."""
    data = await request.body()
    try:
        rows = await run_in_threadpool(rows_from_upload, name, data)
    except Exception as exc:  # wrong type, empty, unreadable
        raise HTTPException(400, f"Could not read the file: {exc}") from exc
    found, bad = read_holidays(rows)
    if not found:
        raise HTTPException(400, "No holidays found. The file needs a Date (DD/MM/YYYY) column and a Festival name column." + (f" {bad[0]}" if bad else ""))
    now = datetime.now(timezone.utc).isoformat()
    added = sum(0 if holidays.col.find_one({"_id": h["date"]}) else 1 for h in found)
    ops = [UpdateOne({"_id": h["date"]}, {"$set": {**h, "by": me["name"], "at": now, "source": name}}, upsert=True) for h in found]
    holidays.col.bulk_write(ops, ordered=False)
    years = sorted({h["date"][:4] for h in found})
    return {"read": len(found), "added": added, "updated": len(found) - added, "skipped": bad[:50], "years": years}
