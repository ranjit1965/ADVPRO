import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import current_user
from .master import CourseIn  # same CourseMaster columns as Master › Course

router = APIRouter(prefix="/lookups", tags=["lookups"])
EDITABLE = {"colleges", "departments", "othersHeadings", "travelModes", "sessionTypes", "slMaterialTheory", "slMaterialPractical"}  # any logged-in user can add


class ValueIn(BaseModel):
    value: str = Field(min_length=1, max_length=200)




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
    out["advproNos"] = [a["advproNo"] for a in db.db.master_assets.find({}, {"advproNo": 1}).sort("advproNo")]
    out["registerNos"] = [r["regNo"] for r in db.db.master_registrations.find({}, {"regNo": 1}).sort("regNo")]
    out["vendors"] = [v["vendorName"] for v in db.db.master_vendors.find({}, {"vendorName": 1}).sort("vendorName")]
    out["courses"] = list(db.courses.find({}, {"_id": 0, "createdBy": 0, "createdAt": 0}).sort("id"))
    out["chapters"] = list(db.chapters.find({}, {"_id": 0}).sort([("courseId", 1), ("no", 1)]))
    return out


@router.post("/courses", status_code=201)
def add_course(body: CourseIn, user: dict = Depends(current_user)):
    """Any signed-in user can add a missing course from the entry form (Learning tab).
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
def add_value(kind: str, body: ValueIn, _: dict = Depends(current_user)):
    if kind not in EDITABLE:
        raise HTTPException(400, "Unknown list")
    value = body.value.strip()
    doc = db.lookups.find_one({"_id": kind}) or {"values": []}
    if any(v.lower() == value.lower() for v in doc["values"]):
        raise HTTPException(409, f'"{value}" already exists')
    db.lookups.update_one({"_id": kind}, {"$push": {"values": value}}, upsert=True)
    return value
