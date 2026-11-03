"""Reads the batch table (BatchMaster) from the institute's Access database or an export of it.

Supported sources:
  * .accdb / .mdb   Microsoft Access, read with pyodbc and the "Microsoft Access Driver (*.mdb, *.accdb)"
                    (Windows; install the free Microsoft Access Database Engine if the driver is missing)
  * .xlsx           the table exported to Excel (first sheet, header row)
  * .csv / .txt     the table exported as text (comma, semicolon, tab or | separated)

Columns are found by their header name, so the order does not matter. Only Batch No and
Faculty are required; the others are stored when present.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path

from .biometric_files import _key, _rows_from_text, _rows_from_xlsx, parse_date, parse_time

EXTENSIONS = {".accdb", ".mdb", ".xlsx", ".csv", ".txt"}
DEFAULT_TABLE = "BatchMaster"

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


def _rows_from_access(path: Path, table: str) -> list[list]:
    try:
        import pyodbc  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError("Reading .accdb / .mdb needs the pyodbc package: run  pip install pyodbc  in the backend folder") from exc
    drivers = [d for d in pyodbc.drivers() if "access" in d.lower()]
    if not drivers:
        raise RuntimeError(
            "No Microsoft Access ODBC driver on this computer. Install the Microsoft Access Database Engine "
            "(same 32 / 64 bit as Python), or export the table to Excel and use the .xlsx file."
        )
    if not re.fullmatch(r"[A-Za-z0-9_ ]{1,64}", table):
        raise RuntimeError("Table name may only have letters, numbers, spaces and _")
    conn = pyodbc.connect(f"DRIVER={{{drivers[0]}}};DBQ={path};ReadOnly=1;", autocommit=True)
    try:
        cur = conn.cursor()
        tables = [t.table_name for t in cur.tables(tableType="TABLE")]
        match = next((t for t in tables if t.lower() == table.lower()), None)
        if not match:
            raise RuntimeError(f'Table "{table}" not found in the Access file. Tables: {", ".join(tables) or "none"}')
        cur.execute(f"SELECT * FROM [{match}]")
        header = [c[0] for c in cur.description]
        return [header] + [list(r) for r in cur.fetchall()]
    finally:
        conn.close()


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


def resolve_file(path_text: str) -> Path:
    """The batch file to read. A file path is used as it is. For a folder (such as the shared network
    folder set in BATCH_IMPORT_PATH) the newest file named like BatchMaster is used; if there is none,
    the newest Access database; then the newest Excel / CSV file."""
    path = Path(str(path_text).strip().strip('"'))
    if path.is_file():
        return path
    if not path.is_dir():
        raise FileNotFoundError(f"Folder or file not found (or no permission): {path}")
    files = [p for p in path.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS and not p.name.startswith("~$")]
    if not files:
        raise FileNotFoundError(f"No .accdb, .mdb, .xlsx or .csv file in {path}")
    newest = lambda items: max(items, key=lambda p: p.stat().st_mtime)  # noqa: E731
    named = [p for p in files if "batchmaster" in _key(p.stem)]
    access = [p for p in files if p.suffix.lower() in (".accdb", ".mdb")]
    return newest(named or access or files)


def read_file(file_path: str, table: str = DEFAULT_TABLE) -> ReadResult:
    path = Path(file_path)
    ext = path.suffix.lower()
    if ext not in EXTENSIONS:
        raise RuntimeError(f"Use an .accdb, .mdb, .xlsx or .csv file (got {ext or 'no extension'})")
    if ext in (".accdb", ".mdb"):
        rows = _rows_from_access(path, table or DEFAULT_TABLE)
    elif ext == ".xlsx":
        rows = _rows_from_xlsx(path)
    else:
        raw = path.read_bytes()
        text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8-sig", errors="replace")
        rows = _rows_from_text(text)
    return read_rows(rows)
