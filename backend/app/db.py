from pymongo import ASCENDING, MongoClient

from .config import settings

client = MongoClient(settings.mongodb_uri, tz_aware=True)
db = client[settings.mongodb_db]

users = db.users
entries = db.daily_entries
lookups = db.lookups  # one document per list: {_id: "colleges", values: [...]}
marks = db.student_marks
otps = db.manager_otps
counters = db.counters
notifications = db.notifications
courses = db.courses
chapters = db.chapters
deleted_users = db.deleted_users  # employees deleted in Master › Employees, can be restored


def ensure_indexes() -> None:
    users.create_index("userIdLower", unique=True)
    users.create_index("code", unique=True)
    entries.create_index("id", unique=True)
    entries.create_index([("facultyCode", ASCENDING), ("activityDate", ASCENDING), ("timeFrom", ASCENDING)])
    entries.create_index("activityDate")
    db.biometric_days.create_index([("code", ASCENDING), ("date", ASCENDING)])
    db.biometric_days.create_index("date")
    marks.create_index([("batchNo", ASCENDING), ("courseId", ASCENDING), ("examType", ASCENDING)], unique=True)
    for key in ("batches",):
        db[f"master_{key}"].create_index("id", unique=True)
    db.master_externalFaculty.create_index("id")
    db.halfyearly_reports.create_index("id", unique=True)
    db.halfyearly_reports.create_index("employeeCode")
    # v60 (also in db/create_database.mongodb.js)
    db.external_certifications.create_index("id", unique=True)  # new in v60: no older data
    db.external_certifications.create_index("facultyId")
    db.day_declarations.create_index([("code", ASCENDING), ("date", ASCENDING)])
    db.incentives.create_index([("month", ASCENDING), ("facultyCode", ASCENDING)])  # v62
    courses.create_index("id", unique=True)
    chapters.create_index([("courseId", ASCENDING), ("no", ASCENDING)], unique=True)
    db.deleted_records.create_index("owner")
    db.batch_requests.create_index("id", unique=True)
    otps.create_index("expiresAt", expireAfterSeconds=0)  # Mongo removes expired codes


def next_seq(name: str) -> int:
    doc = counters.find_one_and_update({"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return doc["seq"]
