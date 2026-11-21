"""Reads time in / time out files exported by the biometric device.

The file is uploaded by Admin / Super Admin: .xlsx / .xls (first sheet, header row), .csv / .txt / .tsv /
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
    mark: str = ""  # v54: "H" or "C" written in the day cell instead of times


DAY_MARKS = {"H", "C", "E", "A", "W"}  # letters in a day cell of the biometric file, kept per employee per day (v59: E, A, W)


@dataclass
class ReadResult:
    punches: list[Punch] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    skipped_rows: int = 0
    errors: list[str] = field(default_factory=list)
    records: int | None = None  # "No.of Records 20" in the last rows of the file
    holidays: int | None = None  # "No of Holidays : 6"


FOOTER_RE = {
    "records": re.compile(r"no\.?\s*of\.?\s*records?\s*[:\-=]?\s*(\d+)?", re.I),
    "holidays": re.compile(r"no\.?\s*of\.?\s*holidays?\s*[:\-=]?\s*(\d+)?", re.I),
}


def _row_text(row: list) -> str:
    return " ".join(str(int(c)) if isinstance(c, float) and c.is_integer() else str(c) for c in row if c not in (None, ""))


def split_footer(rows: list[list], out: ReadResult) -> list[list]:
    """Takes the "No.of Records 20" / "No of Holidays : 6" rows out of the table and keeps the two numbers
    (the label and the number can be in one cell or in two cells)."""
    kept = []
    for row in rows:
        text = _row_text(row)
        hit = False
        for key, rx in FOOTER_RE.items():
            for m in rx.finditer(text):
                hit = True
                if m.group(1) is not None and getattr(out, key) is None:
                    setattr(out, key, int(m.group(1)))
        if not hit:
            kept.append(row)
    return kept


def _key(h: str) -> str:
    return re.sub(r"[\s._\-/():#]", "", str(h or "")).lower()


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


MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
# Columns that hold other times (shift, late, overtime, totals): never read as Time In / Time Out.
NOT_PUNCH = ("shift", "late", "early", "total", "duration", "hrs", "hours", "status", "remark", "break", "overtime", "worked", "work")
IN_PARTS = ("intime", "timein", "checkin", "clockin", "punchin", "firstin", "inpunch", "arrival", "entrytime", "logintime", "firstpunch", "inpunchtime")
OUT_PARTS = ("outtime", "timeout", "checkout", "clockout", "punchout", "lastout", "outpunch", "departure", "exittime", "logouttime", "lastpunch", "outpunchtime")


def _role(cell) -> str | None:
    """What a header cell is, from its name in any wording: id, name, datetime, date, day, month, in, out or time."""
    k = _key(cell)
    if not k or len(k) > 40:
        return None
    punchy = not any(w in k for w in NOT_PUNCH)
    if k in OUT_HEADERS or (punchy and any(w in k for w in OUT_PARTS)):
        return "out"
    if k in IN_HEADERS or (punchy and any(w in k for w in IN_PARTS)):
        return "in"
    if "name" in k and "dept" not in k and "department" not in k and "shift" not in k and "company" not in k:
        return "name"
    if k in ID_HEADERS or re.fullmatch(r"(emp|employee|staff|user|enroll|enrollment|biometric|device|card|badge|ac|person|faculty|machine)(code|id|no|number)", k) or (k.endswith("code") and k.startswith(("emp", "employee", "staff", "faculty", "user", "punch", "attendance"))):
        return "id"
    if k in DATETIME_HEADERS or ("date" in k and "time" in k):
        return "datetime"
    if k in {"month", "monthyear", "period", "attmonth", "payrollmonth", "salarymonth", "yearmonth"} or (k.startswith("month") and len(k) < 12):
        return "month"
    if k in DATE_HEADERS or k.endswith("date") or k.startswith("date"):
        return "date"
    if k in {"day", "dayno", "dd", "dates"}:
        return "day"
    if k in TIME_HEADERS or (punchy and k in {"punchtime", "logtime", "attendancetime"}):
        return "time"
    return None


def month_in_text(text) -> tuple[int, int] | None:
    """(year, month) from "October 2026", "Oct-26", "10/2026", "2026-10", "01/10/2026 to 31/10/2026" or a date value."""
    if isinstance(text, (datetime, date)):
        return text.year, text.month
    s = str(text or "").strip().lower()
    if not s:
        return None
    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\-,/']*(?:\d{1,2}(?:st|nd|rd|th)?[\s,\-]+)?'?(\d{4}|\d{2})\b", s)
    if m:
        y = int(m.group(2))
        return (y + 2000 if y < 100 else y), MONTHS[m.group(1)]
    m = re.search(r"\b\d{1,2}[\s\-/](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/,]*(\d{4}|\d{2})\b", s)
    if m:
        y = int(m.group(2))
        return (y + 2000 if y < 100 else y), MONTHS[m.group(1)]
    for token in re.findall(r"\b\d{1,4}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\b", s):
        d = parse_date(token)
        if d:
            return d.year, d.month
        a, b = re.split(r"[/\-.]", token)[:2]
        if len(a) == 4 and 1 <= int(b) <= 12:
            return int(a), int(b)
        if len(b) == 4 and 1 <= int(a) <= 12:
            return int(b), int(a)
    return None


def _day_number(cell) -> int | None:
    """1 to 31 from a day cell or day header: 5, "05", "5 Mon", "Mon 5", "5-Tue"."""
    if isinstance(cell, bool):
        return None
    if isinstance(cell, (int, float)) and float(cell).is_integer() and 1 <= int(cell) <= 31:
        return int(cell)
    m = re.fullmatch(r"(?:[a-z]{2,3}[\s\-]*)?(\d{1,2})(?:[\s\-]*[a-z]{1,3})?", str(cell or "").strip().lower())
    if m and 1 <= int(m.group(1)) <= 31:
        return int(m.group(1))
    return None


def _day_columns(row: list) -> dict[int, object]:
    """Columns of a day-wise (matrix) header: {column: date or day number}. Needs at least 5 days."""
    cols: dict[int, object] = {}
    for j, cell in enumerate(row):
        if isinstance(cell, (datetime, date)):
            cols[j] = cell.date() if isinstance(cell, datetime) else cell
            continue
        d = parse_date(cell) if isinstance(cell, str) and re.search(r"\d+[/\-.]\d+[/\-.]\d+", cell) else None
        if d:
            cols[j] = d
            continue
        n = _day_number(cell)
        if n is not None:
            cols[j] = n
    nums = [v for v in cols.values() if isinstance(v, int)]
    if len(cols) < 5 or (nums and len(set(nums)) < len(nums)):
        return {}
    return cols


def _times(cell) -> list[time]:
    """Every time in a cell: a time value, or text like "09:02", "9.05 AM", "09:02 18:31", "09:02-18:31"."""
    if isinstance(cell, datetime):
        return [cell.time().replace(microsecond=0)] if (cell.hour or cell.minute) else []
    if isinstance(cell, time):
        return [cell.replace(microsecond=0)]
    if isinstance(cell, float) and 0 < cell < 1:  # Excel time stored as a fraction of a day
        mins = round(cell * 24 * 60)
        return [time(mins // 60, mins % 60)]
    out = []
    for h, m, ap in re.findall(r"\b(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?", str(cell or "").lower()):
        h, m = int(h), int(m)
        if ap.startswith("p") and h < 12:
            h += 12
        elif ap.startswith("a") and h == 12:
            h = 0
        if h < 24 and m < 60 and (h or m):
            out.append(time(h, m))
    return out


def _person_in_row(row: list) -> tuple[str, str]:
    """ "Emp Code: 101", "Employee Name : Ravi" (in one cell, or label and value in two cells)."""
    pid = name = ""
    cells = [str(c).strip() if c is not None else "" for c in row]
    for j, text in enumerate(cells):
        if not text:
            continue
        for part in re.split(r"\s{2,}|\t|\|", text):
            m = re.match(r"^\s*([A-Za-z .]+?)\s*[:\-]\s*(.+?)\s*$", part)
            if m:
                role, value = _role(m.group(1)), m.group(2)
            else:
                role = _role(part) if part.endswith(":") or _role(part) in ("id", "name") else None
                value = next((c for c in cells[j + 1:] if c), "") if role else ""
                value = value.lstrip(":- ").strip()
            if role == "id" and value and not pid:
                pid = value.split()[0]
            elif role == "name" and value and not name:
                name = value
    return pid, name


def _find_header(rows: list[list]) -> tuple[int, dict[str, int]] | None:
    """Looks at the first rows for one that names an ID or Name column plus a date, day, month or time column,
    in any order and any wording ("Emp. Code", "Employee Name", "In Time", "Punch Out", "Month" ...)."""
    for i, row in enumerate(rows[:25]):
        cols: dict[str, int] = {}
        for j, cell in enumerate(row):
            role = _role(cell)
            if role and role not in cols:
                cols[role] = j
        if ("id" in cols or "name" in cols) and ({"datetime", "date", "in", "time", "day"} & cols.keys()):
            return i, cols
    return None


def _cell(row: list, idx: int | None):
    return row[idx] if idx is not None and idx < len(row) else None


def _resolve_day(raw, month: tuple[int, int] | None) -> date | None:
    d = parse_date(raw)
    if d:
        return d
    n = _day_number(raw)
    if n and month:
        try:
            return date(month[0], month[1], n)
        except ValueError:
            return None
    return None


def _file_month(rows: list[list]) -> tuple[int, int] | None:
    """Month named in the title rows above the table ("Attendance for October 2026", "01/10/2026 To 31/10/2026")."""
    for row in rows[:12]:
        for cell in row:
            if isinstance(cell, str) and len(cell) > 4:
                m = month_in_text(cell)
                if m:
                    return m
    return None


def read_rows(rows: list[list], file: str, out: ReadResult, month: tuple[int, int] | None = None) -> None:
    """Reads one sheet in any of three layouts (columns in any order, any header wording):
    1. a column table: code / name, date (or day + month), time in / time out (or one punch per row);
    2. a day-wise sheet: a row of days 1 to 31 with the times under each day, one row (or In / Out rows)
       per employee, or "Emp Code: 101  Name: Ravi" blocks; the month comes from a Month column or the title;
    3. a headerless punch log: code, then date and time.
    `month` (year, month): chosen by the Admin on upload (v52: the file has only "Employee Name" and the days
    1 to 31, no month). It is used for the day numbers, and punches of another month are left out.
    The "No.of Records" / "No of Holidays" rows are read into out.records / out.holidays."""
    rows = split_footer(rows, out)
    if month:
        before = len(out.punches)
        _read(rows, file, out, month, forced=True)
        keep = [p for p in out.punches[before:] if (p.day.year, p.day.month) == month]
        out.skipped_rows += len(out.punches) - before - len(keep)
        out.punches[before:] = keep
        return
    _read(rows, file, out, None)


def _read(rows: list[list], file: str, out: ReadResult, month: tuple[int, int] | None, forced: bool = False) -> None:
    file_month = month or _file_month(rows)
    day_header = next((i for i, r in enumerate(rows[:40]) if _day_columns(r)), None)
    found = _find_header(rows)
    if day_header is not None and (found is None or found[0] >= day_header or ({"in", "out", "time", "datetime"} & found[1].keys()) == set()):
        _read_day_wise(rows, file, out, file_month, forced)
        return
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
        if isinstance(_cell(row, c.get("id")), float) and float(_cell(row, c.get("id"))).is_integer():
            pid = str(int(_cell(row, c.get("id"))))
        if not pid and not name:
            out.skipped_rows += 1
            continue
        row_month = month_in_text(_cell(row, c.get("month"))) if "month" in c and not forced else None
        row_month = row_month or file_month
        times: list[time] = []
        day = None
        if "datetime" in c:
            dt = parse_datetime(_cell(row, c["datetime"]))
            if dt:
                day, times = dt.date(), [dt.time()]
        if day is None and "date" in c:
            raw_date = _cell(row, c["date"])
            day = _resolve_day(raw_date, row_month)
            if isinstance(raw_date, datetime) and not ({"in", "out", "time"} & c.keys()) and (raw_date.hour or raw_date.minute):
                times = [raw_date.time()]
        if day is None and "day" in c:
            day = _resolve_day(_cell(row, c["day"]), row_month)
        if "in" in c or "out" in c:
            t_in = (_times(_cell(row, c.get("in"))) or [None])[0] if "in" in c else None
            t_out = (_times(_cell(row, c.get("out"))) or [None])[-1] if "out" in c else None
            times += [t for t in (t_in, t_out) if t]
        elif "time" in c and not times:
            times = _times(_cell(row, c["time"]))
        if not day or not times:
            out.skipped_rows += 1
            continue
        out.punches.append(Punch(pid, name, day, times, file))
    if out.skipped_rows and not out.punches and "month" not in c and not file_month and "datetime" not in c:
        out.errors.append(f"{file}: no punches read from {out.skipped_rows} rows. If the date column has only the day number, add a Month column or the month in the title.")


SKIP_LABELS = ("status", "duration", "total", "late", "early", "overtime", "shift", "break", "hrs", "hours", "remark", "present", "absent", "leave", "weekoff", "holiday", "worked")


def _read_day_wise(rows: list[list], file: str, out: ReadResult, file_month: tuple[int, int] | None, forced: bool = False) -> None:
    person = ("", "")
    day_cols: dict[int, object] = {}
    id_col = name_col = month_col = None
    month = file_month
    for row in rows:
        cols = _day_columns(row)
        if cols:
            day_cols = cols
            roles = {_role(c): j for j, c in enumerate(row) if j not in cols and _role(c)}
            id_col, name_col, month_col = roles.get("id"), roles.get("name"), roles.get("month")
            continue
        pid, name = _person_in_row(row)
        if pid or name:
            if pid and pid != person[0]:
                person = (pid, name)
            elif name and not pid:
                person = (person[0] if not person[1] else "", name)
            row_month = None if forced else next((month_in_text(c) for c in row if isinstance(c, str) and "month" in c.lower() and month_in_text(c)), None)
            month = row_month or month
            if not any(_times(_cell(row, j)) for j in day_cols):
                continue
        if not day_cols:
            m = None if forced else next((month_in_text(c) for c in row if isinstance(c, str) and month_in_text(c)), None)
            month = m or month
            continue
        cell_id, cell_name = str(_cell(row, id_col) or "").strip(), str(_cell(row, name_col) or "").strip()
        if isinstance(_cell(row, id_col), float) and float(_cell(row, id_col)).is_integer():
            cell_id = str(int(_cell(row, id_col)))
        if cell_id or cell_name:
            person = (cell_id, cell_name)
        row_month = month_in_text(_cell(row, month_col)) if month_col is not None and not forced else None
        label = " ".join(_key(c) for j, c in enumerate(row) if j not in day_cols and j not in (id_col, name_col, month_col) and isinstance(c, str))
        if any(w in label for w in SKIP_LABELS):
            continue
        if not (person[0] or person[1]):
            continue
        for j, d in day_cols.items():
            raw = _cell(row, j)
            times = _times(raw)
            mark = str(raw).strip().upper() if isinstance(raw, str) and not times else ""
            if mark not in DAY_MARKS:
                mark = ""
            if not times and not mark:
                continue
            day = d if isinstance(d, date) else _resolve_day(d, row_month or month)
            if not day:
                out.skipped_rows += 1
                continue
            out.punches.append(Punch(person[0], person[1], day, times, file, mark))
    if out.skipped_rows and not out.punches:
        out.errors.append(f"{file}: the day columns have no month. Add a Month column or the month in the title.")
