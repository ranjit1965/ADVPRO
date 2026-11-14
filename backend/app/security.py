from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db
from .config import settings

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": user_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def public_user(u: dict) -> dict:
    hidden = {"_id", "passwordHash", "userIdLower"}
    return {k: v for k, v in u.items() if k not in hidden}


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Sign in again.")
    user = db.users.find_one({"userIdLower": payload["sub"].lower()})
    if not user or not user.get("active", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not available")
    return effective(user)


def effective(user: dict) -> dict:
    """An Admin whose access the Manager removed works as a normal employee (STAFF) until it is given back."""
    if user.get("role") == "ADMIN" and user.get("adminAccess") is False:
        return {**user, "role": "STAFF", "adminAccessRemoved": True}
    return user


def require_roles(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this action")
        return user

    return dep


# ------------------------------------------------------------------ menu (tab) access per role
# The Manager ticks which menus each role may open (Master › Role Access). Not ticked = hidden in the
# menu and refused by the server. The Manager always has every menu. Defaults = the old fixed rules.
BUILT_IN_ROLES = ("ADMIN", "HR", "FACULTY", "STAFF")
ALL_ROLES = BUILT_IN_ROLES  # kept for older imports; use all_roles() for the full list with added roles
# Every tab of the left side pane, in menu order (Dashboard is always shown: it is the home page).
SECTIONS = {
    "master": {"label": "Master", "default": ("ADMIN",)},
    "faculty": {"label": "Faculty (Daily Activity, reports)", "default": BUILT_IN_ROLES},
    "labSupport": {"label": "Lab Support", "default": BUILT_IN_ROLES},
    "mis": {"label": "MIS", "default": BUILT_IN_ROLES},
    "digitalMarketing": {"label": "Digital Marketing", "default": BUILT_IN_ROLES},
    "admin": {"label": "Admin (Data Upload)", "default": ("ADMIN",)},
    "marketing": {"label": "Marketing", "default": BUILT_IN_ROLES},
    "hr": {"label": "HR", "default": BUILT_IN_ROLES},
}
BUILT_IN_LABELS = {"ADMIN": "Admin", "HR": "HR", "FACULTY": "Faculty", "STAFF": "Staff"}

# Roles live in their own collection `roles`, one document per role:
#   {key: "ACCOUNTS", label: "Accounts", description, builtIn: false, access: {master: true, ...},
#    createdBy, createdAt, updatedBy, updatedAt}
# The Manager creates roles and ticks their menu access in Master › Roles & Access; Master › Employees
# offers them in the Role list. MANAGER is not a role document: it always has everything.


def default_access(role: str, section: str) -> bool:
    # A role the Manager creates starts with the same menus as Staff until the Manager ticks otherwise.
    base = role if role in BUILT_IN_ROLES else "STAFF"
    return base in SECTIONS[section]["default"]


def role_doc_access(doc: dict | None, role: str) -> dict:
    saved = (doc or {}).get("access", {})
    return {s: bool(saved.get(s, default_access(role, s))) for s in SECTIONS}


def ensure_roles() -> None:
    """First start: the four built-in roles; also moves roles / ticks saved by v45 in settings.roleAccess."""
    db.db.roles.create_index("key", unique=True)
    old = db.db.settings.find_one({"_id": "roleAccess"}) or {}
    old_ticks = old.get("roles", {})
    now = datetime.now(timezone.utc).isoformat()
    for i, key in enumerate([*BUILT_IN_ROLES, *old.get("customRoles", [])]):
        db.db.roles.update_one(
            {"key": key},
            {"$setOnInsert": {
                "key": key, "label": BUILT_IN_LABELS.get(key, key.replace("_", " ").title()), "description": "",
                "builtIn": key in BUILT_IN_ROLES, "order": i, "access": {**{s: default_access(key, s) for s in SECTIONS}, **old_ticks.get(key, {})},
                "createdBy": "System", "createdAt": now,
            }},
            upsert=True,
        )
    if old:
        db.db.settings.delete_one({"_id": "roleAccess"})  # now kept in `roles`


def roles_list() -> list[dict]:
    return list(db.db.roles.find({}, {"_id": 0}).sort([("builtIn", -1), ("order", 1), ("createdAt", 1)]))


def all_roles() -> list[str]:
    return [r["key"] for r in roles_list()]


def custom_roles() -> list[str]:
    return [r["key"] for r in roles_list() if not r.get("builtIn")]


def role_access() -> dict:
    """{role: {section: bool}} for every role."""
    return {r["key"]: role_doc_access(r, r["key"]) for r in roles_list()}


def sections_for(user: dict) -> dict:
    role = user.get("role")
    if role == "MANAGER":
        return {s: True for s in SECTIONS}
    return role_doc_access(db.db.roles.find_one({"key": role}), role)


def me_view(user: dict) -> dict:
    """The signed-in user as the frontend sees it, with the menus they may open."""
    return {**public_user(user), "sections": sections_for(user)}


def require_section(*sections: str, roles: tuple[str, ...] | None = None):
    """Allowed when any of `sections` is ticked for the user's role (and, if given, the role is in `roles`)."""

    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] == "MANAGER":
            return user
        access = sections_for(user)
        if not any(access.get(s) for s in sections) or (roles and user["role"] not in roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this menu. Ask the Manager.")
        return user

    return dep
