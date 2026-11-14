"""First start: indexes, dropdown option lists and the default HR policy. Safe to run repeatedly."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .mailer import smtp_configured
from .routers.hr import DEFAULT_POLICY
from .security import ensure_roles

log = logging.getLogger("der.seed")
DATA = json.loads((Path(__file__).parent / "seed_data.json").read_text())

# Dropdown choices kept in the `lookups` collection. People, courses, chapters, batches,
# assets, registrations and every other record are created in the app, never seeded.
OPTION_LISTS = (
    "classIn", "chapterTypes", "sessionTypes", "colleges", "departments", "sections", "yopOptions",
    "marketingTypes", "enquiryFormNos", "materialTypes", "softwareActivities",
    "travelModes", "othersHeadings", "productTypes", "locations",
    "slMaterialTheory", "slMaterialPractical",
)


def run() -> None:
    db.ensure_indexes()
    lists = DATA["lookups"]
    for kind in OPTION_LISTS:
        db.lookups.update_one({"_id": kind}, {"$setOnInsert": {"values": lists.get(kind, [])}}, upsert=True)
    db.db.settings.update_one(
        {"_id": "hrPolicy"},
        {"$setOnInsert": {"content": DEFAULT_POLICY, "updatedBy": "System", "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    migrate()
    ensure_roles()  # roles collection (built-in roles + roles the Manager creates)
    if not smtp_configured():
        log.warning("SMTP is not configured: manager sign-up codes cannot be emailed until backend/.env has the SMTP_* settings.")


def migrate() -> None:
    """One-time data changes, each recorded in the `migrations` collection so it runs once."""
    done = {m["_id"] for m in db.db.migrations.find({}, {"_id": 1})}

    def once(key: str, fn) -> None:
        if key in done:
            return
        fn()
        db.db.migrations.insert_one({"_id": key, "at": datetime.now(timezone.utc)})
        log.info("Migration applied: %s", key)

    # Course Preparation has a new material list; the Preparation Type field is gone.
    once("2026-10-material-types", lambda: db.lookups.update_one({"_id": "materialTypes"}, {"$set": {"values": DATA["lookups"]["materialTypes"]}}, upsert=True))
    # Learning / Preparation was split in two tabs: Self Learning and Knowledge Sharing entries move to their own type.
    once(
        "2026-10-split-learning",
        lambda: db.entries.update_many({"activityType": "learning", "details.learningType": {"$in": ["Self Learning", "Knowledge Sharing"]}}, {"$set": {"activityType": "selfLearning"}}),
    )
    # New choices: Class in "Advantage Pro" and Today's Session Type "LAB Creation".
    once(
        "2026-11-classin-lab-creation",
        lambda: (
            db.lookups.update_one({"_id": "classIn"}, {"$addToSet": {"values": "Advantage Pro"}}, upsert=True),
            db.lookups.update_one({"_id": "sessionTypes"}, {"$addToSet": {"values": "LAB Creation"}}, upsert=True),
        ),
    )
    # Others no longer offers breaks, training or meetings: those go in the Faculty Development tab.
    once(
        "2026-11-others-headings",
        lambda: db.lookups.update_one({"_id": "othersHeadings"}, {"$pull": {"values": {"$in": ["Lunch Break", "Lunch break", "Training Attended", "Staff Meeting", "Tea Break", "Tea break"]}}}),
    )
    # Breaks are entered in Others again (not part of performance); Faculty Development keeps the meetings.
    # Break entries saved under Faculty Development move to Others with the same heading and remarks.
    def breaks_to_others():
        db.lookups.update_one({"_id": "othersHeadings"}, {"$addToSet": {"values": {"$each": ["Lunch Break", "Tea Break"]}}}, upsert=True)
        for e in db.entries.find({"activityType": "facultyDevelopment", "details.fdType": {"$in": ["Lunch Break", "Tea Break"]}}, {"id": 1, "details": 1}):
            d = e.get("details") or {}
            db.entries.update_one({"id": e["id"]}, {"$set": {"activityType": "others", "details": {"heading": d.get("fdType"), "remarks": d.get("remarks", "")}}})

    once("2026-11-breaks-in-others", breaks_to_others)
    # Today's Session Type gets "Coding" (Class and Knowledge Sharing use the same list).
    once("2026-11-session-type-coding", lambda: db.lookups.update_one({"_id": "sessionTypes"}, {"$addToSet": {"values": "Coding"}}, upsert=True))
    # Marketing Support: Label Printout becomes "Lab Creation - Check" and DataBase Creation/Download moves in as a type.
    once("2026-11-marketing-lab-database", lambda: db.lookups.update_one({"_id": "marketingTypes"}, {"$set": {"values": DATA["lookups"]["marketingTypes"]}}, upsert=True))

    # Batch Mode is Center or At College, with Online / Offline asked separately.
    def batch_modes():
        b = db.db.master_batches
        b.update_many({"mode": "Online"}, {"$set": {"mode": "Center", "classMode": "Online"}})
        b.update_many({"mode": "Outstation"}, {"$set": {"mode": "At College", "classMode": "Offline"}})
        b.update_many({"classMode": {"$exists": False}}, {"$set": {"classMode": "Offline"}})

    once("2026-11-batch-mode-online-offline", batch_modes)
    # Halfyearly Program Report: the Period field (6 Months / Quarter) was removed; H1 to H6 stays.
    once("2026-11-halfyearly-remove-period", lambda: db.db.halfyearly_reports.update_many({"period": {"$exists": True}}, {"$unset": {"period": ""}}))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
