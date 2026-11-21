"""Batch auto Completed (v55, v57): a batch becomes Completed once its end date AND its end time have passed.

v57: on the end date the batch stays as it is until the class end time of its Timing (e.g. "10:00 to 12:00"
completes at 12:00 on the end date, local time). A batch without a readable Timing completes when its end
date is over (from the next day).
Done once per batch (marked `autoCompletedAt`): if Admin / Super Admin change the status afterwards, it stays
as they set it. Changing the end date clears the mark, so the new end date completes the batch again.
Runs whenever the batches are listed (Master › Batch, the entry form's lookups).
"""
import re
from datetime import datetime, timezone

from . import db
from .auto_inactive import local_now

_TIME = re.compile(r"(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])?")


def end_time(timing: str | None) -> str | None:
    """'10:00 to 12:00' -> '12:00' (24-hour); also reads '10:00 AM - 1:30 PM'. None when there is no time."""
    found = _TIME.findall(timing or "")
    if not found:
        return None
    h, m, ap = found[-1]
    h, m = int(h), int(m)
    if ap:
        h = h % 12 + (12 if ap.lower() == "pm" else 0)
    if h > 23 or m > 59:
        return None
    return f"{h:02d}:{m:02d}"


def is_over(end_date: str, timing: str | None, now: datetime) -> bool:
    today, clock = now.date().isoformat(), now.strftime("%H:%M")
    if end_date < today:
        return True
    if end_date > today:
        return False
    t = end_time(timing)
    return bool(t) and clock >= t  # end date is today: only after the class end time


def auto_complete(now: datetime | None = None) -> int:
    now = now or local_now()
    col = db.db.master_batches
    due = [
        b["_id"]
        for b in col.find(
            {"endDate": {"$nin": [None, ""], "$lte": now.date().isoformat()}, "status": {"$ne": "Completed"}, "autoCompletedAt": {"$exists": False}},
            {"_id": 1, "endDate": 1, "timing": 1},
        )
        if is_over(str(b["endDate"])[:10], b.get("timing"), now)
    ]
    if not due:
        return 0
    res = col.update_many(
        {"_id": {"$in": due}},
        {"$set": {"status": "Completed", "autoCompletedAt": datetime.now(timezone.utc).isoformat(), "updatedBy": "System (end date and time reached)"}},
    )
    return res.modified_count
