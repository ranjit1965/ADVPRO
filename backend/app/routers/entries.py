import re
from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from .. import db
from ..security import current_user

router = APIRouter(prefix="/daily-entries", tags=["daily entries"])

ACTIVITY_TYPES = ("class", "seminar", "marketing", "learning", "selfLearning", "facultyDevelopment", "database", "travelling", "software", "others", "systemFault")
RETIRED_TYPES = {"software": "Software", "systemFault": "System Fault"}  # old entries only; no new ones
TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"
SORTABLE = {"activityDate", "timeFrom", "facultyName", "activityType", "createdAt", "minutes", "id"}


def minutes_between(a: str, b: str) -> int:
    ah, am = map(int, a.split(":"))
    bh, bm = map(int, b.split(":"))
    return max(0, bh * 60 + bm - ah * 60 - am)


def with_minutes(e: dict) -> dict:
    e.pop("_id", None)
    e["minutes"] = minutes_between(e["timeFrom"], e["timeTo"])
    return e


class EntryIn(BaseModel):
    facultyCode: str
    activityDate: date
    facultyIn: Literal["Center", "Outstation"]
    timeFrom: str = Field(pattern=TIME_RE)
    timeTo: str = Field(pattern=TIME_RE)
    activityType: Literal[ACTIVITY_TYPES]  # type: ignore[valid-type]
    details: dict[str, Any] = {}
    outstation: dict[str, Any] | None = None

    @field_validator("activityDate")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Activity date cannot be in the future")
        return v

    @field_validator("activityType")
    @classmethod
    def not_retired(cls, v: str) -> str:
        if v in RETIRED_TYPES:
            raise ValueError(f"{RETIRED_TYPES[v]} entries are no longer recorded")
        return v

    @model_validator(mode="after")
    def time_order(self):
        if self.timeTo <= self.timeFrom:
            raise ValueError("Time To must be after Time From")
        return self


def can_touch(user: dict, faculty_code: str) -> None:
    # Faculty, staff and HR only record and change their own activity (HR reads everyone's, read-only).
    if user["role"] not in ("MANAGER", "ADMIN") and user["code"] != faculty_code:
        raise HTTPException(403, "You can only manage your own entries")


def check_overlap(p: dict, ignore_id: str | None = None) -> None:
    q = {"facultyCode": p["facultyCode"], "activityDate": p["activityDate"], "timeFrom": {"$lt": p["timeTo"]}, "timeTo": {"$gt": p["timeFrom"]}}
    if ignore_id:
        q["id"] = {"$ne": ignore_id}
    clash = db.entries.find_one(q)
    if clash:
        raise HTTPException(409, f"Time overlaps with another entry on this day ({clash['timeFrom']}–{clash['timeTo']})")


def check_others_limit(p: dict, ignore_id: str | None = None) -> None:
    """Others over 1 hour is now allowed after the faculty confirms "Are you sure?" in the form."""
    return None


def build_query(q=None, facultyCode=None, activityType=None, facultyIn=None, dateFrom=None, dateTo=None) -> dict:
    f: dict = {}
    if facultyCode:
        f["facultyCode"] = facultyCode
    if activityType:
        f["activityType"] = activityType
    if facultyIn:
        f["facultyIn"] = facultyIn
    if dateFrom or dateTo:
        f["activityDate"] = {**({"$gte": dateFrom} if dateFrom else {}), **({"$lte": dateTo} if dateTo else {})}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        f["$or"] = [{"id": rx}, {"facultyName": rx}, {"facultyCode": rx}, {"activityType": rx}, {"searchText": rx}]
    return f


def search_text(p: dict) -> str:
    vals = list((p.get("details") or {}).values()) + list((p.get("outstation") or {}).values())
    return " ".join(str(v) for v in vals if v not in (None, ""))


@router.get("")
def list_entries(
    user: dict = Depends(current_user),
    q: str | None = None,
    facultyCode: str | None = None,
    activityType: str | None = None,
    facultyIn: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    sortBy: str = "activityDate",
    sortDir: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    pageSize: int = Query(0, ge=0, le=500),
):
    f = build_query(q, facultyCode, activityType, facultyIn, dateFrom, dateTo)
    total = db.entries.count_documents(f)
    d = 1 if sortDir == "asc" else -1
    key = sortBy if sortBy in SORTABLE and sortBy != "minutes" else "activityDate"
    cur = db.entries.find(f, {"searchText": 0}).sort([(key, d), ("timeFrom", d)])
    if pageSize:
        cur = cur.skip((page - 1) * pageSize).limit(pageSize)
    items = [with_minutes(e) for e in cur]
    if sortBy == "minutes":
        items.sort(key=lambda e: e["minutes"], reverse=d < 0)
    return {"items": items, "total": total}


@router.get("/{entry_id}")
def get_entry(entry_id: str, _: dict = Depends(current_user)):
    e = db.entries.find_one({"id": entry_id}, {"searchText": 0})
    if not e:
        raise HTTPException(404, "Entry not found")
    return with_minutes(e)


def faculty_or_404(code: str) -> dict:
    f = db.users.find_one({"code": code})
    if not f:
        raise HTTPException(400, "Unknown faculty")
    return f


@router.post("", status_code=201)
def create_entry(body: EntryIn, user: dict = Depends(current_user)):
    p = body.model_dump(mode="json")
    can_touch(user, p["facultyCode"])
    check_overlap(p)
    check_others_limit(p)
    fac = faculty_or_404(p["facultyCode"])
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        **p,
        "id": f"DAE-{db.next_seq('daily_entry'):04d}",
        "facultyName": fac["name"],
        "department": fac.get("department", ""),
        "createdBy": user["name"],
        "createdAt": now,
        "updatedAt": now,
        "searchText": search_text(p),
    }
    db.entries.insert_one(doc)
    doc.pop("searchText")
    return with_minutes(doc)


@router.put("/{entry_id}")
def update_entry(entry_id: str, body: EntryIn, user: dict = Depends(current_user)):
    old = db.entries.find_one({"id": entry_id})
    if not old:
        raise HTTPException(404, "Entry not found")
    p = body.model_dump(mode="json")
    can_touch(user, old["facultyCode"])
    can_touch(user, p["facultyCode"])
    check_overlap(p, entry_id)
    check_others_limit(p, entry_id)
    fac = faculty_or_404(p["facultyCode"])
    p.update(facultyName=fac["name"], department=fac.get("department", ""), updatedBy=user["name"], updatedAt=datetime.now(timezone.utc).isoformat(), searchText=search_text(p))
    db.entries.update_one({"id": entry_id}, {"$set": p})
    return with_minutes(db.entries.find_one({"id": entry_id}, {"searchText": 0}))


@router.delete("/{entry_id}")
def delete_entry(entry_id: str, user: dict = Depends(current_user)):
    old = db.entries.find_one({"id": entry_id})
    if not old:
        raise HTTPException(404, "Entry not found")
    can_touch(user, old["facultyCode"])
    db.entries.delete_one({"id": entry_id})
    return True
