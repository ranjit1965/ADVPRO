"""Course requests: faculty and employees ask Manager / Admin to add a missing course.

The request is saved in `course_requests` and emailed to the addresses in COURSE_REQUEST_EMAILS
(backend/.env); when that is empty, to every active Manager and Admin who has an email address. At the
same time a WhatsApp template message goes to WA_NOTIFY_NUMBERS (see app/whatsapp.py). Both say who sent it. Manager / Admin then add the course in Master › Courses & Chapters
(the request is marked Added) or dismiss it.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from .. import db
from .. import whatsapp
from ..mailer import MailNotConfigured, send_mail
from ..config import settings
from ..schemas import Form
from ..security import current_user, require_roles

router = APIRouter(prefix="/course-requests", tags=["course requests"])
master_roles = require_roles("MANAGER", "ADMIN")


class RequestIn(Form):
    courseName: str = Field(min_length=2, max_length=120)
    courseId: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=500)


class StatusIn(Form):
    status: Literal["Added", "Dismissed"]


def _mail_text(r: dict) -> str:
    off = settings.utc_offset_minutes
    when = datetime.fromisoformat(r["createdAt"]).astimezone(timezone(timedelta(minutes=off))).strftime("%d %b %Y, %I:%M %p")
    zone = "IST" if off == 330 else f"UTC{'+' if off >= 0 else '-'}{abs(off) // 60:02d}:{abs(off) % 60:02d}"
    lines = [
        "Dear Sir / Madam,",
        "",
        "Sub: Request to add a new course in the Daily Entry Report",
        "",
        "I request you to kindly add the following course to the course master, so that it can be",
        "selected in the Faculty Daily Activity Entry.",
        "",
        f"    Course name          : {r['courseName']}",
        f"    Suggested Course ID  : {r.get('courseId') or '-'}",
        f"    Remarks              : {r.get('notes') or '-'}",
        "",
        f"    Requested by         : {r['requestedByName']} ({r['requestedByCode']}), {r['requestedByRole'].title()}",
        f"    Requested on         : {when} ({zone})",
        "",
        "The course can be added in Master > Courses & Chapters, where this request is listed.",
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
def create_request(body: RequestIn, me: dict = Depends(current_user)):
    name = body.courseName.strip()
    if db.courses.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise HTTPException(409, f'A course named "{name}" already exists. Pick it from Course ID.')
    # Fixed addresses from COURSE_REQUEST_EMAILS; only when that is empty, every active Manager / Admin with an email.
    recipients = [e.strip() for e in settings.course_request_emails.split(",") if e.strip()]
    if not recipients:
        recipients = sorted({u["email"] for u in db.users.find({"role": {"$in": ["MANAGER", "ADMIN"]}, "active": True, "email": {"$nin": [None, ""]}}, {"email": 1})})
    if not recipients:
        raise HTTPException(400, "No email address is set for course requests. Set COURSE_REQUEST_EMAILS in backend/.env.")
    r = {
        "id": uuid.uuid4().hex[:12],
        "courseName": name,
        "courseId": (body.courseId or "").strip().upper() or None,
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
        send_mail(recipients, f"Course request from {me['name']}: please add \"{name}\"", _mail_text(r), reply_to=me.get("email") or None)
    except MailNotConfigured as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:  # SMTP refused, network down ...
        raise HTTPException(502, f"The email could not be sent: {e}") from e
    # WhatsApp to Manager / Admin with the sender's name; a failure is recorded but does not stop the request.
    wa = whatsapp.notify({
        "employee": me["name"], "code": me["code"], "employeeCode": f"{me['name']} ({me['code']})",
        "course": name, "courseId": r["courseId"], "remarks": r["notes"],
        "date": datetime.now().strftime("%d-%b-%Y"), "email": me.get("email", ""),
    })
    r["whatsapp"] = wa
    db.db.course_requests.insert_one(dict(r))
    return {"id": r["id"], "emailedTo": len(recipients), "whatsappTo": wa["sent"]}


@router.get("")
def list_requests(status: str | None = "Pending", _: dict = Depends(master_roles)):
    q = {"status": status} if status else {}
    return list(db.db.course_requests.find(q, {"_id": 0}).sort("createdAt", -1))


@router.get("/mine")
def my_requests(me: dict = Depends(current_user)):
    return list(db.db.course_requests.find({"requestedBy": me["userId"]}, {"_id": 0}).sort("createdAt", -1).limit(20))


@router.patch("/{request_id}")
def set_status(request_id: str, body: StatusIn, me: dict = Depends(master_roles)):
    res = db.db.course_requests.update_one(
        {"id": request_id}, {"$set": {"status": body.status, "closedBy": me["name"], "closedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}}
    )
    if not res.matched_count:
        raise HTTPException(404, "Request not found")
    return True
