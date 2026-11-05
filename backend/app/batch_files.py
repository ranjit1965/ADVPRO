"""Reads the batch table (BatchMaster) uploaded by Admin / Manager.

The Excel / CSV file (.xlsx, .xls or .csv) is read into rows; this module finds the columns by their header name, so the order does not matter. Only Batch No and Faculty are
required; the others are stored when present.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time

from .biometric_files import _key, parse_date, parse_time

# Header names, compared without spaces, dots, dashes or underscores.
COLUMNS = {
    "batchNo": {"batchno", "batch", "batchid", "batchcode", "batchnumber"},
    "faculty": {"facultyalloted", "facultyallotted", "faculty", "facultycode", "facultyshortname", "shortname", "facultyshort"},
    "facultyName": {"facultyname"},
    "startDate": {"batchstartdate", "startdate", "start", "fromdate"},
    "endDate": {"batchenddate", "enddate", "end", "todate"},
    "actualEndDate": {"actualenddate", "actualend", "completeddate"},
    "timeIn": {"batchtimein", "timein", "starttime", "fromtime"},
    "timeOut": {"batchtimeout", "timeout", "endtime", "totime"},
    "course": {"course", "courseid", "coursecode", "coursename"},
    "courseType": {"coursetype"},
    "totalHours": {"totalhrs", "totalhours", "hours", "hrs", "duration"},
    "batchType": {"batchtype"},
    "classType": {"classtype"},
    "status": {"status", "batchstatus"},
    "breakDate": {"breakdate"},
}
REQUIRED = ("batchNo", "faculty")


@dataclass
class BatchRow:
    batchNo: str
    faculty: str
    facultyName: str = ""
    startDate: date | None = None
    endDate: date | None = None
    actualEndDate: date | None = None
    timeIn: time | None = None
    timeOut: time | None = None
    course: str = ""
    courseType: str = ""
    totalHours: float | None = None
    batchType: str = ""
    classType: str = ""
    status: str = ""
    breakDate: date | None = None


@dataclass
class ReadResult:
    rows: list[BatchRow] = field(default_factory=list)
    skipped_rows: int = 0
    columns: list[str] = field(default_factory=list)


def clean_text(v) -> str:
    """Trims the value, including the tabs and line breaks Access batch numbers sometimes carry."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def _number(v) -> float | None:
    if v in (None, ""):
        return None
    try:
        n = float(str(v).strip())
    except ValueError:
        return None
    return int(n) if n.is_integer() else n


def _time(v) -> time | None:
    if isinstance(v, datetime):
        # Access stores a time-only value as 30-Dec-1899 + time.
        return v.time().replace(microsecond=0)
    return parse_time(v)


def read_rows(rows: list[list]) -> ReadResult:
    out = ReadResult()
    header_at, cols = None, {}
    for i, row in enumerate(rows[:15]):
        found: dict[str, int] = {}
        for j, cell in enumerate(row):
            k = _key(cell)
            for name, aliases in COLUMNS.items():
                if k in aliases and name not in found:
                    found[name] = j
                    break
        if all(r in found for r in REQUIRED):
            header_at, cols = i, found
            break
    if header_at is None:
        raise RuntimeError("No header row with a Batch No and a Faculty column (for example BatchNo and FacultyAlloted)")
    out.columns = [clean_text(c) for c in rows[header_at]]

    def cell(row, name):
        j = cols.get(name)
        return row[j] if j is not None and j < len(row) else None

    for row in rows[header_at + 1:]:
        batch_no, faculty = clean_text(cell(row, "batchNo")), clean_text(cell(row, "faculty")).upper()
        if not batch_no:
            out.skipped_rows += 1
            continue
        out.rows.append(BatchRow(
            batchNo=batch_no,
            faculty=faculty,
            facultyName=clean_text(cell(row, "facultyName")),
            startDate=parse_date(cell(row, "startDate")),
            endDate=parse_date(cell(row, "endDate")),
            actualEndDate=parse_date(cell(row, "actualEndDate")),
            timeIn=_time(cell(row, "timeIn")),
            timeOut=_time(cell(row, "timeOut")),
            course=clean_text(cell(row, "course")).upper(),
            courseType=clean_text(cell(row, "courseType")),
            totalHours=_number(cell(row, "totalHours")),
            batchType=clean_text(cell(row, "batchType")),
            classType=clean_text(cell(row, "classType")),
            status=clean_text(cell(row, "status")).upper(),
            breakDate=parse_date(cell(row, "breakDate")),
        ))
    return out
