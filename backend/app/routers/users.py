from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .. import auto_inactive, db
from ..schemas import Form
from ..security import current_user, hash_password, public_user, require_roles, require_section, sections_for

router = APIRouter(prefix="/users", tags=["users"])
manager_only = require_section("master")  # Master › Employees (Master menu ticked for the role)


def people_view(user: dict = Depends(current_user)) -> dict:
    """Employee list: anyone with the Master menu, or HR / Admin with the HR menu (read-only for HR)."""
    access = sections_for(user)
    if user["role"] == "MANAGER" or access["master"] or (access["hr"] and user["role"] in ("HR", "ADMIN")):
        return user
    raise HTTPException(403, "You do not have access to this menu. Ask the Manager.")


EmployeeRole = Literal["FACULTY", "HR", "ADMIN", "STAFF"]


class UserIn(Form):
    userId: str = Field(pattern=r"^[A-Za-z0-9._-]{3,}$")
    code: str = Field(pattern=r"^[A-Za-z]{2,5}$")
    name: str = Field(min_length=1)
    email: EmailStr | None = None
    role: EmployeeRole = "FACULTY"
    designation: str = ""
    grade: str = ""
    department: str = ""
    branch: str = "Chennai Center"
    password: str = Field(min_length=8)


class UserPatch(Form):
    code: str | None = Field(default=None, pattern=r"^[A-Za-z]{2,5}$")
    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    designation: str | None = None
    grade: str | None = None
    department: str | None = None
    branch: str | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


@router.get("")
def list_users(_: dict = Depends(people_view)):  # HR: read-only
    return [public_user(u) for u in db.users.find().sort("name")]


