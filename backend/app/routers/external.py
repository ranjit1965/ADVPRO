"""External Faculty (v60): bank details, external certifications and the monthly / quarterly report.

* The External Faculty records stay in Master (`master_externalFaculty`, masters.json).
* Bank details are kept apart in `external_faculty_bank` ({_id: faculty id, bankName, accountNo, holderName,
  branch, ifsc, pan, aadhaar}); only HR, Admin and the Super Admin read or change them.
* External certifications: `external_certifications` ({id "EXC-0001", facultyId, certificationId, name,
  provider, status Current / Non-current, issueDate, expiryDate, notes}). Every field but the faculty is optional.
* Report: the batches of the external faculty in a year (Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec; any
  quarters ticked, none = the whole year), for one faculty or all, with "batches" only or the "whole" record
  (faculty details and their current / non-current certifications too).
HR, MIS, Admin and the Super Admin open these pages.
"""
import re
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, model_validator

from .. import batch_status, db
from ..schemas import Form
from ..security import require_roles

router = APIRouter(prefix="/external", tags=["external faculty"])
ext_roles = require_roles("HR", "MIS", "ADMIN", "MANAGER")
bank_roles = require_roles("HR", "ADMIN", "MANAGER")  # bank details: not MIS
delete_roles = require_roles("ADMIN", "MANAGER")
faculty = db.db.master_externalFaculty
bank = db.db.external_faculty_bank
certs = db.db.external_certifications
QUARTERS = {"Q1": ("01-01", "03-31"), "Q2": ("04-01", "06-30"), "Q3": ("07-01", "09-30"), "Q4": ("10-01", "12-31")}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _faculty(fid: str) -> dict:
    f = faculty.find_one({"id": fid}, {"_id": 0})
    if not f:
        raise HTTPException(404, "External faculty not found")
    return f


# ---------------------------------------------------------------- bank details

class BankIn(Form):
    bankName: str = Field(default="", max_length=120)
    accountNo: str = Field(default="", pattern=r"^\d{0,20}$")
    holderName: str = Field(default="", max_length=120)
    branch: str = Field(default="", max_length=120)
    ifsc: str = Field(default="", pattern=r"^([A-Za-z]{4}0[A-Za-z0-9]{6})?$")
    pan: str = Field(default="", pattern=r"^([A-Za-z]{5}\d{4}[A-Za-z])?$")
    aadhaar: str = Field(default="", pattern=r"^(\d{12})?$")  # optional

    @model_validator(mode="before")
    @classmethod
    def tidy(cls, v):
        if isinstance(v, dict):
            v = {k: (re.sub(r"\s+", "", x) if k in ("accountNo", "aadhaar", "pan", "ifsc") else x.strip()) if isinstance(x, str) else ("" if x is None else x) for k, x in v.items()}
            for k in ("pan", "ifsc"):
                if v.get(k):
                    v[k] = v[k].upper()
        return v


@router.get("/bank/{fid}")
def get_bank(fid: str, _: dict = Depends(bank_roles)):
    _faculty(fid)
    d = bank.find_one({"_id": fid}) or {}
    d.pop("_id", None)
    return {"facultyId": fid, **{k: d.get(k, "") for k in BankIn.model_fields}, "updatedBy": d.get("updatedBy"), "updatedAt": d.get("updatedAt")}


@router.put("/bank/{fid}")
def save_bank(fid: str, body: BankIn, me: dict = Depends(bank_roles)):
    _faculty(fid)
    data = body.model_dump()
    if not any(data.values()):
        bank.delete_one({"_id": fid})
    else:
        bank.update_one({"_id": fid}, {"$set": {**data, "updatedBy": me["name"], "updatedAt": now()}}, upsert=True)
    return get_bank(fid, me)


# ---------------------------------------------------------------- external certifications

class CertIn(Form):
    facultyId: str = Field(min_length=1, max_length=40)
    certificationId: str = Field(default="", max_length=80)
    name: str = Field(default="", max_length=200)
    provider: str = Field(default="", max_length=120)
    status: Literal["Current", "Non-current", ""] = ""
    issueDate: date | None = None
    expiryDate: date | None = None
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def check(self):
        if self.issueDate and self.expiryDate and self.expiryDate < self.issueDate:
            raise ValueError("Expiry date must be after the issue date")
        return self


def cert_view(c: dict, today: date | None = None) -> dict:
    """Status as saved; when it was left empty, Current until the expiry date passes."""
    c = {k: v for k, v in c.items() if k != "_id"}
    if not c.get("status"):
        today = today or date.today()
        c["status"] = "Non-current" if c.get("expiryDate") and c["expiryDate"] < today.isoformat() else "Current"
        c["statusAuto"] = True
    return c


