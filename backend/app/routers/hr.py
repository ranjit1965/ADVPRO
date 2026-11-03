"""HR_Report: HR Policy, Your Info, Batch Paper Completion and Leave/Permission Form."""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, model_validator

from .. import db
from ..schemas import Form
from ..security import current_user, public_user, require_roles
from .entries import minutes_between

router = APIRouter(prefix="/hr", tags=["hr report"])
HR_ROLES = ("HR", "MANAGER", "ADMIN")
hr_only = require_roles(*HR_ROLES)
TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"

DEFAULT_POLICY = (
    "# Working hours\n- Office hours are 9:30 AM to 6:30 PM, Monday to Saturday.\n"
    "- Record every activity in Faculty › Daily Activity › Entry on the same day.\n\n"
    "# Leave\n- Earned Leave (EL) and Casual Leave (CL) are allotted each financial year (April to March).\n"
    "- Apply through HR_Report › Leave/Permission Form before the leave (Pre) or on return (Post).\n"
    "- Sanction or rejection is at the respective Manager's / Director's discretion.\n\n"
    "# Note\nThis is sample text. HR can replace it with the company policy using the Edit button."
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def financial_year(d: date | None = None) -> tuple[str, str, str]:
    d = d or date.today()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}", f"{start}-04-01", f"{start + 1}-03-31"


# ---------------------------------------------------------------- policy
class PolicyIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


@router.get("/policy")
def get_policy(_: dict = Depends(current_user)):
    doc = db.db.settings.find_one({"_id": "hrPolicy"}) or {"content": DEFAULT_POLICY, "updatedBy": "HR", "updatedAt": None}
    doc.pop("_id", None)
    return doc


@router.put("/policy")
def save_policy(body: PolicyIn, user: dict = Depends(hr_only)):
    doc = {"content": body.content, "updatedBy": user["name"], "updatedAt": now()}
    db.db.settings.replace_one({"_id": "hrPolicy"}, {"_id": "hrPolicy", **doc}, upsert=True)
    return doc


# ------------------------------------------------------------- your info
class Rating(BaseModel):
    model_config = {"extra": "allow"}  # Apr..Mar: BA, A, AA, G, VG, E
    year: str


class InfoIn(BaseModel):
    pfAccNo: str = ""
    bankAccNo: str = ""
    elAllotted: int = Field(12, ge=0, le=365)
    clAllotted: int = Field(12, ge=0, le=365)
    absentDays: int = Field(0, ge=0, le=366)
    ratings: list[Rating] = []


@router.get("/info")
def get_info(userId: str | None = None, me: dict = Depends(current_user)):
    u = me
    if userId and userId.lower() != me["userIdLower"]:
        if me["role"] not in HR_ROLES:
            raise HTTPException(403, "You can only see your own info")
        u = db.users.find_one({"userIdLower": userId.lower()})
        if not u:
            raise HTTPException(404, "Employee not found")
    hr = u.get("hr", {})
    label, frm, to = financial_year()
    approved = list(db.leave_requests.find({"userId": u["userId"], "status": "Approved", "dateFrom": {"$gte": frm, "$lte": to}}))
    taken = lambda t: sum(float(r.get("days", 0)) for r in approved if r["kind"] == "Leave" and r.get("leaveType") == t)  # noqa: E731
    el, cl = hr.get("elAllotted", 12), hr.get("clAllotted", 12)
    return {
        "user": public_user(u),
        "pfAccNo": hr.get("pfAccNo", ""),
        "bankAccNo": hr.get("bankAccNo", ""),
        "financialYear": label,
        "elAllotted": el,
        "clAllotted": cl,
        "el": {"allotted": el, "taken": taken("EL"), "available": el - taken("EL")},
        "cl": {"allotted": cl, "taken": taken("CL"), "available": cl - taken("CL")},
        "permissions": sum(r["kind"] == "Permission" for r in approved),
        "absentDays": hr.get("absentDays", 0),
        "ratings": hr.get("ratings", []),
    }


