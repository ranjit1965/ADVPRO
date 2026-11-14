"""One-time cleanup after v46: deletes the data of the features that were removed.

Removed: Master › Registration, Attendence, Product, Old Registrations, Shedulling (work assignments),
Vendor and Assest; HR › Batch Paper Completion (no data of its own) and Leave/Permission Form; My Work;
Transaction (v47, a menu placeholder with no data).

    cd backend
    python -m app.cleanup_removed          # shows what would be deleted
    python -m app.cleanup_removed --yes    # deletes it (cannot be undone; take a mongodump first)
"""
import argparse

from . import db

COLLECTIONS = (
    "master_registrations", "master_attendance", "master_products", "master_oldRegistrations",
    "master_vendors", "master_assets", "work_assignments", "leave_requests",
)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--yes", action="store_true", help="really delete (otherwise only list)")
    a = p.parse_args()
    existing = set(db.db.list_collection_names())
    for name in COLLECTIONS:
        n = db.db[name].count_documents({}) if name in existing else 0
        if a.yes and name in existing:
            db.db[name].drop()
            print(f"Dropped {name} ({n} records)")
        else:
            print(f"{name}: {n} records{' (would be dropped)' if n or name in existing else ''}")
    stale = db.db.deleted_records.count_documents({"coll": {"$in": ["leave_requests", "work_assignments"]}})
    if a.yes:
        db.db.deleted_records.delete_many({"coll": {"$in": ["leave_requests", "work_assignments"]}})
        db.db.roles.update_many({}, {"$unset": {"access.myWork": "", "access.transaction": ""}})
        print(f"Removed {stale} leave / work records kept with deleted employees, and the My Work / Transaction ticks.")
    else:
        print(f"deleted_records (leave / work of deleted employees): {stale}")
        print("\nNothing was deleted. Run again with --yes to delete. Take a backup first (mongodump).")


if __name__ == "__main__":
    main()
