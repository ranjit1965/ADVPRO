from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .. import auto_inactive, db
from ..schemas import Form
from ..security import manage_access, super_admin_only, is_super_admin, all_roles, current_user, hash_password, public_user, require_roles, require_section, sections_for

router = APIRouter(prefix="/users", tags=["users"])
manager_only = manage_access  # Employees: view, add and edit for Master / Admin menu, or HR / Admin with the HR menu


def people_view(user: dict = Depends(current_user)) -> dict:
    """Employee list: anyone with the Master menu, or HR / Admin with the HR menu (read-only for HR)."""
    access = sections_for(user)
    if user["role"] == "MANAGER" or access["master"] or access["admin"] or (access["hr"] and user["role"] in ("HR", "ADMIN", "MIS")):
        return user
    raise HTTPException(403, "You do not have access to this menu. Ask the Super Admin.")


# Records that belong to one employee: moved to `deleted_records` on delete and back on restore.
# (collection, field in that collection, field of the employee it matches)
OWNED = (
    ("daily_entries", "facultyCode", "code"),
    ("halfyearly_reports", "employeeCode", "code"),
    ("biometric_days", "code", "code"),
)


def check_role(role: str) -> str:
    role = role.strip().upper()
    if role not in all_roles():
        raise HTTPException(422, f"Unknown role {role}. The Super Admin adds roles in Master › Role Access.")
    return role


# v60: `code` (2 to 5 letters, e.g. ARI) is shown as "Short Name"; it stays the key used by entries and reports.
# `employeeId` is the new Employee ID, numbers only. Dropdowns show NAME (SHORT · ID).
SHORT = r"^[A-Za-z]{2,5}$"
EMP_ID = r"^\d{1,10}$"
PHONE = r"^\+?\d{10,15}$"


class UserIn(Form):
    """v60: no User ID / password here: the Super Admin gives the login separately (PUT /users/{id}/login)."""
    code: str = Field(pattern=SHORT)  # Short Name
    employeeId: str = Field(pattern=EMP_ID)
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(pattern=PHONE)  # WhatsApp number
    personalEmail: EmailStr
    email: EmailStr | None = None  # official email, can be added later
    role: str = "FACULTY"
    branch: str = Field(default="Chennai Center", max_length=80)  # any place name


class UserPatch(Form):
    code: str | None = Field(default=None, pattern=SHORT)
    employeeId: str | None = Field(default=None, pattern=EMP_ID)
    name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, pattern=PHONE)
    personalEmail: EmailStr | None = None
    email: EmailStr | None = None
    role: str | None = None
    branch: str | None = Field(default=None, max_length=80)
    active: bool | None = None


class LoginIn(BaseModel):
    userId: str = Field(pattern=r"^[A-Za-z0-9._-]{3,40}$")
    password: str | None = Field(default=None, min_length=8, max_length=128)  # empty = keep the current one


@router.get("")
def list_users(_: dict = Depends(people_view)):  # HR: read-only
    return [public_user(u) for u in db.users.find().sort("name")]


