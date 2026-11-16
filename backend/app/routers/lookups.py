import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import current_user, require_section
from .master import CourseIn  # same CourseMaster columns as Master › Course

router = APIRouter(prefix="/lookups", tags=["lookups"])
# Only Manager and Admin (Master or Admin menu ticked) add, rename or remove dropdown values.
# Faculty and staff only pick from the lists.
list_admin = require_section("master", "admin")

# Every list on Master › Dropdown Values, with the name shown there (and where it is used).
LIST_LABELS = {
    "colleges": "Colleges (College / OD, Seminar, Marketing, Travelling)",
    "departments": "Departments",
    "sections": "Sections",
    "yopOptions": "Year of passing",
    "classIn": "Class in (College / OD)",
    "sessionTypes": "Today's Session Type (Class)",
    "issueTypes": "Issue Type (Class issue faced)",
    "chapterTypes": "Chapter / Session Type",
    "materialTypes": "Material Type (Course Preparation)",
    "slMaterialTheory": "Material Type, Theory (Self Learning)",
    "slMaterialPractical": "Material Type, Lab / Practical (Self Learning)",
    "marketingTypes": "Marketing Type",
    "enquiryFormNos": "Enquiry Form No (Marketing)",
    "othersHeadings": "Others Heading",
    "travelModes": "Travel Mode",
    "softwareActivities": "Software Activity (old entries)",
    "productTypes": "Product Type (old entries)",
    "locations": "Location (old entries)",
}
CENTER = "Center"  # contact for issues in Center classes; colleges have their own


class ValueIn(BaseModel):
    value: str = Field(min_length=1, max_length=200)


class ListIn(BaseModel):
    values: list[str] = Field(max_length=500)


class ContactIn(BaseModel):
    place: str = Field(min_length=1, max_length=200)
    name: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=120, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str = Field(default="", max_length=40)


def _clean(values: list[str]) -> list[str]:
    out, seen = [], set()
    for v in values:
        v = re.sub(r"\s+", " ", str(v)).strip()[:200]
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def contacts() -> dict[str, dict]:
    return {c["_id"]: {k: c.get(k, "") for k in ("name", "email", "phone")} for c in db.db.place_contacts.find()}


@router.get("/lists")
def get_lists(_: dict = Depends(list_admin)):
    """Master › Dropdown Values: every list with its values, plus the issue contacts of Center and each college."""
    from ..seed import OPTION_LISTS  # noqa: PLC0415

    docs = {d["_id"]: d for d in db.lookups.find({"_id": {"$in": list(OPTION_LISTS)}})}
    kinds = [k for k in LIST_LABELS if k in OPTION_LISTS] + [k for k in OPTION_LISTS if k not in LIST_LABELS]
    return {
        "lists": [
            {"kind": k, "label": LIST_LABELS.get(k, k), "values": sorted((docs.get(k) or {}).get("values", []), key=natural_key),
             "updatedBy": (docs.get(k) or {}).get("updatedBy"), "updatedAt": (docs.get(k) or {}).get("updatedAt")}
            for k in kinds
        ],
        "contacts": contacts(),
        "center": CENTER,
    }