@router.post("", status_code=201)
def create_user(body: UserIn, _: dict = Depends(manager_only)):
    if db.users.find_one({"userIdLower": body.userId.lower()}):
        raise HTTPException(409, "That User ID is already taken")
    code = body.code.upper()
    if db.users.find_one({"code": code}):
        raise HTTPException(409, "That employee code is already used")
    doc = body.model_dump(exclude={"password"})
    doc.update(
        code=code,
        name=body.name.strip().upper(),
        userIdLower=body.userId.lower(),
        passwordHash=hash_password(body.password),
        active=True,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    db.users.insert_one(doc)
    return public_user(doc)


@router.put("/{user_id}")
def update_user(user_id: str, body: UserPatch, me: dict = Depends(manager_only)):
    u = db.users.find_one({"userIdLower": user_id.lower()})
    if not u:
        raise HTTPException(404, "Employee not found")
    patch = body.model_dump(exclude_unset=True)
    if u["role"] == "MANAGER" and me["role"] != "MANAGER":
        raise HTTPException(403, "Only the manager can change the manager account")
    if "role" in patch:
        if u["role"] == "MANAGER" and patch["role"] != "MANAGER":
            raise HTTPException(400, "The manager role cannot be changed")
        if patch["role"] == "MANAGER" and u["role"] != "MANAGER":
            raise HTTPException(400, "Only one manager account is allowed")
        if patch["role"] not in ("MANAGER", "FACULTY", "HR", "ADMIN", "STAFF"):
            raise HTTPException(422, "Unknown role")
    if u["role"] == "MANAGER" and patch.get("active") is False:
        raise HTTPException(400, "The manager account cannot be disabled")
    if "code" in patch:
        patch["code"] = patch["code"].upper()
        if db.users.find_one({"code": patch["code"], "_id": {"$ne": u["_id"]}}):
            raise HTTPException(409, "That employee code is already used")
    if patch.get("name"):
        patch["name"] = patch["name"].strip().upper()
    if patch.get("password"):
        patch["passwordHash"] = hash_password(patch.pop("password"))
    patch.pop("password", None)
    unset = {}
    was_active = u.get("active", True)
    if patch.get("active") is True and not was_active:
        # Made active again by a manager / admin: the missing-entry check counts only the days after today.
        patch.update(reactivatedAt=datetime.now(timezone.utc).isoformat(), reactivatedBy=me["name"])
        unset = {"autoInactive": "", "inactiveReason": "", "inactiveAt": "", "inactiveBy": ""}
    elif patch.get("active") is False and was_active:
        patch.update(autoInactive=False, inactiveAt=datetime.now(timezone.utc).isoformat(), inactiveBy=me["name"], inactiveReason="Disabled by " + me["name"])
    db.users.update_one({"_id": u["_id"]}, {"$set": patch, **({"$unset": unset} if unset else {})})
    return public_user(db.users.find_one({"_id": u["_id"]}))


class AdminAccessIn(BaseModel):
    enabled: bool


@router.get("/auto-inactive")
def auto_inactive_preview(_: dict = Depends(manager_only)):
    """Who the missing-entry check would make inactive now, plus its settings and last run."""
    return {"settings": auto_inactive.status(), "preview": auto_inactive.run(dry_run=True)}


@router.post("/auto-inactive/run")
def auto_inactive_run(me: dict = Depends(manager_only)):
    """Run the missing-entry check now (it also runs by itself every day)."""
    return auto_inactive.run(by=me["name"])


@router.put("/{user_id}/admin-access")
def set_admin_access(user_id: str, body: AdminAccessIn, _: dict = Depends(require_roles("MANAGER"))):
    """Manager only: give or remove an Admin's access (create batches, Batch Master upload, employees ...)."""
    u = db.users.find_one({"userIdLower": user_id.lower()})
    if not u:
        raise HTTPException(404, "Employee not found")
    if u["role"] != "ADMIN":
        raise HTTPException(400, "Only an Admin account has Admin access to give or remove")
    db.users.update_one({"_id": u["_id"]}, {"$set": {"adminAccess": body.enabled}})
    return public_user(db.users.find_one({"_id": u["_id"]}))


@router.delete("/{user_id}")
def delete_user(user_id: str, me: dict = Depends(manager_only)):
    """Moves the employee to Deleted employees (`deleted_users`); restore brings them back unchanged."""
    if me["userIdLower"] == user_id.lower():
        raise HTTPException(400, "You cannot delete your own account")
    target = db.users.find_one({"userIdLower": user_id.lower()})
    if not target:
        raise HTTPException(404, "Employee not found")
    if target["role"] == "MANAGER":
        raise HTTPException(400, "The manager account cannot be deleted")
    record = {k: v for k, v in target.items() if k != "_id"}
    record.update(deletedAt=datetime.now(timezone.utc).isoformat(), deletedBy=me["name"])
    db.deleted_users.delete_many({"userIdLower": record["userIdLower"]})  # keep only the latest copy
    db.deleted_users.insert_one(record)
    db.users.delete_one({"_id": target["_id"]})
    return True


@router.get("/deleted/list")
def list_deleted(_: dict = Depends(manager_only)):
    return [public_user(u) for u in db.deleted_users.find().sort("deletedAt", -1)]


@router.post("/deleted/{user_id}/restore")
def restore_user(user_id: str, me: dict = Depends(manager_only)):
    rec = db.deleted_users.find_one({"userIdLower": user_id.lower()})
    if not rec:
        raise HTTPException(404, "Deleted employee not found")
    if db.users.find_one({"userIdLower": rec["userIdLower"]}):
        raise HTTPException(409, f"User ID {rec['userId']} is already used by another employee. Change that employee's User ID first.")
    if db.users.find_one({"code": rec["code"]}):
        raise HTTPException(409, f"Employee code {rec['code']} is already used by another employee. Change that employee's code first.")
    doc = {k: v for k, v in rec.items() if k not in ("_id", "deletedAt", "deletedBy", "autoInactive", "inactiveReason", "inactiveAt", "inactiveBy")}
    # Restored as Active; the missing-entry check counts only the working days after today.
    now = datetime.now(timezone.utc).isoformat()
    doc.update(active=True, restoredAt=now, restoredBy=me["name"], reactivatedAt=now, reactivatedBy=me["name"])
    db.users.insert_one(doc)
    db.deleted_users.delete_one({"_id": rec["_id"]})
    return public_user(doc)
