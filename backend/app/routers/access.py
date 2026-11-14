"""Master › Role Access: the Manager ticks which menus Admin, HR, Faculty and Staff may open."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..security import ALL_ROLES, SECTIONS, require_roles, role_access

router = APIRouter(prefix="/access", tags=["access"])
manager = require_roles("MANAGER")


class AccessIn(BaseModel):
    roles: dict[str, dict[str, bool]]


def _view() -> dict:
    saved = role_access()
    doc = db.db.settings.find_one({"_id": "roleAccess"}) or {}
    return {
        "roles": list(ALL_ROLES),
        "sections": [{"key": k, "label": v["label"], "default": list(v["default"])} for k, v in SECTIONS.items()],
        "access": {r: {s: bool(saved.get(r, {}).get(s, r in cfg["default"])) for s, cfg in SECTIONS.items()} for r in ALL_ROLES},
        "updatedBy": doc.get("updatedBy"),
        "updatedAt": doc.get("updatedAt"),
    }


@router.get("")
def get_access(_: dict = Depends(manager)):
    return _view()


@router.put("")
def save_access(body: AccessIn, me: dict = Depends(manager)):
    clean: dict[str, dict[str, bool]] = {}
    for role, ticks in body.roles.items():
        if role not in ALL_ROLES:
            raise HTTPException(422, f"Unknown role {role}")
        clean[role] = {s: bool(v) for s, v in ticks.items() if s in SECTIONS}
    db.db.settings.update_one(
        {"_id": "roleAccess"},
        {"$set": {"roles": clean, "updatedBy": me["name"], "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return _view()
