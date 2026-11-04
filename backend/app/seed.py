"""First start: indexes, dropdown option lists and the default HR policy. Safe to run repeatedly."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .mailer import smtp_configured
from .routers.hr import DEFAULT_POLICY

log = logging.getLogger("der.seed")
DATA = json.loads((Path(__file__).parent / "seed_data.json").read_text())

# Dropdown choices kept in the `lookups` collection. People, courses, chapters, batches,
# assets, registrations and every other record are created in the app, never seeded.
OPTION_LISTS = (
    "classIn", "chapterTypes", "sessionTypes", "colleges", "departments", "sections", "yopOptions",
    "marketingTypes", "enquiryFormNos", "materialTypes", "softwareActivities",
    "travelModes", "othersHeadings", "productTypes", "locations",
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


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
