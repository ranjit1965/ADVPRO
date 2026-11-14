from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from .. import auto_inactive, db
from ..schemas import Form
from ..security import all_roles, current_user, hash_password, public_user, require_roles, require_section, sections_for

router = APIRouter(prefix="/users", tags=["users"])
manager_only = require_section("master")  # Master › Employees (Master menu ticked for the role)


def people_view(user: dict = Depends(current_user)) -> dict:
    """Employee list: anyone with the Master menu, or HR / Admin with the HR menu (read-only for HR)."""
    access = sections_for(user)
    if user["role"] == "MANAGER" or access["master"] or (access["hr"] and user["role"] in ("HR", "ADMIN")):
        return user
    raise HTTPException(403, "You do not have access to this menu. Ask the Manager.")


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
        raise HTTPException(422, f"Unknown role {role}. The Manager adds roles in Master › Role Access.")
    return role


class UserIn(Form):
    userId: str = Field(pattern=r"^[A-Za-z0-9._-]{3,}$")
    code: str = Field(pattern=r"^[A-Za-z]{2,5}$")
    name: str = Field(min_length=1)
    email: EmailStr | None = None
    role: str = "FACULTY"
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
    doc["role"] = check_role(body.role)
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
        if patch["role"] != "MANAGER":
            patch["role"] = check_role(patch["role"])
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
    if db.deleted_users.find_one({"userIdLower": record["userIdLower"]}):
        raise HTTPException(409, "An employee with this User ID is already in Deleted employees. Restore or remove that one first.")
    # Their entries and other records move with them, so reports no longer count them until restored.
    counts = {}
    for coll, field, key in OWNED:
        docs = list(db.db[coll].find({field: target.get(key)}))
        if docs:
            db.db.deleted_records.insert_many([{"owner": record["userIdLower"], "coll": coll, "doc": d} for d in docs])
            db.db[coll].delete_many({"_id": {"$in": [d["_id"] for d in docs]}})
        counts[coll] = len(docs)
    record["recordCounts"] = counts
    db.deleted_users.insert_one(record)
    db.users.delete_one({"_id": target["_id"]})
    return True


@router.get("/deleted/list")
def list_deleted(_: dict = Depends(manager_only)):
    return [public_user(u) for u in db.deleted_users.find().sort("deletedAt", -1)]


@router.get("/deleted/{user_id}")
def deleted_detail(user_id: str, _: dict = Depends(manager_only)):
    """One deleted employee with the daily entries and other records saved with them."""
    rec = db.deleted_users.find_one({"userIdLower": user_id.lower()})
    if not rec:
        raise HTTPException(404, "Deleted employee not found")
    out: dict = {"employee": public_user(rec), "entries": [], "leave": [], "work": [], "halfyearly": [], "biometricDays": 0}
    names = {"daily_entries": "entries", "halfyearly_reports": "halfyearly", "leave_requests": "leave", "work_assignments": "work"}  # leave / work: older deletes only
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
def restore_user(user_id: str, me: dict = Depends(manager_only)):
    rec = db.deleted_users.find_one({"userIdLower": user_id.lower()})
    if not rec:
        raise HTTPException(404, "Deleted employee not found")
    if db.users.find_one({"userIdLower": rec["userIdLower"]}):
        raise HTTPException(409, f"User ID {rec['userId']} is already used by another employee. Change that employee's User ID first.")
    if db.users.find_one({"code": rec["code"]}):
        raise HTTPException(409, f"Employee code {rec['code']} is already used by another employee. Change that employee's code first.")
    doc = {k: v for k, v in rec.items() if k not in ("_id", "deletedAt", "deletedBy", "recordCounts", "autoInactive", "inactiveReason", "inactiveAt", "inactiveBy")}
    if doc.get("role") not in ("MANAGER", *all_roles()):
        doc["role"] = "STAFF"  # their role was removed meanwhile
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