@router.get("/certifications")
def list_certs(facultyId: str | None = None, status: str | None = None, _: dict = Depends(ext_roles)):
    names = {f["id"]: f.get("name", "") for f in faculty.find({}, {"_id": 0, "id": 1, "name": 1})}
    out = [{**cert_view(c), "facultyName": names.get(c.get("facultyId"), c.get("facultyId"))} for c in certs.find({"facultyId": facultyId} if facultyId else {})]
    if status:
        out = [c for c in out if c["status"] == status]
    return sorted(out, key=lambda c: (c["facultyName"].lower(), c.get("name", "").lower()))


@router.post("/certifications", status_code=201)
def add_cert(body: CertIn, me: dict = Depends(ext_roles)):
    _faculty(body.facultyId)
    doc = {**body.model_dump(mode="json"), "id": f"EXC-{db.next_seq('external_certifications'):04d}", "createdBy": me["name"], "createdAt": now()}
    certs.insert_one(doc)
    return cert_view(doc)


@router.put("/certifications/{cid}")
def edit_cert(cid: str, body: CertIn, me: dict = Depends(ext_roles)):
    _faculty(body.facultyId)
    res = certs.find_one_and_update({"id": cid}, {"$set": {**body.model_dump(mode="json"), "updatedBy": me["name"], "updatedAt": now()}}, return_document=True)
    if not res:
        raise HTTPException(404, "Certification not found")
    return cert_view(res)


@router.delete("/certifications/{cid}")
def delete_cert(cid: str, _: dict = Depends(delete_roles)):
    if not certs.delete_one({"id": cid}).deleted_count:
        raise HTTPException(404, "Certification not found")
    return True


def remove_faculty_data(ids: list[str]) -> None:
    """Called when external faculty records are deleted: their bank details and certifications go too."""
    bank.delete_many({"_id": {"$in": ids}})
    certs.delete_many({"facultyId": {"$in": ids}})


# ---------------------------------------------------------------- report

@router.get("/report")
def report(
    year: int = Query(..., ge=2000, le=2100),
    quarters: str = Query("", pattern=r"^(Q[1-4](,Q[1-4])*)?$"),
    facultyId: str | None = None,
    scope: Literal["batches", "whole"] = "batches",
    _: dict = Depends(ext_roles),
):
    batch_status.auto_complete()
    picked = sorted(set(quarters.split(","))) if quarters else []
    ranges = [(f"{year}-{QUARTERS[q][0]}", f"{year}-{QUARTERS[q][1]}") for q in (picked or list(QUARTERS))]
    fq: dict = {"id": facultyId} if facultyId else {}
    facs = {f["id"]: f for f in faculty.find(fq, {"_id": 0})}
    courses = {c["id"]: c.get("name", "") for c in db.courses.find({}, {"_id": 0, "id": 1, "name": 1})}
    bq: dict = {"externalFacultyId": {"$in": list(facs)}, "$or": [
        {"startDate": {"$lte": b}, "$or": [{"endDate": {"$gte": a}}, {"endDate": {"$in": [None, ""]}}]} for a, b in ranges
    ]}
    by: dict[str, list] = {}
    for b in db.db.master_batches.find(bq, {"_id": 0}).sort([("startDate", 1), ("batchNo", 1)]):
        qs = [q for q in (picked or list(QUARTERS)) if b.get("startDate", "") <= f"{year}-{QUARTERS[q][1]}" and (not b.get("endDate") or b["endDate"] >= f"{year}-{QUARTERS[q][0]}")]
        by.setdefault(b["externalFacultyId"], []).append({
            "batchNo": b.get("batchNo", ""), "courseId": b.get("courseId", ""), "courseName": courses.get(b.get("courseId", ""), ""),
            "startDate": b.get("startDate", ""), "endDate": b.get("endDate", ""), "status": b.get("status", ""), "quarters": qs,
        })
    cert_by: dict[str, list] = {}
    if scope == "whole":
        for c in certs.find({"facultyId": {"$in": list(facs)}}):
            cert_by.setdefault(c["facultyId"], []).append(cert_view(c))
    out = []
    for fid, f in facs.items():
        if scope == "batches" and not by.get(fid):
            continue
        out.append({
            "facultyId": fid, "name": f.get("name", ""), "phone": f.get("phone", ""), "email": f.get("email", ""),
            "certificationId": f.get("certificationId", ""), "courseName": f.get("courseName", ""), "status": f.get("status", ""),
            "batches": by.get(fid, []), "certifications": cert_by.get(fid, []) if scope == "whole" else [],
        })
    out.sort(key=lambda r: r["name"].lower())
    return {"year": year, "quarters": picked, "scope": scope, "faculties": out,
            "batchCount": sum(len(r["batches"]) for r in out)}
