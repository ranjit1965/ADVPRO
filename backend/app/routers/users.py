from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .. import db
from ..schemas import Form
from ..security import hash_password, public_user, require_roles

router = APIRouter(prefix="/users", tags=["users"])
manager_only = require_roles("MANAGER", "ADMIN")  # Master › Employees
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
def list_users(_: dict = Depends(require_roles("MANAGER", "ADMIN", "HR"))):  # HR: read-only
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
    db.users.update_one({"_id": u["_id"]}, {"$set": patch})
    return public_user(db.users.find_one({"_id": u["_id"]}))


@router.delete("/{user_id}")
def delete_user(user_id: str, me: dict = Depends(manager_only)):
    if me["userIdLower"] == user_id.lower():
        raise HTTPException(400, "You cannot delete your own account")
    target = db.users.find_one({"userIdLower": user_id.lower()})
    if target and target["role"] == "MANAGER":
        raise HTTPException(400, "The manager account cannot be deleted")
    res = db.users.delete_one({"userIdLower": user_id.lower()})
    if not res.deleted_count:
        raise HTTPException(404, "Employee not found")
    return True
