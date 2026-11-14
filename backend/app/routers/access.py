"""Master › Roles & Access (Manager only): create roles, and tick which side-pane menus each role may open.

Roles are stored in the `roles` collection (see security.py). Master › Employees offers every role
here in its Role list (GET /api/access/roles).
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import SECTIONS, default_access, require_roles, require_section, role_doc_access, roles_list

router = APIRouter(prefix="/access", tags=["roles and access"])
manager = require_roles("MANAGER")


class AccessIn(BaseModel):
    roles: dict[str, dict[str, bool]]


class RoleIn(BaseModel):
    name: str = Field(min_length=2, max_length=30)
    description: str = Field(default="", max_length=200)


class RolePatch(BaseModel):
    label: str | None = Field(default=None, min_length=2, max_length=30)
    description: str | None = Field(default=None, max_length=200)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _view() -> dict:
    roles = roles_list()
    last = max(roles, key=lambda r: r.get("updatedAt") or r.get("createdAt") or "", default={})
    return {
        "roles": [
            {
                "key": r["key"], "label": r.get("label") or r["key"], "description": r.get("description", ""),
                "custom": not r.get("builtIn"), "users": db.users.count_documents({"role": r["key"]}),
                "createdBy": r.get("createdBy"), "createdAt": r.get("createdAt"),
            }
            for r in roles
        ],
        "sections": [{"key": k, "label": v["label"]} for k, v in SECTIONS.items()],
        "defaults": {r["key"]: {s: default_access(r["key"], s) for s in SECTIONS} for r in roles},
        "access": {r["key"]: role_doc_access(r, r["key"]) for r in roles},
        "updatedBy": last.get("updatedBy"),
        "updatedAt": last.get("updatedAt"),
    }


@router.get("")
def get_access(_: dict = Depends(manager)):
    return _view()


@router.get("/roles")
def list_roles(_: dict = Depends(require_section("master"))):
    """Roles for the Employee form's Role list: [{key, label}]."""
    return [{"key": r["key"], "label": r.get("label") or r["key"]} for r in roles_list()]


@router.put("")
def save_access(body: AccessIn, me: dict = Depends(manager)):
    known = {r["key"] for r in roles_list()}
    for role in body.roles:
        if role not in known:
            raise HTTPException(422, f"Unknown role {role}")
    for role, ticks in body.roles.items():
        db.db.roles.update_one(
            {"key": role},
            {"$set": {"access": {s: bool(ticks.get(s, default_access(role, s))) for s in SECTIONS}, "updatedBy": me["name"], "updatedAt": _now()}},
        )
    return _view()


@router.post("/roles", status_code=201)
def add_role(body: RoleIn, me: dict = Depends(manager)):
    label = re.sub(r"\s+", " ", body.name.strip())
    key = re.sub(r"[\s-]+", "_", label.upper())
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{1,29}", key):
        raise HTTPException(422, "Use letters, digits, spaces, - or _ (2 to 30), starting with a letter")
    if key == "MANAGER" or db.db.roles.find_one({"key": key}):
        raise HTTPException(409, f"The role {key} already exists")
    now = _now()
    db.db.roles.insert_one({
        "key": key, "label": label.title() if label.isupper() or label.islower() else label, "description": body.description.strip(),
        "builtIn": False, "order": 100, "access": {s: default_access(key, s) for s in SECTIONS},
        "createdBy": me["name"], "createdAt": now, "updatedBy": me["name"], "updatedAt": now,
    })
    return _view()


@router.patch("/roles/{role}")
def edit_role(role: str, body: RolePatch, me: dict = Depends(manager)):
    patch = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    if not db.db.roles.update_one({"key": role}, {"$set": {**patch, "updatedBy": me["name"], "updatedAt": _now()}}).matched_count:
        raise HTTPException(404, "Role not found")
    return _view()


@router.delete("/roles/{role}")
def delete_role(role: str, me: dict = Depends(manager)):
    r = db.db.roles.find_one({"key": role})
    if not r:
        raise HTTPException(404, "Role not found")
    if r.get("builtIn"):
        raise HTTPException(400, "Admin, HR, Faculty and Staff are built in and cannot be removed")
    n = db.users.count_documents({"role": role})
    if n:
        raise HTTPException(409, f"{n} employee(s) still have the role {role}. Change their role first.")
    db.db.roles.delete_one({"key": role})
    return _view()