@router.put("/info/{user_id}")
def save_info(user_id: str, body: InfoIn, _: dict = Depends(hr_only)):
    res = db.users.update_one({"userIdLower": user_id.lower()}, {"$set": {"hr": body.model_dump()}})
    if not res.matched_count:
        raise HTTPException(404, "Employee not found")
    return True


# ------------------------------------------------- batch paper completion
@router.get("/batch-completion")
def batch_completion(facultyCode: str | None = None, me: dict = Depends(current_user)):
    if me["role"] not in HR_ROLES:
        facultyCode = me["code"]  # faculty see their own batches
    q = {"activityType": "class", "details.batchNo": {"$nin": [None, ""]}}
    if facultyCode:
        q["facultyCode"] = facultyCode
    groups: dict[str, dict] = {}
    for e in db.entries.find(q):
        d = e["details"]
        k = f"{e['facultyCode']}|{d['batchNo']}|{d.get('courseId', '')}"
        g = groups.setdefault(k, {"key": k, "facultyCode": e["facultyCode"], "facultyName": e["facultyName"], "batchNo": d["batchNo"], "courseId": d.get("courseId", ""), "startDate": e["activityDate"], "endDate": e["activityDate"], "sessions": 0, "minutes": 0})
        g["sessions"] += 1
        g["minutes"] += minutes_between(e["timeFrom"], e["timeTo"])
        g["startDate"] = min(g["startDate"], e["activityDate"])
        g["endDate"] = max(g["endDate"], e["activityDate"])
    return sorted(groups.values(), key=lambda g: (g["facultyName"], g["startDate"]))


# ------------------------------------------------- leave / permission
class LeaveIn(Form):
    kind: Literal["Leave", "Permission"]
    type: Literal["Pre", "Post"]
    email: EmailStr
    reason: str = Field(min_length=1, max_length=500)
    dateFrom: date
    dateTo: date | None = None
    days: float | None = Field(default=None, gt=0, le=60)
    leaveType: Literal["EL", "CL", "LOP"] | None = None
    timeFrom: str | None = Field(default=None, pattern=TIME_RE)
    timeTo: str | None = Field(default=None, pattern=TIME_RE)

    @model_validator(mode="after")
    def check(self):
        if self.kind == "Leave":
            if not (self.dateTo and self.days and self.leaveType):
                raise ValueError("Leave needs days, leave type and the To date")
            if self.dateTo < self.dateFrom:
                raise ValueError("To date must be on or after From date")
        elif not (self.timeFrom and self.timeTo) or self.timeTo <= self.timeFrom:
            raise ValueError("Permission needs Time From before Time To")
        return self


class DecisionIn(BaseModel):
    status: Literal["Approved", "Rejected"]


def _clean(r: dict) -> dict:
    r.pop("_id", None)
    return r


@router.get("/leave-requests")
def list_leave(scope: Literal["mine", "all"] = "mine", me: dict = Depends(current_user)):
    q = {} if scope == "all" and me["role"] in HR_ROLES else {"userId": me["userId"]}
    return [_clean(r) for r in db.leave_requests.find(q).sort("createdAt", -1)]


@router.post("/leave-requests", status_code=201)
def create_leave(body: LeaveIn, me: dict = Depends(current_user)):
    doc = {
        **body.model_dump(mode="json", exclude_none=True),
        "id": f"LR-{db.next_seq('leave_request'):04d}",
        "userId": me["userId"],
        "employeeCode": me["code"],
        "employeeName": me["name"],
        "designation": me.get("designation", ""),
        "status": "Pending",
        "createdAt": now(),
    }
    db.leave_requests.insert_one(doc)
    return _clean(doc)


@router.post("/leave-requests/{req_id}/decision")
def decide_leave(req_id: str, body: DecisionIn, me: dict = Depends(require_roles("MANAGER"))):
    res = db.leave_requests.find_one_and_update({"id": req_id}, {"$set": {"status": body.status, "decidedBy": me["name"], "decidedAt": now()}}, return_document=True)
    if not res:
        raise HTTPException(404, "Request not found")
    return _clean(res)
