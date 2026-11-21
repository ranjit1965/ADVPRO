"""Generic Master screens: Batch (Registration, Attendence, Product, Old Registrations, Vendor and Assest were removed in v46).

Each master is described in masters.json (same file as src/config/masters.json) and stored in
its own collection, master_<key>. Admin and Super Admin maintain them.
"""
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import batch_status, db
from ..security import manage_access, super_admin_only, is_super_admin, require_section, require_roles

router = APIRouter(prefix="/masters", tags=["masters"])
master_roles = manage_access  # Master or Admin menu, or HR menu for HR / Admin roles; Super Admin always
MASTERS = {m["key"]: m for m in json.loads((Path(__file__).parent.parent / "masters.json").read_text())["masters"]}
SYSTEM = {"id", "createdBy", "createdAt", "updatedBy", "updatedAt"}


class DeleteManyIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=50_000)


def collection(key: str):
    if key not in MASTERS:
        raise HTTPException(404, "Unknown master")
    return db.db[f"master_{key}"]


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def validate(defn: dict, body: dict) -> dict:
    """Keeps only defined fields and checks required, number, date, time, email and choice rules."""
    out: dict[str, Any] = {}
    for f in defn["fields"]:
        v = body.get(f["key"])
        if f.get("hidden"):  # not on the form (filled by the BatchMaster import): keep what was sent
            out[f["key"]] = v.strip() if isinstance(v, str) else (v if v is not None else "")
            continue
        cond = f.get("showIf")  # shown (and required) only when another field has that value
        if cond and any(str(body.get(k) or "").strip() != val for k, val in cond.items()):
            out[f["key"]] = ""
            continue
        if isinstance(v, str):
            v = v.strip()
        if v in (None, ""):
            if f.get("required"):
                raise HTTPException(422, f"{f['label']} is required")
            out[f["key"]] = ""
            continue
        t = f["type"]
        try:
            if t == "number":
                v = float(v)
                v = int(v) if v.is_integer() else v
            elif t == "date":
                date.fromisoformat(v)
            elif t == "time" and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                raise ValueError
            elif t == "phone" and not re.fullmatch(r"[0-9+\- ]{6,15}", v):
                raise ValueError
            elif t == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v):
                raise ValueError
            elif t in ("select", "toggle") and v not in f["options"]:
                raise ValueError
            elif t == "timerange":  # "HH:MM to HH:MM", To after From
                m = re.fullmatch(r"((?:[01]\d|2[0-3]):[0-5]\d) to ((?:[01]\d|2[0-3]):[0-5]\d)", v)
                if not m or m.group(2) <= m.group(1):
                    raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(422, f"{f['label']} is not valid")
        out[f["key"]] = v
    return out


def check_unique(defn: dict, col, rec: dict, ignore_id: str | None = None) -> None:
    u = defn.get("unique")
    if not u or rec.get(u) in (None, ""):
        return
    q: dict = {u: {"$regex": f"^{re.escape(str(rec[u]))}$", "$options": "i"}}
    if ignore_id:
        q["id"] = {"$ne": ignore_id}
    if col.find_one(q):
        label = next(f["label"] for f in defn["fields"] if f["key"] == u)
        raise HTTPException(409, f'{label} "{rec[u]}" already exists')


@router.get("")
def list_masters(_: dict = Depends(master_roles)):
    return list(MASTERS.values())


@router.get("/externalFaculty/report")
def external_faculty_report(month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"), status: str | None = None, _: dict = Depends(master_roles)):
    """External Faculty › Generate Report (v55): the batches of external faculty that run in the month
    (start on or before its last day, end on or after its first day), optionally only one batch status."""
    import calendar  # noqa: PLC0415

    batch_status.auto_complete()
    y, m = map(int, month.split("-"))
    first, last = f"{month}-01", f"{month}-{calendar.monthrange(y, m)[1]:02d}"
    q: dict = {"externalFacultyId": {"$nin": [None, ""]}, "startDate": {"$lte": last}, "$or": [{"endDate": {"$gte": first}}, {"endDate": {"$in": [None, ""]}}]}
    if status:
        q["status"] = status
    fac = {x["id"]: x for x in db.db.master_externalFaculty.find({}, {"_id": 0})}
    courses = {c["id"]: c.get("name", "") for c in db.courses.find({}, {"_id": 0, "id": 1, "name": 1})}
    rows = []
    for b in db.db.master_batches.find(q, {"_id": 0}).sort([("startDate", 1), ("batchNo", 1)]):
        f = fac.get(b["externalFacultyId"], {})
        rows.append({
            "facultyId": b["externalFacultyId"], "facultyName": f.get("name", b["externalFacultyId"]), "phone": f.get("phone", ""), "email": f.get("email", ""),
            "batchNo": b.get("batchNo", ""), "courseId": b.get("courseId", ""), "courseName": courses.get(b.get("courseId", ""), ""),
            "startDate": b.get("startDate", ""), "endDate": b.get("endDate", ""), "timing": b.get("timing", ""),
            "mode": b.get("mode", ""), "classMode": b.get("classMode", ""), "status": b.get("status", ""),
        })
    rows.sort(key=lambda r: (r["facultyName"].lower(), r["startDate"], r["batchNo"]))
    return {"month": month, "status": status or "", "rows": rows, "faculty": len({r["facultyId"] for r in rows})}


@router.get("/{key}")
def list_records(key: str, _: dict = Depends(master_roles)):
    if key == "batches":
        batch_status.auto_complete()  # end date reached: Completed (once; Admin can change it back)
    return [clean(d) for d in collection(key).find().sort("id", 1)]


@router.post("/{key}", status_code=201)
def create_record(key: str, body: dict = Body(...), me: dict = Depends(master_roles)):
    col, defn = collection(key), MASTERS[key]
    rec = validate(defn, body)
    check_unique(defn, col, rec)
    rec.update(id=f"{defn['idPrefix']}-{db.next_seq('master_' + key):04d}", createdBy=me["name"], createdAt=datetime.now(timezone.utc).isoformat())
    col.insert_one(rec)
    return clean(rec)


@router.post("/{key}/delete-many")
def delete_records(key: str, body: DeleteManyIn, _: dict = Depends(super_admin_only)):
    """Deletes the selected records (the ticked rows) in one call."""
    res = collection(key).delete_many({"id": {"$in": list(dict.fromkeys(body.ids))}})
    return {"deleted": res.deleted_count}


@router.put("/{key}/{rec_id}")
def update_record(key: str, rec_id: str, body: dict = Body(...), me: dict = Depends(master_roles)):
    col, defn = collection(key), MASTERS[key]
    rec = validate(defn, body)
    check_unique(defn, col, rec, rec_id)
    rec.update(updatedBy=me["name"], updatedAt=datetime.now(timezone.utc).isoformat())
    upd: dict = {"$set": rec}
    if key == "batches":
        old = col.find_one({"id": rec_id}, {"endDate": 1}) or {}
        if rec.get("endDate") and rec.get("endDate") != old.get("endDate"):
            upd["$unset"] = {"autoCompletedAt": ""}  # a new end date completes the batch again when reached
    if not col.update_one({"id": rec_id}, upd).matched_count:
        raise HTTPException(404, "Record not found")
    return clean(col.find_one({"id": rec_id}))


@router.delete("/{key}/{rec_id}")
def delete_record(key: str, rec_id: str, _: dict = Depends(super_admin_only)):
    if not collection(key).delete_one({"id": rec_id}).deleted_count:
        raise HTTPException(404, "Record not found")
    return True
