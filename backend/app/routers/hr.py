"""HR_Report: HR Policy. (Batch Paper Completion and Leave/Permission Form were removed in v46, Your Info in v49.)"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db
from ..security import require_section, current_user

router = APIRouter(prefix="/hr", tags=["hr report"])
HR_ROLES = ("HR", "MIS", "MANAGER", "ADMIN")  # v60: MIS has everything HR has, except the Halfyearly Program Report
hr_only = require_section("hr", roles=("HR", "MIS", "ADMIN"))  # HR / Admin with the HR menu ticked; Super Admin always

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
