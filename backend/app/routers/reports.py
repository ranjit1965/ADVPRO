import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from .. import db
from ..security import current_user, require_roles
from .entries import build_query, with_minutes

router = APIRouter(tags=["dashboard & reports"])
NON_PERFORMANCE = {"others"}
MONTH = Query(..., pattern=r"^\d{4}-\d{2}$")


def fetch(f: dict) -> list[dict]:
    return [with_minutes(e) for e in db.entries.find(f, {"searchText": 0}).sort([("activityDate", 1), ("timeFrom", 1)])]


def month_range(month: str) -> tuple[str, str]:
    y, m = map(int, month.split("-"))
    return f"{month}-01", f"{month}-{calendar.monthrange(y, m)[1]:02d}"


def hours(minutes: int) -> float:
    return round(minutes / 60, 1)


VIEW_ALL = ("HR", "ADMIN", "MANAGER")


def scoped_code(user: dict, code: str | None) -> str | None:
    """Faculty and staff only see their own figures; HR, Admin and Manager can open anyone's."""
    return code if user["role"] in VIEW_ALL else user["code"]


@router.get("/dashboard")
def dashboard(facultyCode: str, me: dict = Depends(current_user)):
    facultyCode = scoped_code(me, facultyCode)
    today = date.today()
    t = today.isoformat()
    month_start = today.replace(day=1).isoformat()
    mine = fetch({"facultyCode": facultyCode})
    todays = [e for e in mine if e["activityDate"] == t]
    month = [e for e in mine if month_start <= e["activityDate"] <= t]
    with_entries = {e["activityDate"] for e in month}
    missing, d = [], today.replace(day=1)
    while d < today:
        if d.weekday() != 6 and d.isoformat() not in with_entries:
            missing.append(d.isoformat())
        d += timedelta(days=1)
    last7 = []
    for i in range(6, -1, -1):
        iso = (today - timedelta(days=i)).isoformat()
        last7.append({"date": iso, "hours": hours(sum(e["minutes"] for e in mine if e["activityDate"] == iso))})
    by_type: dict[str, int] = {}
    for e in month:
        by_type[e["activityType"]] = by_type.get(e["activityType"], 0) + e["minutes"]
    return {
        "today": t,
        "todayEntries": len(todays),
        "todayMinutes": sum(e["minutes"] for e in todays),
        "totalEntries": len(mine),
        "monthEntries": len(month),
        "monthMinutes": sum(e["minutes"] for e in month if e["activityType"] not in NON_PERFORMANCE),
        "monthTotalMinutes": sum(e["minutes"] for e in month),
        "missingDays": missing,
        "last7": last7,
        "byType": [{"type": k, "hours": hours(v)} for k, v in by_type.items()],
        "todayList": todays,
        "recent": sorted(mine, key=lambda e: e["createdAt"], reverse=True)[:6],
    }


@router.get("/reports/monthly")
def monthly_report(month: str = MONTH, facultyCode: str | None = None, activityType: str | None = None, facultyIn: str | None = None, me: dict = Depends(current_user)):
    facultyCode = scoped_code(me, facultyCode)
    frm, to = month_range(month)
    rows = fetch(build_query(facultyCode=facultyCode, activityType=activityType, facultyIn=facultyIn, dateFrom=frm, dateTo=to))
    types: dict[str, dict] = {}
    days: dict[str, int] = {}
    for e in rows:
        t = types.setdefault(e["activityType"], {"type": e["activityType"], "entries": 0, "minutes": 0})
        t["entries"] += 1
        t["minutes"] += e["minutes"]
        days[e["activityDate"]] = days.get(e["activityDate"], 0) + e["minutes"]
    perf = [e for e in rows if e["activityType"] not in NON_PERFORMANCE]
    others = [e for e in rows if e["activityType"] in NON_PERFORMANCE]
    # Biometric Time In / Out against the day's entries (always all entries of the day, whatever the filters).
    biometric = None
    if facultyCode:
        from .biometric import compare_month  # noqa: PLC0415

        day_rows = rows if not (activityType or facultyIn) else fetch(build_query(facultyCode=facultyCode, dateFrom=frm, dateTo=to))
        biometric = compare_month(facultyCode, month, day_rows)
    return {
        "biometric": biometric,
        "rows": rows,
        "summary": {
            "entries": len(rows),
            "minutes": sum(e["minutes"] for e in rows),
            "performanceMinutes": sum(e["minutes"] for e in perf),
            "othersEntries": len(others),
            "othersMinutes": sum(e["minutes"] for e in others),
            "outstation": sum(e["facultyIn"] == "Outstation" for e in rows),
            "activeDays": len(days),
        },
        "byType": [{**t, "hours": hours(t["minutes"])} for t in types.values()],
        "byDay": [{"date": d, "hours": hours(m)} for d, m in sorted(days.items())],
    }


@router.get("/reports/working-hours")
def working_hours(month: str = MONTH, facultyCode: str | None = None, _: dict = Depends(require_roles("HR", "ADMIN", "MANAGER"))):
    frm, to = month_range(month)
    # Every employee (faculty, HR, admin, staff, manager) who is active or has entries this month.
    q = {"code": facultyCode} if facultyCode else {}
    out = []
    for f in db.users.find(q).sort("name"):
        lst = fetch(build_query(facultyCode=f["code"], dateFrom=frm, dateTo=to))
        if not f.get("active", True) and not lst:
            continue
        s = lambda pred: sum(e["minutes"] for e in lst if pred(e))  # noqa: E731
        out.append(
            {
                "facultyCode": f["code"],
                "facultyName": f["name"],
                "role": f.get("role", "FACULTY"),
                "department": f.get("department", ""),
                "days": len({e["activityDate"] for e in lst}),
                "entries": len(lst),
                "classMinutes": s(lambda e: e["activityType"] == "class"),
                "centerMinutes": s(lambda e: e["facultyIn"] == "Center"),
                "outstationMinutes": s(lambda e: e["facultyIn"] == "Outstation"),
                "performanceMinutes": s(lambda e: e["activityType"] not in NON_PERFORMANCE),
                "othersMinutes": s(lambda e: e["activityType"] in NON_PERFORMANCE),
                "totalMinutes": s(lambda e: True),
            }
        )
    return {"rows": out}
