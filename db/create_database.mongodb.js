// Daily Entry Report (v60): creates every collection the app uses, with its indexes.
// Run once on a new database (safe to run again: existing collections and indexes are kept):
//
//     mongosh "<MONGODB_URI>" db/create_database.mongodb.js
//
// The database name is MONGODB_DB in backend/.env (default below). The backend fills the dropdown values,
// roles, the first Super Admin and the migrations itself the first time it starts.
// Unused collections of older versions are removed by:  cd backend && python -m app.cleanup_removed --yes
const DB_NAME = (typeof process !== 'undefined' && process.env.MONGODB_DB) || 'daily_entry_report';
const d = db.getSiblingDB(DB_NAME);

const COLLECTIONS = {
  // people and access
  users: [[{ userIdLower: 1 }, { unique: true }], [{ code: 1 }, { unique: true }], [{ employeeId: 1 }, { sparse: true }], [{ active: 1 }]],
  deleted_users: [[{ userIdLower: 1 }]], // deleted before v60 (now employees are made Inactive)
  deleted_records: [[{ owner: 1 }]],
  roles: [[{ key: 1 }, { unique: true }]],
  manager_otps: [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  settings: [], // {_id: "autoInactive" / "certFollowup" / ...}
  migrations: [],
  counters: [],
  notifications: [],
  // daily entries and attendance
  daily_entries: [[{ id: 1 }, { unique: true }], [{ facultyCode: 1, activityDate: 1, timeFrom: 1 }], [{ activityDate: 1 }]],
  day_declarations: [[{ code: 1, date: 1 }], [{ date: 1 }]], // v60 Declare: {_id "code|date", code, date, kind}
  staff_attendance: [[{ month: 1 }], [{ code: 1, month: 1 }]],
  holidays: [],
  biometric_days: [[{ code: 1, date: 1 }], [{ date: 1 }]],
  biometric_months: [],
  biometric_unmatched: [],
  student_marks: [[{ batchNo: 1, courseId: 1, examType: 1 }, { unique: true }]],
  // dropdowns, courses and masters
  lookups: [], // {_id: "colleges", values: [...]}
  place_contacts: [],
  courses: [[{ id: 1 }, { unique: true }]],
  chapters: [[{ courseId: 1, no: 1 }, { unique: true }]],
  course_requests: [[{ id: 1 }]],
  batch_requests: [[{ id: 1 }, { unique: true }]],
  master_batches: [[{ id: 1 }, { unique: true }], [{ batchNo: 1 }], [{ externalFacultyId: 1 }]],
  // external faculty (v60)
  master_externalFaculty: [[{ id: 1 }, { unique: true }]],
  external_faculty_bank: [], // {_id: faculty id, bankName, accountNo, holderName, branch, ifsc, pan, aadhaar}
  external_certifications: [[{ id: 1 }, { unique: true }], [{ facultyId: 1 }]],
  celebration_seen: [],
  celebration_sent: [],
  // HR
  halfyearly_reports: [[{ id: 1 }, { unique: true }], [{ employeeCode: 1 }]],
  incentives: [[{ month: 1, facultyCode: 1 }]], // v62 MIS › Incentive Amount
  hr_mail_templates: [], // v60 HR's own Performance mail: {_id "<userId>|performance", subject, body}
};

const existing = new Set(d.getCollectionNames());
for (const [name, indexes] of Object.entries(COLLECTIONS)) {
  if (!existing.has(name)) {
    d.createCollection(name);
    print(`created ${name}`);
  }
  for (const [keys, opts] of indexes) d.getCollection(name).createIndex(keys, opts || {});
}
const unused = d.getCollectionNames().filter((n) => !(n in COLLECTIONS) && !n.startsWith('system.'));
print(`\n${Object.keys(COLLECTIONS).length} collections ready in ${DB_NAME}.`);
if (unused.length) print(`Not used by the app (python -m app.cleanup_removed --yes drops them): ${unused.join(', ')}`);
