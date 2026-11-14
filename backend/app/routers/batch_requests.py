"""Batch No requests: faculty ask Manager / Admin for a batch number from the Class entry.

Same as course requests: saved in `batch_requests`, emailed to COURSE_REQUEST_EMAILS (or every active
Manager / Admin with an email) and sent on WhatsApp to WA_NOTIFY_NUMBERS with the sender's name.
Manager / Admin see the pending ones in Master › Course and mark them Done or Dismissed.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from .. import db, whatsapp
from ..config import settings
from ..mailer import MailNotConfigured, send_mail
from ..schemas import Form
from ..security import current_user, require_section

router = APIRouter(prefix="/batch-requests", tags=["batch requests"])
master_roles = require_section("master", "admin")  # Master or Admin menu ticked for the role


class BatchRequestIn(Form):
    courseId: str = Field(min_length=1, max_length=40)
    startDate: str | None = Field(default=None, max_length=10)
    batchTime: str | None = Field(default=None, max_length=40)
    students: int | None = Field(default=None, ge=0, le=999)
    notes: str | None = Field(default=None, max_length=500)


class StatusIn(Form):
    status: Literal["Done", "Dismissed"]


def _recipients() -> list[str]:
    fixed = [e.strip() for e in settings.course_request_emails.split(",") if e.strip()]
    if fixed:
        return fixed
    return sorted({u["email"] for u in db.users.find({"role": {"$in": ["MANAGER", "ADMIN"]}, "active": True, "email": {"$nin": [None, ""]}}, {"email": 1})})


def _mail_text(r: dict) -> str:
    off = settings.utc_offset_minutes
    when = datetime.fromisoformat(r["createdAt"]).astimezone(timezone(timedelta(minutes=off))).strftime("%d %b %Y, %I:%M %p")
    lines = [
        "Dear Sir / Madam,",
        "",
        "Sub: Request for a Batch No in the Daily Entry Report",
        "",
        "I request you to kindly create / assign a batch number for my class, so that it can be",
        "selected in the Faculty Daily Activity Entry (Class).",
        "",
        f"    Course ID            : {r['courseId']} {('- ' + r['courseName']) if r.get('courseName') else ''}",
        f"    Batch start date     : {r.get('startDate') or '-'}",
        f"    Batch time           : {r.get('batchTime') or '-'}",
        f"    No of students       : {r.get('students') if r.get('students') is not None else '-'}",
        f"    Remarks              : {r.get('notes') or '-'}",
        "",
        f"    Requested by         : {r['requestedByName']} ({r['requestedByCode']}), {r['requestedByRole'].title()}",
        f"    Requested on         : {when}",
        "",
        "The batch can be added in Master > Batch or Batch Import; this request is listed in Master > Course.",
        "",
        "Thank you.",
        "",
        "Regards,",
        r["requestedByName"],
        "",
        "--",
        "Sent from Daily Entry Report, Advantage Pro",
    ]
    return "\n".join(lines)


@router.post("", status_code=201)
def create_request(body: BatchRequestIn, me: dict = Depends(current_user)):
    recipients = _recipients()
    if not recipients:
        raise HTTPException(400, "No email address is set for requests. Set COURSE_REQUEST_EMAILS in backend/.env.")
    cid = body.courseId.strip().upper()
    course = db.courses.find_one({"id": cid}) or {}
    r = {
        "id": uuid.uuid4().hex[:12],
        "courseId": cid,
        "courseName": course.get("name", ""),
        "startDate": (body.startDate or "").strip() or None,
        "batchTime": (body.batchTime or "").strip() or None,
        "students": body.students,
        "notes": (body.notes or "").strip() or None,
        "requestedBy": me["userId"],
        "requestedByName": me["name"],
        "requestedByCode": me["code"],
        "requestedByRole": me["role"],
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "Pending",
        "emailedTo": recipients,
    }
    try:
        send_mail(recipients, f"Batch No request from {me['name']}: {cid}", _mail_text(r), reply_to=me.get("email") or None)
    except MailNotConfigured as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:  # SMTP refused, network down ...
        raise HTTPException(502, f"The email could not be sent: {e}") from e
    # Same WhatsApp template as course requests; "course" says it is a Batch No request.
    remarks = " · ".join(x for x in [r["startDate"] and f"start {r['startDate']}", r["batchTime"], r["students"] is not None and f"{r['students']} students", r["notes"]] if x)
    wa = whatsapp.notify({
        "employee": me["name"], "code": me["code"], "employeeCode": f"{me['name']} ({me['code']})",
        "course": f"Batch No request: {cid} {r['courseName']}".strip(), "courseId": cid, "remarks": remarks or "-",
        "date": datetime.now().strftime("%d-%b-%Y"), "email": me.get("email", ""),
    })
    r["whatsapp"] = wa
    db.db.batch_requests.insert_one(dict(r))
    return {"id": r["id"], "emailedTo": len(recipients), "whatsappTo": wa["sent"]}


@router.get("")
def list_requests(status: str | None = "Pending", _: dict = Depends(master_roles)):
    q = {"status": status} if status else {}
    return list(db.db.batch_requests.find(q, {"_id": 0}).sort("createdAt", -1))


@router.patch("/{request_id}")
def set_status(request_id: str, body: StatusIn, me: dict = Depends(master_roles)):
    res = db.db.batch_requests.update_one(
        {"id": request_id}, {"$set": {"status": body.status, "closedBy": me["name"], "closedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}}
    )
    if not res.matched_count:
        raise HTTPException(404, "Request not found")
    return True
