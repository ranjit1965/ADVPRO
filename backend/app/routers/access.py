"""Master › Role Access: the Manager adds roles and ticks which side-pane menus each role may open."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import BUILT_IN_ROLES, SECTIONS, all_roles, custom_roles, default_access, require_roles, require_section, role_access

router = APIRouter(prefix="/access", tags=["access"])
manager = require_roles("MANAGER")


class AccessIn(BaseModel):
    roles: dict[str, dict[str, bool]]


class RoleIn(BaseModel):
    name: str = Field(min_length=2, max_length=30)


def _view() -> dict:
    saved = role_access()
    doc = db.db.settings.find_one({"_id": "roleAccess"}) or {}
    roles = all_roles()
    return {
        "roles": [{"key": r, "custom": r not in BUILT_IN_ROLES, "users": db.users.count_documents({"role": r})} for r in roles],
        "sections": [{"key": k, "label": v["label"]} for k, v in SECTIONS.items()],
        "defaults": {r: {s: default_access(r, s) for s in SECTIONS} for r in roles},
        "access": {r: {s: bool(saved.get(r, {}).get(s, default_access(r, s))) for s in SECTIONS} for r in roles},
        "updatedBy": doc.get("updatedBy"),
        "updatedAt": doc.get("updatedAt"),
    }


def _stamp(me: dict) -> dict:
    return {"updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}


@router.get("")
def get_access(_: dict = Depends(manager)):
    return _view()


@router.get("/roles")
def list_roles(_: dict = Depends(require_section("master"))):
    """Roles for the Employee form's Role list (built-in + added by the Manager)."""
    return all_roles()


@router.put("")
def save_access(body: AccessIn, me: dict = Depends(manager)):
    known = set(all_roles())
    clean: dict[str, dict[str, bool]] = {}
    for role, ticks in body.roles.items():
        if role not in known:
            raise HTTPException(422, f"Unknown role {role}")
        clean[role] = {s: bool(v) for s, v in ticks.items() if s in SECTIONS}
    db.db.settings.update_one({"_id": "roleAccess"}, {"$set": {"roles": clean, **_stamp(me)}}, upsert=True)
    return _view()


@router.post("/roles", status_code=201)
def add_role(body: RoleIn, me: dict = Depends(manager)):
    key = re.sub(r"\s+", "_", body.name.strip().upper())
    if not re.fullmatch(r"[A-Z][A-Z0-9_-]{1,29}", key):
        raise HTTPException(422, "Use letters, digits, space, - or _ (2 to 30), starting with a letter")
    if key == "MANAGER" or key in all_roles():
        raise HTTPException(409, f"The role {key} already exists")
    db.db.settings.update_one({"_id": "roleAccess"}, {"$push": {"customRoles": key}, "$set": _stamp(me)}, upsert=True)
    return _view()


@router.delete("/roles/{role}")
def delete_role(role: str, me: dict = Depends(manager)):
    if role not in custom_roles():
        raise HTTPException(400, "Only roles added here can be removed")
    n = db.users.count_documents({"role": role})
    if n:
        raise HTTPException(409, f"{n} employee(s) still have the role {role}. Change their role first.")
    db.db.settings.update_one({"_id": "roleAccess"}, {"$pull": {"customRoles": role}, "$unset": {f"roles.{role}": ""}, "$set": _stamp(me)})
    return _view()
