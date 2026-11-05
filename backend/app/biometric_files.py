"""Reads time in / time out files exported by the biometric device.

The file is uploaded by Admin / Manager: .xlsx / .xls (first sheet, header row), .csv / .txt / .tsv /
.dat (comma, semicolon, tab or | separated), or ZKTeco-style logs without a header
("1  2026-10-01 09:02:11  1 0 ...").

Two layouts are understood:
  * One row per person per day with In and Out columns
    (Emp Code / Name / Date / In Time / Out Time)
  * One row per punch (Emp Code / Name / Date + Time, or a single Date Time column).
    The first punch of the day is Time In and the last one is Time Out.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path

# Header names seen in common device exports, compared without spaces, dots, dashes or underscores.
ID_HEADERS = {"empcode", "employeecode", "code", "empid", "employeeid", "userid", "enrollno", "enrollnumber", "acno", "cardno", "badgenumber", "id", "no", "staffid", "staffcode"}
NAME_HEADERS = {"name", "empname", "employeename", "username", "staffname", "fullname"}
DATE_HEADERS = {"date", "attdate", "attendancedate", "punchdate", "logdate", "day"}
DATETIME_HEADERS = {"datetime", "punchtime", "logtime", "timestamp", "checktime", "punchdatetime", "logdatetime", "attendancetime"}
TIME_HEADERS = {"time", "punch", "logtimeonly"}
IN_HEADERS = {"intime", "timein", "checkin", "firstin", "in", "punchin", "clockin", "arrival"}
OUT_HEADERS = {"outtime", "timeout", "checkout", "lastout", "out", "punchout", "clockout", "departure"}

DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y", "%d-%b-%Y", "%d %b %Y", "%d-%b-%y", "%m/%d/%Y")
TIME_FORMATS = ("%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p", "%I:%M:%S%p", "%I:%M%p")

EXTENSIONS = {".xlsx", ".xls", ".csv", ".txt", ".tsv", ".dat"}


@dataclass
class Punch:
    person_id: str
    name: str
    day: date
    times: list[time] = field(default_factory=list)
    file: str = ""


@dataclass
class ReadResult:
    punches: list[Punch] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    skipped_rows: int = 0
    errors: list[str] = field(default_factory=list)


def _key(h: str) -> str:
    return re.sub(r"[\s._\-/()]", "", str(h or "")).lower()


def parse_date(text) -> date | None:
    if isinstance(text, datetime):
        return text.date()
    if isinstance(text, date):
        return text
    s = str(text or "").strip()
    if not s:
        return None
    s = s.split(" ")[0] if re.match(r"^\d", s) and " " in s and ":" in s else s
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_time(text) -> time | None:
    if isinstance(text, datetime):
        return text.time().replace(microsecond=0)
    if isinstance(text, time):
        return text.replace(microsecond=0)
    s = str(text or "").strip().upper()
    if not s or s in {"-", "--", "NA", "N/A", "00:00", "00:00:00"}:
        return None
    for fmt in TIME_FORMATS:
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    return None


def parse_datetime(text) -> datetime | None:
    if isinstance(text, datetime):
        return text
    s = re.sub(r"\s+", " ", str(text or "").strip())
    if " " not in s:
        return None
    d_part, t_part = s.split(" ", 1)
    d, t = parse_date(d_part), parse_time(t_part)
    return datetime.combine(d, t) if d and t else None


def rows_from_text(raw: str) -> list[list[str]]:
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return []
    sample = "\n".join(lines[:20])
    for delim in ("\t", ",", ";", "|"):
        if delim in sample:
            return [[c.strip() for c in row] for row in csv.reader(io.StringIO("\n".join(lines)), delimiter=delim)]
    # Whitespace separated (some .dat logs): keep "date time" together.
    rows = []
    for ln in lines:
        m = re.match(r"^\s*(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)(.*)$", ln)
        rows.append([m.group(1), m.group(2)] + m.group(3).split() if m else ln.split())
    return rows


def _rows_from_xlsx(path: Path) -> list[list]:
    from openpyxl import load_workbook  # noqa: PLC0415

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]
    wb.close()
    return rows


def _rows_from_xls(path: Path) -> list[list]:
    """Old Excel 97-2003 (.xls) workbooks, first sheet. Dates come back as datetime values."""
    import xlrd  # noqa: PLC0415

    book = xlrd.open_workbook(str(path))
    sh = book.sheet_by_index(0)
    rows = []
    for r in range(sh.nrows):
        row = []
        for c in range(sh.ncols):
            cell = sh.cell(r, c)
            v = cell.value
            if cell.ctype == xlrd.XL_CELL_DATE:
                try:
                    v = xlrd.xldate.xldate_as_datetime(v, book.datemode)
                except Exception:  # noqa: BLE001
                    pass
            elif cell.ctype == xlrd.XL_CELL_NUMBER and float(v).is_integer():
                v = int(v)
            row.append(v)
        if any(x not in (None, "") for x in row):
            rows.append(row)
    return rows


def rows_from_file(path: Path) -> list[list]:
    """Rows of an .xlsx, .xls or text (.csv / .txt / .tsv / .dat) file, in any column order."""
    ext = path.suffix.lower()
    if ext == ".xlsx":
        return _rows_from_xlsx(path)
    if ext == ".xls":
        return _rows_from_xls(path)
    raw = path.read_bytes()
    text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8-sig", errors="replace")
    return rows_from_text(text)


MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def rows_from_upload(name: str, data: bytes) -> list[list]:
    """Rows of a file uploaded from the browser (any column order)."""
    import tempfile  # noqa: PLC0415

    ext = Path(name).suffix.lower()
    if ext not in EXTENSIONS:
        raise ValueError("Upload a .xlsx, .xls or .csv file")
    if not data:
        raise ValueError("The file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("The file is larger than 20 MB")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"upload{ext}"
        path.write_bytes(data)
        return rows_from_file(path)


def _find_header(rows: list[list]) -> tuple[int, dict[str, int]] | None:
    """Looks at the first rows for one that names an ID or Name column plus a date or time column."""
    for i, row in enumerate(rows[:15]):
        cols: dict[str, int] = {}
        for j, cell in enumerate(row):
            k = _key(cell)
            for role, names in (("id", ID_HEADERS), ("name", NAME_HEADERS), ("datetime", DATETIME_HEADERS), ("date", DATE_HEADERS),
                                ("in", IN_HEADERS), ("out", OUT_HEADERS), ("time", TIME_HEADERS)):
                if k in names and role not in cols:
                    cols[role] = j
                    break
        if ("id" in cols or "name" in cols) and ({"datetime", "date", "in"} & cols.keys()):
            return i, cols
    return None


def _cell(row: list, idx: int | None):
    return row[idx] if idx is not None and idx < len(row) else None


def read_rows(rows: list[list], file: str, out: ReadResult) -> None:
    found = _find_header(rows)
    if not found:
        # Headerless punch log: first column = person id, then a date-time.
        for row in rows:
            dt = parse_datetime(row[1]) if len(row) > 1 else None
            if not dt and len(row) > 2:
                d, t = parse_date(row[1]), parse_time(row[2])
                dt = datetime.combine(d, t) if d and t else None
            if not dt or not str(row[0]).strip():
                out.skipped_rows += 1
                continue
            out.punches.append(Punch(str(row[0]).strip(), "", dt.date(), [dt.time()], file))
        return

    header_at, c = found
    for row in rows[header_at + 1:]:
        pid = str(_cell(row, c.get("id")) or "").strip()
        name = str(_cell(row, c.get("name")) or "").strip()
        if not pid and not name:
            out.skipped_rows += 1
            continue
        times: list[time] = []
        day = None
        if "datetime" in c:
            dt = parse_datetime(_cell(row, c["datetime"]))
            if dt:
                day, times = dt.date(), [dt.time()]
        if day is None and "date" in c:
            raw_date = _cell(row, c["date"])
            day = parse_date(raw_date)
            if isinstance(raw_date, datetime) and "in" not in c and "time" not in c:
                times = [raw_date.time()]
        if "in" in c or "out" in c:
            t_in, t_out = parse_time(_cell(row, c.get("in"))), parse_time(_cell(row, c.get("out")))
            times += [t for t in (t_in, t_out) if t]
        elif "time" in c and not times:
            t = parse_time(_cell(row, c["time"]))
            times = [t] if t else []
        if not day or not times:
            out.skipped_rows += 1
            continue
        out.punches.append(Punch(pid, name, day, times, file))
