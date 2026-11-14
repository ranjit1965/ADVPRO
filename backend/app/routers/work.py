"""Master › Shedulling: Admin and Manager assign work; each assignee updates status and a progress note."""
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..schemas import Form
from ..security import current_user, require_roles, require_section, sections_for

router = APIRouter(prefix="/work-assignments", tags=["scheduling"])
BOSS = ("MANAGER", "ADMIN")
Status = Literal["Assigned", "In Progress", "Done"]
Priority = Literal["High", "Medium", "Low"]


class WorkIn(Form):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=1000)
    priority: Priority = "Medium"
    startDate: date | None = None
    dueDate: date | None = None
    assignees: list[str] = Field(min_length=1)


class WorkPatch(Form):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)
    priority: Priority | None = None
    startDate: date | None = None
    dueDate: date | None = None
    status: Status | None = None
    progressNote: str | None = Field(None, max_length=500)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(w: dict) -> dict:
    w.pop("_id", None)
    return w


@router.get("")
def list_work(scope: Literal["mine", "all"] = "mine", me: dict = Depends(current_user)):
    q = {} if scope == "all" and sections_for(me)["master"] else {"assignedTo": me["userId"]}
    return [clean(w) for w in db.db.work_assignments.find(q).sort([("dueDate", 1), ("createdAt", -1)])]


@router.post("", status_code=201)
def create_work(body: WorkIn, me: dict = Depends(require_section("master"))):
    if body.startDate and body.dueDate and body.dueDate < body.startDate:
        raise HTTPException(422, "Due date must be on or after the start date")
    docs = []
    for uid in dict.fromkeys(body.assignees):
        u = db.users.find_one({"userIdLower": uid.lower()})
        if not u:
            raise HTTPException(400, f"Unknown employee {uid}")
        docs.append({
            **body.model_dump(mode="json", exclude={"assignees"}),
            "id": f"WA-{db.next_seq('work_assignment'):04d}",
            "assignedTo": u["userId"], "assigneeName": u["name"], "assigneeCode": u["code"], "assigneeRole": u["role"],
            "status": "Assigned", "progressNote": "", "assignedBy": me["name"], "createdAt": now(), "updatedAt": now(),
        })
    db.db.work_assignments.insert_many(docs)
    return {"created": len(docs)}


@router.put("/{work_id}")
def update_work(work_id: str, body: WorkPatch, me: dict = Depends(current_user)):
    w = db.db.work_assignments.find_one({"id": work_id})
    if not w:
        raise HTTPException(404, "Work not found")
    patch = body.model_dump(mode="json", exclude_unset=True)
    if me["role"] not in BOSS:
        if w["assignedTo"] != me["userId"]:
            raise HTTPException(403, "This work is not assigned to you")
        patch = {k: v for k, v in patch.items() if k in ("status", "progressNote")}
    patch["updatedAt"] = now()
    db.db.work_assignments.update_one({"id": work_id}, {"$set": patch})
    return clean(db.db.work_assignments.find_one({"id": work_id}))


@router.delete("/{work_id}")
def delete_work(work_id: str, _: dict = Depends(require_section("master"))):
    db.db.work_assignments.delete_one({"id": work_id})
    return True
