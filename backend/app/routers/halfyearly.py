"""HR › Halfyearly Program Report.

HR, Super Admin and Admin pick an employee or faculty and assign, for a quarter (H1 to H6) with its months:
  * 1 to 3 target certifications (from the course list), and
  * 1 to 3 delivery ready courses (from the course list).
Only HR, Super Admin and Admin update the status: achieved / completion date / certification code for each
target, and ready Yes / No for each delivery ready course. The employee sees their rows read-only.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from .. import cert_followup, db
from ..schemas import Form
from ..security import manage_access, is_super_admin, require_section, current_user, require_roles
HALFYEARLY_ROLES = ("HR", "MANAGER", "ADMIN")  # v60: not MIS

router = APIRouter(prefix="/hr/halfyearly", tags=["halfyearly program report"])
hr_only = require_section("hr", roles=("HR", "ADMIN"))
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"
QUARTERS = ("H1", "H2", "H3", "H4", "H5", "H6")
col = db.db.halfyearly_reports


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(r: dict) -> dict:
    r.pop("_id", None)
    r.pop("period", None)  # Period was removed in v41
    r = upgrade(r)
    # v58: the row shows "Carried forward" only while it holds a carried certification (not because it was
    # once made by the carry over and HR then changed its certifications).
    r["carriedForward"] = any(t.get("carriedForward") for t in r.get("targets", []))
    return r


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


def _add_months(d: date, n: int) -> date:
    import calendar  # noqa: PLC0415
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


class AssignIn(Form):
    employeeCode: str = Field(min_length=1, max_length=40)
    joiningDate: date | None = None  # v60: also saved on the employee record
    quarter: Literal[QUARTERS] | None = None  # type: ignore[valid-type]
    # v52: HR picks full dates (starting date and ending date). The months are kept for the quarter logic
    # (carry over, running quarter); rows saved before v52 have only the months.
    startDate: date | None = None
    endDate: date | None = None
    startMonth: str | None = Field(default=None, pattern=MONTH_RE)
    endMonth: str | None = Field(default=None, pattern=MONTH_RE)
    targets: list[CertIn] = Field(min_length=1, max_length=3)
    deliveries: list[CertIn] = Field(default_factory=list, max_length=3)  # optional since v55

    @model_validator(mode="after")
    def check(self):
        if self.startDate and not self.endDate:  # v60: commitment period is 6 months from the start date
            self.endDate = _add_months(self.startDate, 6) - timedelta(days=1)
        if self.startDate:
            self.startMonth = self.startDate.isoformat()[:7]
        if self.endDate:
            self.endMonth = self.endDate.isoformat()[:7]
        if not self.startMonth or not self.endMonth:
            raise ValueError("Choose the starting date and the ending date")
        if self.startDate and self.endDate and self.endDate < self.startDate:
            raise ValueError("Ending date must be on or after the starting date")
        if self.endMonth < self.startMonth:
            raise ValueError("Ending month must be on or after the starting month")
        return self


def results() -> list[str]:
    """Completed? values (v60): Admin › Dropdown Values › certificationResults; "Yes" is fixed."""
    vals = (db.lookups.find_one({"_id": "certificationResults"}) or {}).get("values") or ["Yes", "No", "Fail", "No-Deferred"]
    return vals if "Yes" in vals else ["Yes", *vals]


class TargetStatus(Form):
    achieved: str | None = Field(default=None, max_length=60)  # v60: Yes / No / Fail / No-Deferred (dropdown values)
    completionDate: date | None = None
    certificationCode: str | None = Field(default=None, max_length=80)  # shown as "Certification ID" (v60)
    expiryDate: date | None = None  # v60: certification expiry date

    @model_validator(mode="after")
    def check(self):
        if self.achieved:
            match = next((v for v in results() if v.lower() == self.achieved.lower()), None)
            if not match:
                raise ValueError(f"Completed must be one of: {', '.join(results())}")
            self.achieved = match
        if self.achieved == "Yes" and not (self.completionDate and self.certificationCode):
            raise ValueError("Certification completed needs the completion date and the certification ID")
        if self.achieved != "Yes":
            self.completionDate, self.certificationCode, self.expiryDate = None, None, None
        if self.expiryDate and self.completionDate and self.expiryDate < self.completionDate:
            raise ValueError("Expiry date must be after the completion date")
        return self


class DeliveryStatus(Form):
    ready: Literal["Yes", "No"] | None = None


class TemplateIn(BaseModel):
    subject: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=10000)


class SendIn(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=5000)


class StatusIn(BaseModel):
    targets: list[TargetStatus] = Field(default_factory=list, max_length=3)
    deliveries: list[DeliveryStatus] = Field(default_factory=list, max_length=3)


def _save_joining(code: str, joining: date | None) -> None:
    if joining:
        db.users.update_one({"code": code}, {"$set": {"joiningDate": joining.isoformat()}})


def _employee(code: str) -> dict:
    u = db.users.find_one({"code": code}, {"code": 1, "name": 1, "role": 1, "joiningDate": 1})
    if not u:
        raise HTTPException(404, "Employee not found")
    return u


def _merge(new: list[CertIn], old: list[dict], status_keys: tuple[str, ...]) -> list[dict]:
    """New certification list; a certification that was already there keeps its status."""
    by_name = {(o.get("name") or "").lower(): o for o in old}
    out = []
    for c in new:
        prev = by_name.get(c.name.lower(), {})
        out.append({"name": c.name.strip(), "courseId": c.courseId, **{k: prev.get(k) for k in status_keys}, **{k: prev[k] for k in CARRY_KEYS if k in prev}})
    return out


TARGET_KEYS = ("achieved", "completionDate", "certificationCode", "expiryDate")
CARRY_KEYS = ("carriedForward", "carriedFrom", "carriedFromQuarter", "carriedTo")  # kept when HR edits the row
DELIVERY_KEYS = ("ready",)


@router.get("")
def list_reports(employeeCode: str | None = None, me: dict = Depends(current_user)):
    cert_followup.carry_over(by=me["name"])  # unfinished targets of an ended quarter show in the next one at once
    cert_followup.undo_completed_carries()  # completed later in their own quarter: not carried any more
    if me["role"] not in HALFYEARLY_ROLES:
        employeeCode = me["code"]  # employees and faculty see only their own rows
    q = {"employeeCode": employeeCode} if employeeCode else {}
    return [_clean(r) for r in col.find(q).sort([("startMonth", -1), ("employeeName", 1)])]


# ---------------------------------------------------------------- HR › Certification Status: carry over + emails

SAMPLE = {"id": "HY-0000", "employeeCode": "ABC", "quarter": "H1", "startMonth": "2026-01", "endMonth": "2026-06",
          "targets": [{"name": "Sample certification", "courseId": "C101", "achieved": "Yes", "completionDate": "2026-05-10", "certificationCode": "CERT-123"}]}


def _followup(me: dict | None = None) -> dict:
    cfg = cert_followup.get_settings(me)
    samples = {}
    for kind in cert_followup.KINDS:
        subject, text = cert_followup.compose(kind, SAMPLE, "<Faculty name>", cfg["hrEmail"], SAMPLE["targets"])
        samples[kind] = {"subject": subject, "text": text}
    return {**cfg, "samples": samples, "pending": {k: cert_followup.preview(k) for k in cert_followup.KINDS},
            "running": cert_followup.running_not_completed(), "checkedAt": cert_followup.now()}


@router.get("/followup")
def followup_settings(me: dict = Depends(hr_only)):
    """HR mail and Super Admin mail (from the employee records), both email templates with a sample, and who is waiting for each email."""
    cert_followup.carry_over(by=me["name"])
    return _followup(me)


@router.put("/followup/templates/{kind}")
def save_template(kind: Literal["deferred", "completed"], body: TemplateIn, me: dict = Depends(hr_only)):
    """HR edits the Deferred Report or Certification Completed email at any time."""
    cert_followup.save_template(kind, body.subject, body.body, me["name"])
    return _followup(me)


@router.post("/followup/send/{kind}")
def send_mails(kind: Literal["deferred", "completed"], body: SendIn | None = None, me: dict = Depends(hr_only)):
    """Sent only when HR clicks Send: to everyone waiting for this email, or only the rows in `ids`."""
    res = cert_followup.send(kind, me["name"], (body.ids if body else None) or None, me)
    return {**res, "followup": _followup(me)}


@router.post("", status_code=201)
def assign(body: AssignIn, me: dict = Depends(hr_only)):
    u = _employee(body.employeeCode)
    doc = {
        **body.model_dump(mode="json", exclude={"targets", "deliveries"}),
        "id": f"HY-{db.next_seq('halfyearly'):04d}",
        "employeeName": u["name"],
        "targets": _merge(body.targets, [], TARGET_KEYS),
        "deliveries": _merge(body.deliveries, [], DELIVERY_KEYS),
        "assignedBy": me["name"],
        "createdAt": now(),
        "updatedAt": now(),
    }
    col.insert_one(doc)
    _save_joining(u["code"], body.joiningDate)
    return _clean(doc)


@router.put("/{rid}")
def update_assignment(rid: str, body: AssignIn, me: dict = Depends(hr_only)):
    row = col.find_one({"id": rid})
    if not row:
        raise HTTPException(404, "Report row not found")
    row = upgrade(row)
    u = _employee(body.employeeCode)
    patch = {
        **body.model_dump(mode="json", exclude={"targets", "deliveries"}),
        "employeeName": u["name"],
        "targets": _merge(body.targets, row["targets"], TARGET_KEYS),
        "deliveries": _merge(body.deliveries, row["deliveries"], DELIVERY_KEYS),
        "assignedBy": me["name"],
        "updatedAt": now(),
    }
    res = col.find_one_and_update({"id": rid}, {"$set": patch}, return_document=True)
    _save_joining(u["code"], body.joiningDate)
    return _clean(res)


@router.put("/{rid}/status")
def update_status(rid: str, body: StatusIn, me: dict = Depends(hr_only)):
    """Only HR, Super Admin and Admin record achieved / code / delivery ready; faculty see it read-only."""
    row = col.find_one({"id": rid})
    if not row:
        raise HTTPException(404, "Report row not found")
    row = upgrade(row)
    targets = [{**t, **(body.targets[i].model_dump(mode="json") if i < len(body.targets) else {})} for i, t in enumerate(row["targets"])]
    deliveries = [{**d, **(body.deliveries[i].model_dump(mode="json") if i < len(body.deliveries) else {})} for i, d in enumerate(row["deliveries"])]
    col.update_one({"id": rid}, {"$set": {"targets": targets, "deliveries": deliveries, "statusBy": me["name"], "updatedAt": now()}})
    cert_followup.undo_completed_carries()
    return _clean(col.find_one({"id": rid}))


@router.delete("/{rid}")
def delete(rid: str, _: dict = Depends(hr_only)):  # v58: HR and Admin delete too (was Super Admin only)
    if not col.delete_one({"id": rid}).deleted_count:
        raise HTTPException(404, "Report row not found")
    return True



# ---------------------------------------------------------------- v60: HR's own performance mail

PERF_DEFAULT = {
    "subject": "Your performance review: {quarter} {period}",
    "body": ("Dear {name},\n\nThis is about your performance in the half-yearly commitment {quarter} ({period}).\n\n"
             "Target certifications:\n{targets}\n\n{note}\n\nRegards,\n{hrName}\nHR"),
}
perf = db.db.hr_mail_templates  # {_id: "<userId>|performance", subject, body, updatedAt}
perf_roles = require_roles("HR", "MANAGER")  # HR only (and the Super Admin)


class PerfSendIn(BaseModel):
    rowId: str = Field(min_length=1, max_length=40)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=10000)
    note: str = Field(default="", max_length=4000)


def _perf_template(me: dict) -> dict:
    d = perf.find_one({"_id": f"{me['userId']}|performance"}) or {}
    return {"subject": d.get("subject") or PERF_DEFAULT["subject"], "body": d.get("body") or PERF_DEFAULT["body"],
            "placeholders": ["{name}", "{code}", "{quarter}", "{period}", "{targets}", "{note}", "{hrName}"], "updatedAt": d.get("updatedAt")}


@router.get("/performance/template")
def perf_template(me: dict = Depends(perf_roles)):
    """Each HR keeps their own performance mail template."""
    return _perf_template(me)


@router.put("/performance/template")
def perf_save(body: TemplateIn, me: dict = Depends(perf_roles)):
    perf.update_one({"_id": f"{me['userId']}|performance"}, {"$set": {"subject": body.subject, "body": body.body, "userId": me["userId"], "updatedAt": now()}}, upsert=True)
    return _perf_template(me)


@router.post("/performance/send")
def perf_send(body: PerfSendIn, me: dict = Depends(perf_roles)):
    """Sends the performance mail to the faculty's official and personal email, from HR's own mail."""
    from .. import mailer  # noqa: PLC0415

    row = col.find_one({"id": body.rowId})
    if not row:
        raise HTTPException(404, "Report row not found")
    row = upgrade(row)
    u = db.users.find_one({"code": row["employeeCode"]}) or {}
    to = [e for e in dict.fromkeys([u.get("email"), u.get("personalEmail")]) if e]
    if not to:
        raise HTTPException(400, "This faculty has no email in the employee record")
    targets = "\n".join(f"- {t.get('name')}: {t.get('achieved') or 'Not updated'}" for t in row["targets"]) or "-"
    values = {"name": u.get("name") or row.get("employeeName", ""), "code": row["employeeCode"], "quarter": row.get("quarter") or "",
              "period": cert_followup.period_of(row), "targets": targets, "note": body.note, "hrName": me.get("name", "")}
    subject, text = cert_followup.fill(body.subject, values), cert_followup.fill(body.body, values)
    try:
        mailer.send_mail(to, subject, text, reply_to=me.get("email") or None, from_name="HR", from_addr=me.get("email") or None)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Mail did not send: {exc}") from exc
    mark = {"to": to, "subject": subject, "at": now(), "by": me["name"]}
    col.update_one({"id": body.rowId}, {"$push": {"performanceMails": mark}})
    return {"ok": True, **mark}
