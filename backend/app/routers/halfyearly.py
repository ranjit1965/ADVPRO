"""HR › Halfyearly Program Report.

HR, Manager and Admin assign each employee or faculty a target certification (typed by hand or picked
from the course list) with a starting and ending month. The employee then fills in, on the same row,
whether the certification was achieved (with completion date and certification code) and whether
the course delivery is ready.
"""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, model_validator

from .. import db
from ..schemas import Form
from ..security import current_user, require_roles
from .hr import HR_ROLES

router = APIRouter(prefix="/hr/halfyearly", tags=["halfyearly program report"])
hr_only = require_roles(*HR_ROLES)
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"
col = db.db.halfyearly_reports


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(r: dict) -> dict:
    r.pop("_id", None)
    return r


class AssignIn(Form):
    employeeCode: str = Field(min_length=1, max_length=40)
    startMonth: str = Field(pattern=MONTH_RE)
    endMonth: str = Field(pattern=MONTH_RE)
    targetCertification: str = Field(min_length=1, max_length=200)
    courseId: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def check(self):
        if self.endMonth < self.startMonth:
            raise ValueError("Ending month must be on or after the starting month")
        return self


class StatusIn(Form):
    achieved: Literal["Yes", "No"] | None = None
    completionDate: date | None = None
    certificationCode: str | None = Field(default=None, max_length=80)
    deliveryReady: Literal["Yes", "No"] | None = None

    @model_validator(mode="after")
    def check(self):
        if self.achieved == "Yes" and not (self.completionDate and self.certificationCode):
            raise ValueError("Certification achieved needs the completion date and the certification code")
        if self.achieved != "Yes":
            self.completionDate, self.certificationCode = None, None
        return self


def _employee(code: str) -> dict:
    u = db.users.find_one({"code": code}, {"code": 1, "name": 1, "role": 1})
    if not u:
        raise HTTPException(404, "Employee not found")
    return u


@router.get("")
def list_reports(employeeCode: str | None = None, me: dict = Depends(current_user)):
    if me["role"] not in HR_ROLES:
        employeeCode = me["code"]  # employees and faculty see only their own rows
    q = {"employeeCode": employeeCode} if employeeCode else {}
    return [_clean(r) for r in col.find(q).sort([("startMonth", -1), ("employeeName", 1)])]


@router.post("", status_code=201)
def assign(body: AssignIn, me: dict = Depends(hr_only)):
    u = _employee(body.employeeCode)
    doc = {
        **body.model_dump(),
        "id": f"HY-{db.next_seq('halfyearly'):04d}",
        "employeeName": u["name"],
        "achieved": None,
        "completionDate": None,
        "certificationCode": None,
        "deliveryReady": None,
        "assignedBy": me["name"],
        "createdAt": now(),
        "updatedAt": now(),
    }
    col.insert_one(doc)
    return _clean(doc)


@router.put("/{rid}")
def update_assignment(rid: str, body: AssignIn, me: dict = Depends(hr_only)):
    u = _employee(body.employeeCode)
    res = col.find_one_and_update(
        {"id": rid},
        {"$set": {**body.model_dump(), "employeeName": u["name"], "assignedBy": me["name"], "updatedAt": now()}},
        return_document=True,
    )
    if not res:
        raise HTTPException(404, "Report row not found")
    return _clean(res)


@router.put("/{rid}/status")
def update_status(rid: str, body: StatusIn, me: dict = Depends(current_user)):
    row = col.find_one({"id": rid})
    if not row:
        raise HTTPException(404, "Report row not found")
    if row["employeeCode"] != me["code"] and me["role"] not in HR_ROLES:
        raise HTTPException(403, "You can only update your own certification")
    patch = body.model_dump(mode="json")
    res = col.find_one_and_update({"id": rid}, {"$set": {**patch, "statusBy": me["name"], "updatedAt": now()}}, return_document=True)
    return _clean(res)


@router.delete("/{rid}")
def delete(rid: str, _: dict = Depends(hr_only)):
    if not col.delete_one({"id": rid}).deleted_count:
        raise HTTPException(404, "Report row not found")
    return True