@router.post("", status_code=201)
def create_user(body: UserIn, _: dict = Depends(manager_only)):
    """Adds the employee without a login. Until the Super Admin gives a User ID and password, the User ID
    is the Short Name and nobody can sign in with it."""
    code = body.code.upper()
    if db.users.find_one({"code": code}) or db.users.find_one({"userIdLower": code.lower()}):
        raise HTTPException(409, "That Short Name is already used")
    if db.users.find_one({"employeeId": body.employeeId}):
        raise HTTPException(409, "That Employee ID is already used")
    doc = body.model_dump()
    doc["role"] = check_role(body.role)
    if doc["role"] == "MANAGER":
        raise HTTPException(400, "Only one Super Admin account is allowed")
    doc.update(
        code=code,
        userId=code,
        userIdLower=code.lower(),
        name=body.name.strip().upper(),
        branch=body.branch.strip() or "Chennai Center",
        active=True,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    db.users.insert_one(doc)
    return public_user(doc)


@router.put("/{user_id}/login")
def set_login(user_id: str, body: LoginIn, me: dict = Depends(super_admin_only)):
    """v60, Super Admin only: the employee's login (User ID and password). A new password signs them out."""
    u = db.users.find_one({"userIdLower": user_id.lower()})
    if not u:
        raise HTTPException(404, "Employee not found")
    new_lower = body.userId.lower()
    if new_lower != u["userIdLower"] and (db.users.find_one({"userIdLower": new_lower}) or db.deleted_users.find_one({"userIdLower": new_lower})):
        raise HTTPException(409, "That User ID is already taken")
    if not body.password and not u.get("passwordHash"):
        raise HTTPException(422, "Give a password (at least 8 characters)")
    upd = {"userId": body.userId, "userIdLower": new_lower, "loginBy": me["name"], "loginAt": datetime.now(timezone.utc).isoformat()}
    if body.password:
        upd["passwordHash"] = hash_password(body.password)
    db.users.update_one({"_id": u["_id"]}, {"$set": upd, **({"$unset": {"sessionId": ""}} if body.password else {})})
    return public_user(db.users.find_one({"_id": u["_id"]}))


@router.put("/{user_id}")
def update_user(user_id: str, body: UserPatch, me: dict = Depends(manager_only)):
    u = db.users.find_one({"userIdLower": user_id.lower()})
    if not u:
        raise HTTPException(404, "Employee not found")
    patch = body.model_dump(exclude_unset=True)
    if u["role"] == "MANAGER" and me["role"] != "MANAGER":
        raise HTTPException(403, "Only the Super Admin can change the Super Admin account")
    if "role" in patch:
        if u["role"] == "MANAGER" and patch["role"] != "MANAGER":
            raise HTTPException(400, "The Super Admin role cannot be changed")
        if patch["role"] == "MANAGER" and u["role"] != "MANAGER":
            raise HTTPException(400, "Only one Super Admin account is allowed")
        if patch["role"] != "MANAGER":
            patch["role"] = check_role(patch["role"])
    if u["role"] == "MANAGER" and patch.get("active") is False:
        raise HTTPException(400, "The Super Admin account cannot be disabled")
    if "code" in patch:
        patch["code"] = patch["code"].upper()
        if db.users.find_one({"code": patch["code"], "_id": {"$ne": u["_id"]}}):
            raise HTTPException(409, "That Short Name is already used")
    if patch.get("employeeId") and db.users.find_one({"employeeId": patch["employeeId"], "_id": {"$ne": u["_id"]}}):
        raise HTTPException(409, "That Employee ID is already used")
    if patch.get("name"):
        patch["name"] = patch["name"].strip().upper()
    if patch.get("branch") is not None:
        patch["branch"] = patch["branch"].strip() or "Chennai Center"
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


class RolesIn(BaseModel):
    roles: list[str] = Field(max_length=50)


@router.put("/auto-inactive/roles")
def auto_inactive_roles(body: RolesIn, me: dict = Depends(super_admin_only)):
    """Super Admin: which roles the missing-entry check makes inactive (never Super Admin, Admin, HR)."""
    known = set(all_roles())
    unknown = [r for r in body.roles if r.strip().upper() not in known]
    if unknown:
        raise HTTPException(422, f"Unknown role {unknown[0]}")
    return {"roles": auto_inactive.set_roles(body.roles, me["name"]), "settings": auto_inactive.status()}


@router.put("/{user_id}/admin-access")
def set_admin_access(user_id: str, body: AdminAccessIn, _: dict = Depends(require_roles("MANAGER"))):
    """Super Admin only: give or remove an Admin's access (create batches, Batch Master upload, employees ...)."""
    u = db.users.find_one({"userIdLower": user_id.lower()})
    if not u:
        raise HTTPException(404, "Employee not found")
    if u["role"] != "ADMIN":
        raise HTTPException(400, "Only an Admin account has Admin access to give or remove")
    db.users.update_one({"_id": u["_id"]}, {"$set": {"adminAccess": body.enabled}})
    return public_user(db.users.find_one({"_id": u["_id"]}))


@router.delete("/{user_id}")
def delete_user(user_id: str, me: dict = Depends(super_admin_only)):
    """v60: an employee is no longer deleted (batches, entries and reports keep pointing to them): they are made
    inactive instead. They cannot sign in, but their name still shows in the lists and reports, and they are
    listed in Inactive Employees, where they can be made active again."""
    if me["userIdLower"] == user_id.lower():
        raise HTTPException(400, "You cannot make your own account inactive")
    target = db.users.find_one({"userIdLower": user_id.lower()})
    if not target:
        raise HTTPException(404, "Employee not found")
    if target["role"] == "MANAGER":
        raise HTTPException(400, "The Super Admin account cannot be made inactive")
    if target.get("active", True):
        db.users.update_one({"_id": target["_id"]}, {"$set": {"active": False, "autoInactive": False, "inactiveAt": datetime.now(timezone.utc).isoformat(), "inactiveBy": me["name"], "inactiveReason": "Made inactive by " + me["name"]}})
    return True


@router.get("/inactive/list")
def list_inactive(_: dict = Depends(people_view)):
    """Inactive Employees: everyone who cannot sign in now (made inactive by hand or by the missing-entry check)."""
    return [public_user(u) for u in db.users.find({"active": False}).sort("inactiveAt", -1)]


@router.get("/deleted/list")
def list_deleted(_: dict = Depends(super_admin_only)):  # Super Admin only
    return [public_user(u) for u in db.deleted_users.find().sort("deletedAt", -1)]


@router.get("/deleted/{user_id}")
def deleted_detail(user_id: str, _: dict = Depends(super_admin_only)):
    """One deleted employee with the daily entries and other records saved with them."""
    rec = db.deleted_users.find_one({"userIdLower": user_id.lower()})
    if not rec:
        raise HTTPException(404, "Deleted employee not found")
    out: dict = {"employee": public_user(rec), "entries": [], "halfyearly": [], "biometricDays": 0}
    names = {"daily_entries": "entries", "halfyearly_reports": "halfyearly"}  # v60: Leave / Work assignments removed
    for r in db.db.deleted_records.find({"owner": rec["userIdLower"]}):
        d = {k: v for k, v in r["doc"].items() if k not in ("_id", "searchText")}
        if r["coll"] == "biometric_days":
            out["biometricDays"] += 1
        elif r["coll"] in names:
            out[names[r["coll"]]].append(d)
    for e in out["entries"]:
        e["minutes"] = _minutes(e.get("timeFrom"), e.get("timeTo"))
    out["entries"].sort(key=lambda e: (e.get("activityDate", ""), e.get("timeFrom", "")), reverse=True)
    return out


def _minutes(a: str | None, b: str | None) -> int:
    try:
        ah, am = map(int, a.split(":"))
        bh, bm = map(int, b.split(":"))
        return max(0, bh * 60 + bm - ah * 60 - am)
    except (AttributeError, ValueError):
        return 0


@router.post("/deleted/{user_id}/restore")
def restore_user(user_id: str, me: dict = Depends(super_admin_only)):
    rec = db.deleted_users.find_one({"userIdLower": user_id.lower()})
    if not rec:
        raise HTTPException(404, "Deleted employee not found")
    if db.users.find_one({"userIdLower": rec["userIdLower"]}):
        raise HTTPException(409, f"User ID {rec['userId']} is already used by another employee. Change that employee's User ID first.")
    if db.users.find_one({"code": rec["code"]}):
        raise HTTPException(409, f"Employee code {rec['code']} is already used by another employee. Change that employee's code first.")
    doc = {k: v for k, v in rec.items() if k not in ("_id", "deletedAt", "deletedBy", "recordCounts", "autoInactive", "inactiveReason", "inactiveAt", "inactiveBy")}
    if doc.get("role") not in ("MANAGER", *all_roles()):
        doc["role"] = "FACULTY"  # their role was removed meanwhile
    # Restored as Active; the missing-entry check counts only the working days after today.
    now = datetime.now(timezone.utc).isoformat()
    doc.update(active=True, restoredAt=now, restoredBy=me["name"], reactivatedAt=now, reactivatedBy=me["name"])
    db.users.insert_one(doc)
    # Put their entries and records back where they were.
    for r in list(db.db.deleted_records.find({"owner": rec["userIdLower"]})):
        try:
            db.db[r["coll"]].insert_one(r["doc"])
        except Exception:  # an entry number reused meanwhile: keep the record, give it a new _id
            d = {k: v for k, v in r["doc"].items() if k != "_id"}
            if r["coll"] == "daily_entries":
                d["id"] = f"DAE-{db.next_seq('daily_entry'):04d}"
            db.db[r["coll"]].insert_one(d)
        db.db.deleted_records.delete_one({"_id": r["_id"]})
    db.deleted_users.delete_one({"_id": rec["_id"]})
    return public_user(doc)
