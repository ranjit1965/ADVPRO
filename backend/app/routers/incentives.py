"""MIS › Incentive › Incentive Amount (v62).

MIS, HR, Admin and the Super Admin add, for a month, one row per faculty or lab support person:
No of students, No of referrals, No of goto next certifications, Exam completed before 45 days (numbers),
Amount, and Green Batch. Green Batch opens only when No of students == Exam completed before 45 days (and is
not 0); it starts at the fixed Green Batch value (settings `incentive.greenBatchValue`). Otherwise only the
Amount can be changed. Stored in `incentives` ({id "INC-0001", month, facultyCode, ...}).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from .. import db
from ..security import require_roles

router = APIRouter(prefix="/incentives", tags=["incentive"])
inc_roles = require_roles("MIS", "HR", "ADMIN", "MANAGER")
col = db.db.incentives
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"
NUMBERS = ("students", "referrals", "nextCertifications", "examBefore45")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def green_open(r) -> bool:
    """Green Batch can be entered only when every student completed the exam before 45 days."""
    return (r.get("students") or 0) > 0 and r.get("students") == r.get("examBefore45")


class IncentiveIn(BaseModel):
    month: str = Field(pattern=MONTH)
    facultyCode: str = Field(min_length=1, max_length=40)
    students: int = Field(default=0, ge=0, le=100000)
    referrals: int = Field(default=0, ge=0, le=100000)
    nextCertifications: int = Field(default=0, ge=0, le=100000)
    examBefore45: int = Field(default=0, ge=0, le=100000)
    amount: int = Field(default=0, ge=0, le=10_000_000)
    greenBatch: int = Field(default=0, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def check(self):
        if self.examBefore45 > self.students:
            raise ValueError("Exam completed before 45 days cannot be more than No of students")
        if self.greenBatch and not green_open(self.model_dump()):
            raise ValueError("Green Batch opens only when No of students = Exam completed before 45 days")
        return self


class SettingsIn(BaseModel):
    greenBatchValue: int = Field(ge=0, le=10_000_000)


def settings_doc() -> dict:
    d = db.db.settings.find_one({"_id": "incentive"}) or {}
    return {"greenBatchValue": d.get("greenBatchValue", 0), "updatedBy": d.get("updatedBy"), "updatedAt": d.get("updatedAt")}


def view(r: dict) -> dict:
    r = {k: v for k, v in r.items() if k != "_id"}
    r["greenOpen"] = green_open(r)
    r["total"] = (r.get("amount") or 0) + (r.get("greenBatch") or 0)
    return r


def _person(code: str) -> dict:
    u = db.users.find_one({"code": code}, {"code": 1, "name": 1, "role": 1})
    if not u:
        raise HTTPException(404, "Faculty not found")
    return u


@router.get("/settings")
def get_settings(_: dict = Depends(inc_roles)):
    return settings_doc()


@router.put("/settings")
def save_settings(body: SettingsIn, me: dict = Depends(require_roles("MIS", "ADMIN", "MANAGER"))):
    db.db.settings.update_one({"_id": "incentive"}, {"$set": {"greenBatchValue": body.greenBatchValue, "updatedBy": me["name"], "updatedAt": now()}}, upsert=True)
    return settings_doc()


@router.get("")
def list_incentives(month: str = Query(..., pattern=MONTH), _: dict = Depends(inc_roles)):
    return [view(r) for r in col.find({"month": month}).sort("facultyName", 1)]


@router.post("", status_code=201)
def add(body: IncentiveIn, me: dict = Depends(inc_roles)):
    u = _person(body.facultyCode)
    if col.find_one({"month": body.month, "facultyCode": body.facultyCode}):
        raise HTTPException(409, f"{u['name']} already has an incentive row for this month: edit it")
    doc = {**body.model_dump(), "id": f"INC-{db.next_seq('incentives'):04d}", "facultyName": u["name"], "createdBy": me["name"], "createdAt": now()}
    col.insert_one(doc)
    return view(doc)


@router.put("/{rid}")
def edit(rid: str, body: IncentiveIn, me: dict = Depends(inc_roles)):
    u = _person(body.facultyCode)
    other = col.find_one({"month": body.month, "facultyCode": body.facultyCode, "id": {"$ne": rid}})
    if other:
        raise HTTPException(409, f"{u['name']} already has an incentive row for this month")
    res = col.find_one_and_update({"id": rid}, {"$set": {**body.model_dump(), "facultyName": u["name"], "updatedBy": me["name"], "updatedAt": now()}}, return_document=True)
    if not res:
        raise HTTPException(404, "Incentive row not found")
    return view(res)


@router.delete("/{rid}")
def delete(rid: str, _: dict = Depends(require_roles("MIS", "ADMIN", "MANAGER"))):
    if not col.delete_one({"id": rid}).deleted_count:
        raise HTTPException(404, "Incentive row not found")
    return True
