from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..schemas import Form
from ..security import current_user, require_roles

router = APIRouter(tags=["marks, notifications"])  # Monthly Plan was removed in v48


class MarksIn(BaseModel):
    batchNo: str
    courseId: str
    examType: str
    rows: list[dict[str, Any]]


@router.get("/student-marks")
def get_marks(batchNo: str, courseId: str, examType: str, _: dict = Depends(current_user)):
    saved = (db.marks.find_one({"batchNo": batchNo, "courseId": courseId, "examType": examType}) or {}).get("marks", {})
    # Master › Registration was removed (v46): only students whose marks were saved before are listed.
    students = [{"regNo": reg, "name": ""} for reg in sorted(saved)]
    return [{**s, "marks": saved.get(s["regNo"], ""), "absent": saved.get(s["regNo"]) == "AB"} for s in students]


@router.post("/student-marks")
def save_marks(body: MarksIn, _: dict = Depends(current_user)):
    marks = {r["regNo"]: "AB" if r.get("absent") else r.get("marks", "") for r in body.rows}
    db.marks.update_one({"batchNo": body.batchNo, "courseId": body.courseId, "examType": body.examType}, {"$set": {"marks": marks}}, upsert=True)
    return True


@router.get("/notifications")
def notifications(_: dict = Depends(current_user)):
    return list(db.notifications.find({}, {"_id": 0}).sort("id", -1))
