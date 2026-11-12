"""Generic Master screens (Registration, Batch, Attendence, Product, Old Registrations, Vendor, Assest).

Each master is described in masters.json (same file as src/config/masters.json) and stored in
its own collection, master_<key>. Admin and Manager maintain them.
"""
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..security import require_roles

router = APIRouter(prefix="/masters", tags=["masters"])
master_roles = require_roles("MANAGER", "ADMIN")
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
            elif t == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v):
                raise ValueError
            elif t == "select" and v not in f["options"]:
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


@router.get("/{key}")
def list_records(key: str, _: dict = Depends(master_roles)):
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
def delete_records(key: str, body: DeleteManyIn, _: dict = Depends(master_roles)):
    """Deletes the selected records (the ticked rows) in one call."""
    res = collection(key).delete_many({"id": {"$in": list(dict.fromkeys(body.ids))}})
    return {"deleted": res.deleted_count}


@router.put("/{key}/{rec_id}")
def update_record(key: str, rec_id: str, body: dict = Body(...), me: dict = Depends(master_roles)):
    col, defn = collection(key), MASTERS[key]
    rec = validate(defn, body)
    check_unique(defn, col, rec, rec_id)
    rec.update(updatedBy=me["name"], updatedAt=datetime.now(timezone.utc).isoformat())
    if not col.update_one({"id": rec_id}, {"$set": rec}).matched_count:
        raise HTTPException(404, "Record not found")
    return clean(col.find_one({"id": rec_id}))


@router.delete("/{key}/{rec_id}")
def delete_record(key: str, rec_id: str, _: dict = Depends(master_roles)):
    if not collection(key).delete_one({"id": rec_id}).deleted_count:
        raise HTTPException(404, "Record not found")
    return True
