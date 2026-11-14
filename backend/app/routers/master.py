"""Master data maintained by the manager and admin: courses and their chapter / session details."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .. import db
from ..security import require_section, require_roles

router = APIRouter(prefix="/master", tags=["master"])
master_roles = require_section("master", "admin")  # Master or Admin menu ticked for the role


class CourseIn(BaseModel):
    """A course saves only Course ID and Course Name."""
    id: str = Field(min_length=1, max_length=40)  # any letters, digits or symbols (ADCH&N, C++, ...)
    name: str = Field(min_length=1, max_length=200)

    @field_validator("id", "name")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Required")
        return v

    def fields(self) -> dict:
        return {"name": self.name}


# Fields older versions saved on a course / chapter; removed when the record is next saved.
OLD_COURSE_FIELDS = {k: "" for k in ("instalmentAmt", "lumpsumAmt", "status", "totalHrs", "insAmt", "lumpAmt", "courseStatus")}
OLD_CHAPTER_FIELDS = {"type": "", "details": ""}


class ChapterIn(BaseModel):
    """A chapter saves only Chapter No and Chapter Name."""
    courseId: str
    no: int = Field(ge=1, le=999)
    name: str = Field(min_length=1, max_length=300)

    @field_validator("name")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Enter the chapter name")
        return v


@router.post("/courses", status_code=201)
def add_course(body: CourseIn, me: dict = Depends(master_roles)):
    cid = body.id.strip().upper()
    if not cid:
        raise HTTPException(422, "Enter the Course ID")
    if db.courses.find_one({"id": cid}):
        raise HTTPException(409, "That Course ID already exists")
    db.courses.insert_one({"id": cid, **body.fields(), "createdBy": me["userId"], "createdAt": datetime.now(timezone.utc).isoformat()})
    # Close any pending request for this course name (Course requests list on the same page).
    db.db.course_requests.update_many(
        {"status": "Pending", "courseName": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}},
        {"$set": {"status": "Added", "courseId": cid, "closedBy": me["name"], "closedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}},
    )
    return True


@router.put("/courses/{course_id:path}")
def update_course(course_id: str, body: CourseIn, _: dict = Depends(master_roles)):
    if not db.courses.update_one({"id": course_id}, {"$set": body.fields(), "$unset": OLD_COURSE_FIELDS}).matched_count:
        raise HTTPException(404, "Course not found")
    return True


@router.delete("/courses/{course_id:path}")
def delete_course(course_id: str, _: dict = Depends(master_roles)):
    db.courses.delete_one({"id": course_id})
    db.chapters.delete_many({"courseId": course_id})
    return True


def _check_course(course_id: str) -> None:
    if not db.courses.find_one({"id": course_id}):
        raise HTTPException(400, "Unknown course")


@router.post("/chapters", status_code=201)
def add_chapter(body: ChapterIn, _: dict = Depends(master_roles)):
    _check_course(body.courseId)
    if db.chapters.find_one({"courseId": body.courseId, "no": body.no}):
        raise HTTPException(409, f"Chapter {body.no} already exists for {body.courseId}")
    db.chapters.insert_one(body.model_dump())
    return True


@router.put("/chapters/{course_id:path}/{no}")
def update_chapter(course_id: str, no: int, body: ChapterIn, _: dict = Depends(master_roles)):
    if body.no != no and db.chapters.find_one({"courseId": course_id, "no": body.no}):
        raise HTTPException(409, f"Chapter {body.no} already exists for {course_id}")
    res = db.chapters.update_one({"courseId": course_id, "no": no}, {"$set": {**body.model_dump(), "courseId": course_id}, "$unset": OLD_CHAPTER_FIELDS})
    if not res.matched_count:
        raise HTTPException(404, "Chapter not found")
    return True


@router.delete("/chapters/{course_id:path}/{no}")
def delete_chapter(course_id: str, no: int, _: dict = Depends(master_roles)):
    db.chapters.delete_one({"courseId": course_id, "no": no})
    return True
