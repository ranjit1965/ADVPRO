"""Master › Course: import courses and their chapters from an Excel / CSV file.

1. Admin / Manager upload the file (.xlsx, .xls or .csv; columns in any order and any usual wording:
   Course ID / Course Code, Course Name, Chapter No / Session No, Chapter Name / Topic). Nothing is saved yet:
   POST /api/course-import/preview returns every course found, with its chapters, marked New, Already added
   or "N new chapters".
2. On the page they press Add or Skip on each course (or Add all new); Add calls POST /api/course-import/add
   with the chosen courses. Existing courses keep their name; only chapter numbers they do not have yet are added.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .. import db
from ..biometric_files import rows_from_upload
from ..security import require_section

router = APIRouter(prefix="/course-import", tags=["course import"])
master_roles = require_section("master", "admin")

CH_WORDS = ("chapter", "session", "topic", "module", "unit", "lesson")


def _key(h) -> str:
    return re.sub(r"[\s._\-/():#]", "", str(h or "")).lower()


def _role(cell) -> str | None:
    k = _key(cell)
    if not k or len(k) > 40:
        return None
    chapterish = any(w in k for w in CH_WORDS)
    if chapterish and (k.endswith(("no", "number", "num", "id", "sno", "order")) or k in {"chno", "chapter#"}):
        return "chapterNo"
    if chapterish and (any(w in k for w in ("name", "title", "detail", "description")) or k in CH_WORDS or k == "topics"):
        return "chapterName"
    if k in {"courseid", "coursecode", "cid", "courseno", "code", "id", "coursecd"} or ("course" in k and ("id" in k or "code" in k)):
        return "courseId"
    if k in {"coursename", "course", "name", "title", "coursetitle", "program", "programme", "programname"} or ("course" in k and ("name" in k or "title" in k)):
        return "courseName"
    return None


def _text(v) -> str:
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()


def read_courses(rows: list[list]) -> tuple[list[dict], int, list[str]]:
    """Courses found in the rows: [{id, name, chapters: [{no, name}]}], skipped rows, errors."""
    header = None
    for i, row in enumerate(rows[:20]):
        cols: dict[str, int] = {}
        for j, cell in enumerate(row):
            r = _role(cell)
            if r and r not in cols:
                cols[r] = j
        if "courseId" in cols and ("courseName" in cols or "chapterName" in cols):
            header = (i, cols)
            break
    if not header:
        return [], 0, ["No Course ID column found. The file needs a Course ID (or Course Code) column and a Course Name column."]
    at, c = header
    cell = lambda row, k: _text(row[c[k]]) if k in c and c[k] < len(row) else ""  # noqa: E731
    courses: dict[str, dict] = {}
    skipped = 0
    last_id = last_name = ""
    for row in rows[at + 1:]:
        cid, name = cell(row, "courseId").upper(), cell(row, "courseName")
        ch_no, ch_name = cell(row, "chapterNo"), cell(row, "chapterName")
        if not cid and (ch_no or ch_name) and last_id:
            cid, name = last_id, name or last_name  # chapter rows under a course row (merged / blank cells)
        if not cid:
            skipped += 1
            continue
        if len(cid) > 40:
            skipped += 1
            continue
        course = courses.setdefault(cid, {"id": cid, "name": "", "chapters": {}})
        course["name"] = course["name"] or name[:200]
        last_id, last_name = cid, course["name"]
        if ch_name or ch_no:
            m = re.search(r"\d+", ch_no)
            no = int(m.group()) if m else len(course["chapters"]) + 1
            while not m and no in course["chapters"]:
                no += 1
            if 1 <= no <= 999 and no not in course["chapters"]:
                course["chapters"][no] = (ch_name or f"Chapter {no}")[:300]
    out = []
    errors = []
    for c_ in courses.values():
        if not c_["name"]:
            errors.append(f"{c_['id']}: no course name in the file")
            c_["name"] = c_["id"]
        out.append({"id": c_["id"], "name": c_["name"], "chapters": [{"no": n, "name": t} for n, t in sorted(c_["chapters"].items())]})
    return out, skipped, errors


def _with_status(courses: list[dict]) -> list[dict]:
    ids = [c["id"] for c in courses]
    existing = {d["id"]: d for d in db.courses.find({"id": {"$in": ids}}, {"_id": 0})}
    have: dict[str, set] = {}
    for ch in db.chapters.find({"courseId": {"$in": ids}}, {"_id": 0, "courseId": 1, "no": 1}):
        have.setdefault(ch["courseId"], set()).add(ch["no"])
    out = []
    for c in courses:
        old = existing.get(c["id"])
        new_ch = [ch for ch in c["chapters"] if ch["no"] not in have.get(c["id"], set())]
        status = "new" if not old else ("newChapters" if new_ch else "exists")
        out.append({**c, "status": status, "existingName": (old or {}).get("name", ""), "newChapters": len(new_ch)})
    return out


@router.post("/preview")
async def preview(request: Request, name: str = Query(..., min_length=1, max_length=200), _: dict = Depends(master_roles)):
    """Reads the uploaded file (raw body) and lists its courses. Nothing is saved."""
    data = await request.body()
    try:
        rows = await run_in_threadpool(rows_from_upload, name, data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the file: {exc}") from exc
    courses, skipped, errors = read_courses(rows)
    if not courses:
        raise HTTPException(400, errors[0] if errors else "No courses found in the file.")
    listed = _with_status(courses)
    return {
        "file": name, "rowsRead": len(rows), "skippedRows": skipped, "errors": errors, "courses": listed,
        "newCourses": sum(c["status"] == "new" for c in listed), "chapters": sum(len(c["chapters"]) for c in listed),
    }


class ChapterRow(BaseModel):
    no: int = Field(ge=1, le=999)
    name: str = Field(min_length=1, max_length=300)


class CourseRow(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    chapters: list[ChapterRow] = Field(default_factory=list, max_length=999)


class AddIn(BaseModel):
    courses: list[CourseRow] = Field(min_length=1, max_length=5000)


@router.post("/add")
def add(body: AddIn, me: dict = Depends(master_roles)):
    """Adds the chosen courses (new ones) and the chapters they do not have yet."""
    now = datetime.now(timezone.utc).isoformat()
    added = chapters_added = 0
    for c in body.courses:
        cid, name = c.id.strip().upper(), c.name.strip()
        if not db.courses.find_one({"id": cid}):
            db.courses.insert_one({"id": cid, "name": name, "createdBy": me["userId"], "createdAt": now, "source": "Excel import"})
            added += 1
            db.db.course_requests.update_many(
                {"status": "Pending", "courseName": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                {"$set": {"status": "Added", "courseId": cid, "closedBy": me["name"], "closedAt": now}},
            )
        have = {ch["no"] for ch in db.chapters.find({"courseId": cid}, {"no": 1})}
        new = [{"courseId": cid, "no": ch.no, "name": ch.name.strip()} for ch in c.chapters if ch.no not in have]
        if new:
            db.chapters.insert_many(new)
            chapters_added += len(new)
    return {"coursesAdded": added, "chaptersAdded": chapters_added}
