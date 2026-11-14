from pymongo import ASCENDING, MongoClient

from .config import settings

client = MongoClient(settings.mongodb_uri, tz_aware=True)
db = client[settings.mongodb_db]

users = db.users
entries = db.daily_entries
lookups = db.lookups  # one document per list: {_id: "colleges", values: [...]}
plans = db.monthly_plans
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
    plans.create_index("id", unique=True)
    plans.create_index("month")
    plans.create_index("assignedTo")
    marks.create_index([("batchNo", ASCENDING), ("courseId", ASCENDING), ("examType", ASCENDING)], unique=True)
    for key in ("batches",):
        db[f"master_{key}"].create_index("id", unique=True)
    db.halfyearly_reports.create_index("id", unique=True)
    db.halfyearly_reports.create_index("employeeCode")
    for key in ("batches",):
        db[f"master_{key}"].create_index("id", unique=True)
    courses.create_index("id", unique=True)
    chapters.create_index([("courseId", ASCENDING), ("no", ASCENDING)], unique=True)
    db.deleted_records.create_index("owner")
    db.batch_requests.create_index("id", unique=True)
    otps.create_index("expiresAt", expireAfterSeconds=0)  # Mongo removes expired codes


def next_seq(name: str) -> int:
    doc = counters.find_one_and_update({"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return doc["seq"]