@router.put("/lists/{kind}")
def save_list(kind: str, body: ListIn, me: dict = Depends(list_admin)):
    """Replace a list's values (add, rename and remove in one save). Saved entries keep the text they had."""
    from ..seed import OPTION_LISTS  # noqa: PLC0415

    if kind not in OPTION_LISTS:
        raise HTTPException(400, "Unknown list")
    values = _clean(body.values)
    db.lookups.update_one({"_id": kind}, {"$set": {"values": values, "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return sorted(values, key=natural_key)


@router.put("/contacts")
def save_contact(body: ContactIn, me: dict = Depends(list_admin)):
    """Managing person of Center or a college: gets the issue alert email / WhatsApp with Ranjit."""
    place = body.place.strip()
    data = {k: v.strip() for k, v in body.model_dump(exclude={"place"}).items()}
    if not any(data.values()):
        db.db.place_contacts.delete_one({"_id": place})
    else:
        db.db.place_contacts.update_one({"_id": place}, {"$set": {**data, "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return contacts()




def natural_key(text) -> list:
    """Sort key: case-insensitive, with digit runs compared as numbers (Lab 2 before Lab 10)."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", str(text).lower())]


def faculty_list() -> list[dict]:
    cur = db.users.find({"role": "FACULTY", "active": True}, {"_id": 0, "code": 1, "name": 1, "department": 1, "designation": 1, "grade": 1})
    return sorted(cur, key=lambda f: natural_key(f["name"]))


@router.get("")
def get_lookups(_: dict = Depends(current_user)):
    from ..seed import OPTION_LISTS  # noqa: PLC0415

    # Every dropdown list is returned A to Z (case-insensitive, numbers in natural order).
    out = {d["_id"]: sorted(d["values"], key=natural_key) for d in db.lookups.find({"_id": {"$in": list(OPTION_LISTS)}})}
    out["faculties"] = faculty_list()
    out["employees"] = sorted(db.users.find({"active": True}, {"_id": 0, "userId": 1, "code": 1, "name": 1, "role": 1, "designation": 1}), key=lambda u: natural_key(u["name"]))
    # Batch, asset, register-number and vendor dropdowns come from the Master collections.
    out["batches"] = [b["batchNo"] for b in db.db.master_batches.find({}, {"batchNo": 1}).sort("batchNo")]
    # Batches with the employees they are assigned to; the Class tab offers each faculty their own.
    # Open batches, plus completed ones that started in the last 12 months.
    recent = (date.today() - timedelta(days=365)).isoformat()
    out["batchList"] = [
        {
            "batchNo": b["batchNo"], "courseId": b.get("courseId") or "", "status": b.get("status") or "",
            "startDate": b.get("startDate") or "", "endDate": b.get("endDate") or "", "shortName": b.get("facultyShort") or "",
            "faculty": [c for c in [b.get("facultyCode") or "", *re.split(r"[,\s]+", b.get("otherFaculty") or "")] if c],
        }
        for b in db.db.master_batches.find({"batchNo": {"$nin": [None, ""]}, "$or": [{"status": {"$ne": "Completed"}}, {"startDate": {"$gte": recent}}]}, {"_id": 0})
    ]
    out["courses"] = list(db.courses.find({}, {"_id": 0, "createdBy": 0, "createdAt": 0}).sort("id"))
    out["chapters"] = [{**c, "name": c.get("name") or c.get("details", "")} for c in db.chapters.find({}, {"_id": 0}).sort([("courseId", 1), ("no", 1)])]
    return out


@router.post("/courses", status_code=201)
def add_course(body: CourseIn, user: dict = Depends(list_admin)):
    """Manager / Admin can add a missing course from the entry form (faculty use Request new course).
    It goes into the same `courses` collection Master › Courses & Chapters uses."""
    cid = body.id.strip().upper()
    name = body.name.strip()
    if not cid or not name:
        raise HTTPException(422, "Enter the Course ID and course name")
    if db.courses.find_one({"id": cid}):
        raise HTTPException(409, f"Course {cid} already exists")
    if db.courses.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise HTTPException(409, f'A course named "{name}" already exists')
    doc = {"id": cid, **body.fields(), "createdBy": user["userId"], "createdAt": datetime.now(timezone.utc).isoformat()}
    db.courses.insert_one(doc)
    return {"id": cid, **body.fields()}


@router.post("/{kind}", status_code=201)
def add_value(kind: str, body: ValueIn, _: dict = Depends(list_admin)):
    from ..seed import OPTION_LISTS  # noqa: PLC0415

    if kind not in OPTION_LISTS:
        raise HTTPException(400, "Unknown list")
    value = body.value.strip()
    doc = db.lookups.find_one({"_id": kind}) or {"values": []}
    if any(v.lower() == value.lower() for v in doc["values"]):
        raise HTTPException(409, f'"{value}" already exists')
    db.lookups.update_one({"_id": kind}, {"$push": {"values": value}}, upsert=True)
    return value
