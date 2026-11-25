"""One-time cleanup after v46: deletes the data of the features that were removed.

Removed: Master › Registration, Attendence, Product, Old Registrations, Shedulling (work assignments),
Vendor and Assest; HR › Batch Paper Completion (no data of its own) and Leave/Permission Form; My Work;
Transaction (v47, a menu placeholder with no data); Monthly Plan (v48, monthly_plans);
HR › Your Info (v49: PF / bank account, EL / CL, absent days and ratings saved on each employee as `hr`).
v60: every collection the app no longer uses (anything not in USED below, e.g. leave_requests, master_assets,
master_attendance, master_oldRegistrations), Grade / Department / Designation on employees (the app also
removes these itself on start) and the Halfyearly "Required" column.

    cd backend
    python -m app.cleanup_removed          # shows what would be deleted
    python -m app.cleanup_removed --yes    # deletes it (cannot be undone; take a mongodump first)
"""
import argparse

from . import db

COLLECTIONS = (
    "master_registrations", "master_attendance", "master_products", "master_oldRegistrations",
    "master_vendors", "master_assets", "work_assignments", "leave_requests", "monthly_plans",
)
# v60: the collections the app uses (same list as db/create_database.mongodb.js). Any other one is unused.
USED = {
    "users", "deleted_users", "deleted_records", "daily_entries", "day_declarations", "lookups", "settings", "roles",
    "migrations", "counters", "manager_otps", "notifications", "student_marks", "courses", "chapters",
    "course_requests", "batch_requests", "master_batches", "master_externalFaculty", "external_faculty_bank",
    "external_certifications", "biometric_days", "biometric_months", "biometric_unmatched", "staff_attendance",
    "holidays", "place_contacts", "halfyearly_reports", "hr_mail_templates", "celebration_seen", "celebration_sent",
}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--yes", action="store_true", help="really delete (otherwise only list)")
    a = p.parse_args()
    existing = set(db.db.list_collection_names())
    unused = sorted(n for n in existing if n not in USED and not n.startswith("system."))
    for name in dict.fromkeys([*COLLECTIONS, *unused]):
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
    your_info = db.users.count_documents({"hr": {"$exists": True}})
    if a.yes:
        db.users.update_many({"hr": {"$exists": True}}, {"$unset": {"hr": ""}})
        db.db.deleted_users.update_many({"hr": {"$exists": True}}, {"$unset": {"hr": ""}})
        print(f"Removed the Your Info details of {your_info} employee(s).")
    old_fields = db.users.count_documents({"$or": [{"grade": {"$exists": True}}, {"department": {"$exists": True}}, {"designation": {"$exists": True}}]})
    cleared = db.db.halfyearly_reports.count_documents({"targets.cleared": {"$exists": True}})
    if a.yes:
        for c in (db.users, db.db.deleted_users):
            c.update_many({}, {"$unset": {"grade": "", "department": "", "designation": ""}})
        db.entries.update_many({"department": {"$exists": True}}, {"$unset": {"department": ""}})
        db.db.halfyearly_reports.update_many({"targets.cleared": {"$exists": True}}, {"$unset": {"targets.$[].cleared": ""}})
        print(f"Removed Grade / Department / Designation from {old_fields} employee(s) and the Required value from {cleared} Halfyearly row(s).")
    else:
        print(f"Employees with Grade / Department / Designation: {old_fields}")
        print(f"Halfyearly rows with the Required value: {cleared}")
        print(f"deleted_records (leave / work of deleted employees): {stale}")
        print(f"Your Info details saved on employees: {your_info}")
        print("\nNothing was deleted. Run again with --yes to delete. Take a backup first (mongodump).")


if __name__ == "__main__":
    main()
