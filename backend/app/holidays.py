"""Holidays for everyone (v54): Attendance › "Add H" marks a date as Official Holiday (H) for all employees.

Used by Daily Entry Submission (Attendance), its Print, and the biometric part of the Monthly Report.
Stored in `holidays`: {_id: "YYYY-MM-DD", date, name, by, at}.
"""
import calendar

from . import db

col = db.db.holidays


def in_month(month: str) -> dict[str, dict]:
    """{"YYYY-MM-DD": holiday} for the month."""
    y, m = map(int, month.split("-"))
    last = f"{month}-{calendar.monthrange(y, m)[1]:02d}"
    return {h["date"]: h for h in col.find({"date": {"$gte": f"{month}-01", "$lte": last}}, {"_id": 0}).sort("date", 1)}
