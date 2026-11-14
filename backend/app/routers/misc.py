from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..schemas import Form
from ..security import current_user, require_roles

router = APIRouter(tags=["monthly plan, marks, notifications"])


BOSS = ("MANAGER", "ADMIN")
PlanStatus = Literal["Pending", "In Progress", "Completed"]


class PlanIn(BaseModel):
    """Admin / Manager: a plan assigned to one or more people (one document per person)."""
    month: str
    week: str
    courseId: str
    batchNo: str = ""
    plannedSessions: int = 0
    topics: str = ""
    assignees: list[str] = Field(min_length=1)


class PlanPatch(Form):
    month: str | None = None
    week: str | None = None
    courseId: str | None = None
    batchNo: str | None = None
    plannedSessions: int | None = None
    topics: str | None = None
    status: PlanStatus | None = None
    progressNote: str | None = Field(None, max_length=500)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/monthly-plans")
def list_plans(month: str | None = None, scope: Literal["mine", "all"] = "mine", me: dict = Depends(current_user)):
    q: dict = {} if scope == "all" and me["role"] in BOSS else {"assignedTo": me["userId"]}
    if month:
        q["month"] = month
    return list(db.plans.find(q, {"_id": 0}).sort([("week", 1), ("assigneeName", 1)]))


@router.post("/monthly-plans", status_code=201)
def create_plan(body: PlanIn, me: dict = Depends(require_roles(*BOSS))):
    docs = []
    for uid in dict.fromkeys(body.assignees):
        u = db.users.find_one({"userIdLower": uid.lower()})
        if not u:
            raise HTTPException(400, f"Unknown employee {uid}")
        docs.append({
            **body.model_dump(exclude={"assignees"}),
            "id": f"MP-{db.next_seq('monthly_plan'):02d}",
            "assignedTo": u["userId"], "assigneeName": u["name"], "assigneeCode": u["code"], "assigneeRole": u["role"],
            "status": "Pending", "progressNote": "", "assignedBy": me["name"], "createdAt": _now(), "updatedAt": _now(),
        })
    db.plans.insert_many(docs)
    return {"created": len(docs)}


@router.put("/monthly-plans/{plan_id}")
def update_plan(plan_id: str, body: PlanPatch, me: dict = Depends(current_user)):
    plan = db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(404, "Plan not found")
    patch = body.model_dump(exclude_none=True)
    if me["role"] not in BOSS:
        if plan.get("assignedTo") != me["userId"]:
            raise HTTPException(403, "This plan is not assigned to you")
        patch = {k: v for k, v in patch.items() if k in ("status", "progressNote")}
    patch["updatedAt"] = _now()
    db.plans.update_one({"id": plan_id}, {"$set": patch})
    return True


@router.delete("/monthly-plans/{plan_id}")
def delete_plan(plan_id: str, _: dict = Depends(require_roles(*BOSS))):
    db.plans.delete_one({"id": plan_id})
    return True


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
