"""HR_Report: HR Policy and Your Info (Batch Paper Completion and Leave/Permission Form were removed in v46)."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import require_section, current_user, public_user

router = APIRouter(prefix="/hr", tags=["hr report"])
HR_ROLES = ("HR", "MANAGER", "ADMIN")
hr_only = require_section("hr", roles=("HR", "ADMIN"))  # HR / Admin with the HR menu ticked; Manager always
TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"

DEFAULT_POLICY = (
    "# Working hours\n- Office hours are 9:30 AM to 6:30 PM, Monday to Saturday.\n"
    "- Record every activity in Faculty › Daily Activity › Entry on the same day.\n\n"
    "# Leave\n- Earned Leave (EL) and Casual Leave (CL) are allotted each financial year (April to March).\n"
    "- Inform HR and your Manager before the leave.\n"
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
    el, cl = hr.get("elAllotted", 12), hr.get("clAllotted", 12)
    return {
        "user": public_user(u),
        "pfAccNo": hr.get("pfAccNo", ""),
        "bankAccNo": hr.get("bankAccNo", ""),
        "financialYear": label,
        "elAllotted": el,
        "clAllotted": cl,
        "absentDays": hr.get("absentDays", 0),
        "ratings": hr.get("ratings", []),
    }


@router.put("/info/{user_id}")
def save_info(user_id: str, body: InfoIn, _: dict = Depends(hr_only)):
    res = db.users.update_one({"userIdLower": user_id.lower()}, {"$set": {"hr": body.model_dump()}})
    if not res.matched_count:
        raise HTTPException(404, "Employee not found")
    return True
