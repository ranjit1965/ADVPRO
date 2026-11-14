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
ALL_ROLES = ("ADMIN", "HR", "FACULTY", "STAFF")
SECTIONS = {
    "master": {"label": "Master", "default": ("ADMIN",)},
    "admin": {"label": "Admin (Data Upload)", "default": ("ADMIN",)},
    "hr": {"label": "HR", "default": ALL_ROLES},
    "faculty": {"label": "Faculty (Daily Activity, reports)", "default": ALL_ROLES},
    "myWork": {"label": "My Work", "default": ALL_ROLES},
}


def role_access() -> dict:
    """Saved ticks: {role: {section: bool}}; missing ones use the default."""
    doc = db.db.settings.find_one({"_id": "roleAccess"}) or {}
    return doc.get("roles", {})


def sections_for(user: dict) -> dict:
    role = user.get("role")
    if role == "MANAGER":
        return {s: True for s in SECTIONS}
    saved = role_access().get(role, {})
    return {s: bool(saved.get(s, role in cfg["default"])) for s, cfg in SECTIONS.items()}


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
