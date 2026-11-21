"""Batch auto Completed (v55): once a batch's end date is today or earlier, its status becomes Completed.

Done once per batch (marked `autoCompletedAt`): if Admin / Super Admin change the status afterwards, it stays
as they set it. Changing the end date clears the mark, so the new end date completes the batch again.
Runs whenever the batches are listed (Master › Batch, the entry form's lookups).
"""
from datetime import datetime, timezone

from . import db
from .auto_inactive import local_today


def auto_complete() -> int:
    today = local_today().isoformat()
    res = db.db.master_batches.update_many(
        {"endDate": {"$nin": [None, ""], "$lte": today}, "status": {"$ne": "Completed"}, "autoCompletedAt": {"$exists": False}},
        {"$set": {"status": "Completed", "autoCompletedAt": datetime.now(timezone.utc).isoformat(), "updatedBy": "System (end date reached)"}},
    )
    return res.modified_count
