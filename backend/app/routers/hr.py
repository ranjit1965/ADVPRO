"""HR_Report: HR Policy. (Batch Paper Completion and Leave/Permission Form were removed in v46, Your Info in v49.)"""
from datetime import datetime, timezone

import base64
import uuid

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db
from ..security import require_section, current_user

router = APIRouter(prefix="/hr", tags=["hr report"])
HR_ROLES = ("HR", "MIS", "MANAGER", "ADMIN")  # v60: MIS has everything HR has, except the Halfyearly Program Report
hr_only = require_section("hr", roles=("HR", "MIS", "ADMIN"))  # HR / Admin with the HR menu ticked; Super Admin always

DEFAULT_POLICY = (
    "# Working hours\n- Office hours are 9:30 AM to 6:30 PM, Monday to Saturday.\n"
    "- Record every activity in Faculty › Daily Activity › Entry on the same day.\n\n"
    "# Leave\n- Earned Leave (EL) and Casual Leave (CL) are allotted each financial year (April to March).\n"
    "- Inform HR and your Manager before the leave.\n"
    "- Sanction or rejection is at the respective Manager's / Director's discretion.\n\n"
    "# Note\nThis is sample text. HR can replace it with the company policy using the Edit button."
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- policy
class PolicyIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


@router.get("/policy")
def get_policy(_: dict = Depends(current_user)):
    doc = db.db.settings.find_one({"_id": "hrPolicy"}) or {}
    doc.pop("_id", None)
    return {"content": DEFAULT_POLICY, "updatedBy": "HR", "updatedAt": None, **doc}  # v63: + pdf (the uploaded policy PDF)


@router.put("/policy")
def save_policy(body: PolicyIn, user: dict = Depends(hr_only)):
    doc = {"content": body.content, "updatedBy": user["name"], "updatedAt": now()}
    db.db.settings.update_one({"_id": "hrPolicy"}, {"$set": doc}, upsert=True)  # keeps the uploaded PDF
    return doc


# ---------------------------------------------------------------- policy PDF (v63)
# HR uploads the policy PDF; every signed-in user sees it page by page (top to bottom) in HR › HR Policy.
# Vercel allows about 4.5 MB per request, so the file goes up and down in 2 MB parts, kept in
# `hr_policy_files` ({_id: "<file id>|<n>", fileId, n, data}); settings `hrPolicy.pdf` names the current file.
PDF_CHUNK = 2 * 1024 * 1024
PDF_MAX = 40 * 1024 * 1024
files = db.db.hr_policy_files
pdf_roles = require_section("hr", roles=("HR", "ADMIN"))  # HR / Admin (Super Admin always)


class PdfStart(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    size: int = Field(gt=0, le=PDF_MAX)


def _pdf_meta() -> dict | None:
    return (db.db.settings.find_one({"_id": "hrPolicy"}) or {}).get("pdf")


@router.post("/policy/pdf")
def pdf_start(body: PdfStart, _: dict = Depends(pdf_roles)):
    if not body.name.lower().endswith(".pdf"):
        raise HTTPException(422, "Choose a PDF file")
    fid = uuid.uuid4().hex
    files.insert_one({"_id": f"{fid}|meta", "fileId": fid, "name": body.name, "size": body.size, "parts": -(-body.size // PDF_CHUNK), "createdAt": now()})
    return {"fileId": fid, "chunkSize": PDF_CHUNK, "parts": -(-body.size // PDF_CHUNK)}


@router.put("/policy/pdf/{fid}/{n}")
async def pdf_part(fid: str, n: int, request: Request, _: dict = Depends(pdf_roles)):
    meta = files.find_one({"_id": f"{fid}|meta"})
    if not meta or not 0 <= n < meta["parts"]:
        raise HTTPException(404, "Upload not found")
    data = await request.body()
    if not data or len(data) > PDF_CHUNK:
        raise HTTPException(422, "Part too big")
    if n == 0 and not data.startswith(b"%PDF"):
        files.delete_many({"fileId": fid})
        raise HTTPException(422, "This is not a PDF file")
    files.replace_one({"_id": f"{fid}|{n}"}, {"_id": f"{fid}|{n}", "fileId": fid, "n": n, "data": Binary(data)}, upsert=True)
    return {"ok": True}


@router.post("/policy/pdf/{fid}/finish")
def pdf_finish(fid: str, user: dict = Depends(pdf_roles)):
    meta = files.find_one({"_id": f"{fid}|meta"})
    if not meta:
        raise HTTPException(404, "Upload not found")
    got = files.count_documents({"fileId": fid, "n": {"$exists": True}})
    if got != meta["parts"]:
        raise HTTPException(400, f"Upload not complete ({got} of {meta['parts']} parts)")
    old = _pdf_meta()
    pdf = {"fileId": fid, "name": meta["name"], "size": meta["size"], "parts": meta["parts"], "uploadedBy": user["name"], "uploadedAt": now()}
    db.db.settings.update_one({"_id": "hrPolicy"}, {"$set": {"pdf": pdf}}, upsert=True)
    if old and old.get("fileId") != fid:
        files.delete_many({"fileId": old["fileId"]})
    # uploads left unfinished (closed browser): their parts go too
    for m in files.find({"_id": {"$regex": r"\|meta$"}, "fileId": {"$ne": fid}}, {"fileId": 1}):
        files.delete_many({"fileId": m["fileId"]})
    return pdf


@router.get("/policy/pdf/{fid}/{n}")
def pdf_download(fid: str, n: int, _: dict = Depends(current_user)):
    d = files.find_one({"_id": f"{fid}|{n}"})
    if not d:
        raise HTTPException(404, "Part not found")
    return {"n": n, "data": base64.b64encode(bytes(d["data"])).decode()}


@router.delete("/policy/pdf")
def pdf_remove(_: dict = Depends(pdf_roles)):
    old = _pdf_meta()
    if old:
        files.delete_many({"fileId": old["fileId"]})
        db.db.settings.update_one({"_id": "hrPolicy"}, {"$unset": {"pdf": ""}})
    return True
