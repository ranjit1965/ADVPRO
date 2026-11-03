"""Master data maintained by the manager and admin: courses and their chapter / session details."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import require_roles

router = APIRouter(prefix="/master", tags=["master"])
master_roles = require_roles("MANAGER", "ADMIN")


class CourseIn(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9+#._-]{2,20}$")
    name: str = Field(min_length=1, max_length=120)


class ChapterIn(BaseModel):
    courseId: str
    no: int = Field(ge=1, le=999)
    type: str = Field(min_length=1)
    details: str = Field(min_length=1, max_length=300)


@router.post("/courses", status_code=201)
def add_course(body: CourseIn, me: dict = Depends(master_roles)):
    cid = body.id.upper()
    if db.courses.find_one({"id": cid}):
        raise HTTPException(409, "That Course ID already exists")
    db.courses.insert_one({"id": cid, "name": body.name.strip()})
    # Close any pending request for this course name (Course requests list on the same page).
    db.db.course_requests.update_many(
        {"status": "Pending", "courseName": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}},
        {"$set": {"status": "Added", "courseId": cid, "closedBy": me["name"], "closedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}},
    )
    return True


@router.put("/courses/{course_id}")
def update_course(course_id: str, body: CourseIn, _: dict = Depends(master_roles)):
    if not db.courses.update_one({"id": course_id}, {"$set": {"name": body.name.strip()}}).matched_count:
        raise HTTPException(404, "Course not found")
    return True


@router.delete("/courses/{course_id}")
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


@router.put("/chapters/{course_id}/{no}")
def update_chapter(course_id: str, no: int, body: ChapterIn, _: dict = Depends(master_roles)):
    if body.no != no and db.chapters.find_one({"courseId": course_id, "no": body.no}):
        raise HTTPException(409, f"Chapter {body.no} already exists for {course_id}")
    res = db.chapters.update_one({"courseId": course_id, "no": no}, {"$set": {**body.model_dump(), "courseId": course_id}})
    if not res.matched_count:
        raise HTTPException(404, "Chapter not found")
    return True


@router.delete("/chapters/{course_id}/{no}")
def delete_chapter(course_id: str, no: int, _: dict = Depends(master_roles)):
    db.chapters.delete_one({"courseId": course_id, "no": no})
    return True
