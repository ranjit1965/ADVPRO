"""HR › Halfyearly Program Report.

HR, Manager and Admin pick an employee or faculty and assign, for a quarter (H1 to H6) with its months:
  * 1 to 3 target certifications (from the course list), and
  * 1 to 3 delivery ready courses (from the course list).
Only HR, Manager and Admin update the status: achieved / completion date / certification code for each
target, and ready Yes / No for each delivery ready course. The employee sees their rows read-only.
"""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from .. import db
from ..schemas import Form
from ..security import current_user, require_roles
from .hr import HR_ROLES

router = APIRouter(prefix="/hr/halfyearly", tags=["halfyearly program report"])
hr_only = require_roles(*HR_ROLES)
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"
QUARTERS = ("H1", "H2", "H3", "H4", "H5", "H6")
col = db.db.halfyearly_reports


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(r: dict) -> dict:
    r.pop("_id", None)
    r.pop("period", None)  # Period was removed in v41
    return upgrade(r)


def upgrade(r: dict) -> dict:
    """Rows saved before v40 had one target certification and one delivery-ready answer."""
    if "targets" not in r:
        r["targets"] = [{
            "name": r.get("targetCertification", ""), "courseId": r.get("courseId") or "",
            "achieved": r.get("achieved"), "completionDate": r.get("completionDate"), "certificationCode": r.get("certificationCode"),
        }] if r.get("targetCertification") else []
    if "deliveries" not in r:
        r["deliveries"] = [{"name": r.get("targetCertification", ""), "courseId": r.get("courseId") or "", "ready": r.get("deliveryReady")}] if r.get("deliveryReady") else []
    return r


class CertIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    courseId: str = Field(default="", max_length=40)


class AssignIn(Form):
    employeeCode: str = Field(min_length=1, max_length=40)
    quarter: Literal[QUARTERS] | None = None  # type: ignore[valid-type]
    startMonth: str = Field(pattern=MONTH_RE)
    endMonth: str = Field(pattern=MONTH_RE)
    targets: list[CertIn] = Field(min_length=1, max_length=3)
    deliveries: list[CertIn] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def check(self):
        if self.endMonth < self.startMonth:
            raise ValueError("Ending month must be on or after the starting month")
        return self


class TargetStatus(Form):
    achieved: Literal["Yes", "No"] | None = None
    completionDate: date | None = None
    certificationCode: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def check(self):
        if self.achieved == "Yes" and not (self.completionDate and self.certificationCode):
            raise ValueError("Certification achieved needs the completion date and the certification code")
        if self.achieved != "Yes":
            self.completionDate, self.certificationCode = None, None
        return self


class DeliveryStatus(Form):
    ready: Literal["Yes", "No"] | None = None


class StatusIn(BaseModel):
    targets: list[TargetStatus] = Field(default_factory=list, max_length=3)
    deliveries: list[DeliveryStatus] = Field(default_factory=list, max_length=3)


def _employee(code: str) -> dict:
    u = db.users.find_one({"code": code}, {"code": 1, "name": 1, "role": 1})
    if not u:
        raise HTTPException(404, "Employee not found")
    return u


def _merge(new: list[CertIn], old: list[dict], status_keys: tuple[str, ...]) -> list[dict]:
    """New certification list; a certification that was already there keeps its status."""
    by_name = {(o.get("name") or "").lower(): o for o in old}
    out = []
    for c in new:
        prev = by_name.get(c.name.lower(), {})
        out.append({"name": c.name.strip(), "courseId": c.courseId, **{k: prev.get(k) for k in status_keys}})
    return out


TARGET_KEYS = ("achieved", "completionDate", "certificationCode")
DELIVERY_KEYS = ("ready",)


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
        **body.model_dump(exclude={"targets", "deliveries"}),
        "id": f"HY-{db.next_seq('halfyearly'):04d}",
        "employeeName": u["name"],
        "targets": _merge(body.targets, [], TARGET_KEYS),
        "deliveries": _merge(body.deliveries, [], DELIVERY_KEYS),
        "assignedBy": me["name"],
        "createdAt": now(),
        "updatedAt": now(),
    }
    col.insert_one(doc)
    return _clean(doc)


@router.put("/{rid}")
def update_assignment(rid: str, body: AssignIn, me: dict = Depends(hr_only)):
    row = col.find_one({"id": rid})
    if not row:
        raise HTTPException(404, "Report row not found")
    row = upgrade(row)
    u = _employee(body.employeeCode)
    patch = {
        **body.model_dump(exclude={"targets", "deliveries"}),
        "employeeName": u["name"],
        "targets": _merge(body.targets, row["targets"], TARGET_KEYS),
        "deliveries": _merge(body.deliveries, row["deliveries"], DELIVERY_KEYS),
        "assignedBy": me["name"],
        "updatedAt": now(),
    }
    res = col.find_one_and_update({"id": rid}, {"$set": patch}, return_document=True)
    return _clean(res)


@router.put("/{rid}/status")
def update_status(rid: str, body: StatusIn, me: dict = Depends(hr_only)):
    """Only HR, Manager and Admin record achieved / code / delivery ready; faculty see it read-only."""
    row = col.find_one({"id": rid})
    if not row:
        raise HTTPException(404, "Report row not found")
    row = upgrade(row)
    targets = [{**t, **(body.targets[i].model_dump(mode="json") if i < len(body.targets) else {})} for i, t in enumerate(row["targets"])]
    deliveries = [{**d, **(body.deliveries[i].model_dump(mode="json") if i < len(body.deliveries) else {})} for i, d in enumerate(row["deliveries"])]
    res = col.find_one_and_update({"id": rid}, {"$set": {"targets": targets, "deliveries": deliveries, "statusBy": me["name"], "updatedAt": now()}}, return_document=True)
    return _clean(res)


@router.delete("/{rid}")
def delete(rid: str, _: dict = Depends(hr_only)):
    if not col.delete_one({"id": rid}).deleted_count:
        raise HTTPException(404, "Report row not found")
    return True
