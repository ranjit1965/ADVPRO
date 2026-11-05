# Daily Entry Report

A modern React frontend for the Advpro **Faculty Daily Activity** application. It keeps the
existing workflow (menu structure, the Faculty Daily Activity Entry screen with its nine
activity tabs, and the Save / Clear / Edit / Delete / Exit buttons) and gives it a cleaner,
responsive interface.

All data lives in **MongoDB**, served by the **FastAPI backend** in `backend/`. The frontend has
no built-in or sample data: every screen reads and writes through the API.

## Quick start

Requires Node.js 20.19+, Python 3.11+ and a running MongoDB (local or Atlas).

**1. Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: MONGODB_URI, JWT_SECRET, the SMTP_* email settings and BATCH_IMPORT_PATH
uvicorn app.main:app --reload --port 8000
```

Run uvicorn from the `backend` folder and use `app.main:app` (the app is in `backend/app/main.py`).
`uvicorn main:app` fails with *Could not import module "main"*. To open it to other computers on
the network add `--host 0.0.0.0`.

**2. Frontend** (project root, a second terminal)

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

**3. First use**

1. On the sign-in page click **Create the manager account**. The 6-digit code is emailed to the
   address you enter (real email through your SMTP server; nothing is shown on screen). The code
   expires after 10 minutes and allows 5 tries.
2. Sign in as the manager and add everything from the app: employees and faculty (**Employee**),
   courses and chapters (**Master › Course**), batches, registrations (students), assets, vendors
   and the other **Master** screens.
3. Employees sign in with the User ID and password the manager gave them.

On first start the backend only writes the dropdown option lists (`backend/app/seed_data.json`,
for example Class in, Session types, Colleges) and the default HR policy into MongoDB. Batch,
Advpro No and Register No dropdowns come from the Master screens, and the student list on
Students Mark Entry comes from **Master › Registration** for the chosen batch.

Upgrading from an earlier version that created demo users and sample records? Start with an
empty database: `mongosh daily_entry_report --eval "db.dropDatabase()"`.

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

## Screens

| Legacy menu path | Route | What it does |
| --- | --- | --- |
| Login | `/login` | User ID + Password, validation and error states |
| (new) Dashboard | `/` | Today's entries, hours, month totals, pending/completed, days with no entry, last 7 days chart, activity mix, recent entries, quick actions |
| Faculty › Daily Activity › Entry | `/faculty/daily-activity/entry` | The main entry form (see below) |
| Faculty › Daily Activity › My Entries | `/faculty/daily-activity/history` | Search, date/activity/faculty/Center-Outstation filters, sorting, pagination, view/edit/delete, CSV export |
| Entry details | `/entries/:id` | Full entry, employee info, created/updated info; Back, Print, Edit, Delete |
| Faculty › Daily Activity › Print | `/faculty/daily-activity/print` | Daily Activity Report for a faculty and date range, A4 landscape, with **Download PDF** and **Download Excel**. Faculty and staff can print only their own report |
| Faculty › Monthly Plan | `/faculty/monthly-plan` | Admin and Manager assign week-wise batch/course plans to one person, all faculty or all employees (one plan per person) and see everyone's plans with person and status filters. Each employee or faculty member sees only the plans assigned to them and updates the status (Pending, In Progress, Completed) and a progress note |
| Faculty › Students Mark Entry | `/faculty/students-mark-entry` | Load a batch and enter marks / absent, with Save, Clear, Exit |
| Faculty › Monthly Report | `/faculty/reports/monthly` | Activity report laid out like the September 2026 sample: headline figures, day-by-day, type, week and topic charts, daily and weekly summaries (Others in its own column), calendar view and activity log. **Download PDF** (print dialog, A4 landscape) and **Download Excel** (one sheet per section) |
| Master (Admin, Manager) | `/master`, `/master/<key>` | Legacy Master menu: Registration, Batch, Employees, Course, Attendence, Product, Old Registrations, Shedulling, MontlyStaffReport, Vendor, Assest. Generic screens are driven by `src/config/masters.json` (copy in `backend/app/masters.json`, keep both identical); each is its own collection `master_<key>` |
| Master › Employees | `/master/employees` | Admin and Manager add, edit, disable and delete employees (the manager account itself can only be changed by the manager) |
| Master › Shedulling, My Work | `/master/scheduling`, `/my-work` | Admin and Manager assign work to one person, all faculty or all employees; each person updates status and a progress note under My Work |
| HR_Report › HR Policy, Your Info, Batch Paper Completion, Leave/Permission Form | `/hr-report/...` | Policy text (HR edits), PF/bank details, EL/CL balance, permissions, absent days and monthly ratings, batch start/end dates from Class entries, leave and permission requests the manager sanctions or rejects |
| Faculty › Monthly Working Hrs Report | `/faculty/reports/working-hours` | Hours per employee and faculty (HR, Admin, Manager): class, center, outstation, performance, Others, total |
| Employee (HR read-only) | `/master/employees` | HR sees every employee with hours and days this month and opens anyone's dashboard; only Admin and Manager can add, edit or delete |
| Dashboard person picker | `/?code=SAN` | HR, Admin and Manager pick a faculty member or employee and the dashboard shows that person's entries, hours and missing days, with a link to their monthly report. Faculty and staff only ever see their own figures (also enforced by the API) |
| Admin › Data Upload (Admin, Manager) | `/admin/data-upload` | Pick **Batch Master** or **Biometric** and upload the Excel file (.xlsx, .xls or .csv, any column order). Shows the last upload of each and a month-end reminder |
| Settings | `/settings` | Profile and entry defaults (saved on your user record). **Change password** shows only for Admin and Manager; everyone else sees "Passwords are changed by Admin only" |

On desktop, **Master, Faculty** and **HR_Report** open as a flyout menu to the right of the
sidebar, like the legacy menu (nested items such as Faculty › Daily Activity cascade further
right). On mobile they expand inline in the drawer. **Employee** opens Master › Employees.
The app uses a light palette: white sidebar and header on a light blue background.

The remaining legacy menu items keep their place in the sidebar. **Transaction, Reports,
Marketing** and **Support Team** were greyed out for the FACULTY role in the old
application, so they appear locked. **Admin** now holds Data Upload (Admin and Manager only). **Master** (manager and admin) maintains courses and their chapter / session details. 
**Faculty › Others** opens the entry form on the Others tab. Others entries are not part of
activity performance, so every report and the print sheet list them in a separate section
with their own time total. **Exit** logs out
after a confirmation.

### Faculty Daily Activity Entry

* Header: **Faculty Name** (type to search) and **Activity Date**. Directly above the tabs, on one
  line: **Time From**, **Time To**, **Faculty in** (Center / College / OD) and **Worked Hours**.
* Before saving, an entry longer than **2 hours** asks "More than 2 hours … Are you sure?", and an
  **Others** entry longer than **1 hour** asks "Others more than 1 hour … Are you sure?". Yes saves it.
* **Time From / Time To** are typed by hand in 24-hour (railway) time, HH:MM: type `0930` or
  `1345` and the colon is added (a first digit above 2, like `9`, becomes `09`). No picker and no
  AM / PM. The first entry of a day starts at **09:00**; the next one starts at the Time To of the
  day's last entry (after a save, after Clear, and when the faculty or date changes).
  As soon as a full Time To at or before Time From is typed (or Time From is changed past Time
  To), a red warning shows under Time To and on Worked Hours, before Save. A time such as 25:70
  shows "Enter a 24-hour time, 00:00 to 23:59".
* Nine tabs: **Class, Seminar / Work Shop, Marketing Support, Course Preparation,
  Self Learning / Knowledge Sharing, Faculty Development, DataBase Creation/Download, Travelling Time, Others**.
  Each tab shows a badge with that day's entry count. The tabs share the full row: one row on
  laptops and larger screens, two rows on tablets, two per row on phones. The Software and System Fault sections
  were removed: new ones cannot be saved, but old ones still show in My Entries, reports and print.
* **Class**: **Course ID** first (left), then **Batch No** (Center) or **Class in** (College / OD,
  options include **Advantage Pro**), Chapter / Session No, Chap / Session Type (Theory / Lab),
  **Day Order (1 to 20)**, **No of Students**, Today's Session Type (includes **LAB Creation**),
  **Daily test** and **Daily activity post** (Yes / No, for Center and College / OD), and Detail.
  With **College / OD** the College / OD block appears: College Name, Dept, Sec, Total Absent,
  YOP, **Faculty role** (Main Faculty / Assistance Faculty; Assistance asks for the **Main faculty name**) and four optional Yes / No questions: Videos shown, Guided exercise
  PPT shown, Menti quiz conducted, Task given. (The stored value is still `Outstation`, so older
  entries keep working; their Total Student and Daily test are shown in the new fields.)
* **Class › Batch No** lists only the batches assigned to the selected faculty (see Batch import
  below): open batches first, then batches completed in the last 12 months. Picking a batch fills
  Course ID when that course is in the course list. **Request new course** emails the Manager /
  Admin (`COURSE_REQUEST_EMAILS`) to add a missing course.
* **YOP** (Seminar, Marketing, College / OD) can be picked from the saved YOP options or typed:
  any 4-digit year is accepted.
* **Daily Activity Print** uses the same layout as the old software: ADVANTAGE PRO, "NAME (CODE)
  Daily Activity Report", Date, and the columns JobDate (01/Sep/26), Time From, Time To, Batch No,
  Paper Name (course name), S.No (chapter), S.Type (L / T), College Name, Dept, YOP, Topic and
  C.Type, with the code legend below (CL Class, GL Seminar Guest, IV Seminar Industrial Visit,
  CO Counseling, MK Marketing Support, CP Learn Preparation, SL Learn Self Preparation, DB DataBase,
  TR Travelling, OT Others, IN Internship, KS Knowledge Sharing, CA Class Attended, FD Faculty Development;
  SW Software and SF System Fault for old entries), plus a **Faculty Role** column (Main / Assistance and the main
  faculty name). Times are in 24-hour format. **Download PDF** (jsPDF, A4 landscape) and **Download Excel**
  (A4 landscape, fit to width) save the same sheet.
* **Course Preparation**: Course ID (+ Add course), Material Type, Chapter / Session No,
  No of Pages, Details. **Self Learning / Knowledge Sharing**: Type (**Self Learning, Knowledge
  Sharing, Class Attended**; Class Attended also asks **Class taken by** (faculty) and **Online /
  Offline**), Course ID, Chapter / Session No, **Chap / Session Type** (Theory / Practical), Details.
* **Seminar / Work Shop**: Type (**Guest Lecture, IV / Work Shop, Internship**) and **Faculty role**
  (Main / Assistance, with the main faculty name). Internship asks the same course questions as
  Knowledge Sharing; the other types ask the college details. Remarks for all.
* **Faculty Development**: Type (Meeting with HR, Meeting with Ranjit sir, Staff Meeting, Lunch
  Break, Tea Break) and Remarks (required). It counts in worked hours but, like Others, not in
  activity performance.
* **Others**: headings no longer include Lunch Break, Training Attended, Staff Meeting or Tea Break
  (breaks and meetings go in Faculty Development). There is no daily limit; over 1 hour asks to confirm. Old "Learning / Preparation" entries are moved to the right tab on the
  first start (see `backend/app/seed.py`, `migrate()`).
* **[CTRL + A]** on College Name / Dept / Course ID opens "Add new".
* Every dropdown is sorted A to Z. Search boxes (faculty, employees, courses, colleges...)
  list only the values that **start with** the typed letters.
* Buttons: **Save** (Ctrl + S), **Clear**, **Edit**, **Delete**, **Exit**.
* Validation: required fields, Time To after Time From, no future dates, numbers only where
  expected, Total Absent not above No of Students, and no overlapping time slots.

* "Advantage Pro" (Class in) and "LAB Creation" (Today's Session Type) are added to an existing
  database automatically at the next backend start.
* On phones, short fields sit two per row (Time From / Time To, Chapter / Chap Type, Day Order /
  No of Students, Daily test / Daily activity post...), with shorter labels so the boxes stay level.
* Screens fit phones (iPhone 375 to 430 px wide), tablets, laptops, desktops and large monitors
  (content widens to 1680 px on 2K / 4K screens). Date boxes no longer overflow on iPhone Safari.

### Passwords

Only **Admin** (and the Manager account) can change passwords: their own under Settings, and any
employee's under Master › Employees (Edit › New password). Faculty, staff and HR cannot change a
password; `POST /api/auth/change-password` returns 403 for them.

### Admin › Data Upload

Admin and Manager choose **Batch Master** or **Biometric** in the dropdown and upload the Excel
file (`.xlsx`, `.xls` or `.csv`; the columns can be in any order). Batch Master saves each batch
for its employee (matched by name and short name); Biometric saves Time In / Time Out per employee
per day, which the monthly report compares with the entries. Uploading a month again replaces those
days. The same uploads stay on Master › Batch Import and Master › Biometric.
From the day before the last day of the month (and in the first 5 days of the next month if it was
missed), the Dashboard and this page remind Admin / Manager until each file is uploaded.
`.xls` files need `xlrd` (in `backend/requirements.txt`).

### Biometric time in / out (Master › Biometric)

* Manager / Admin enter the **folder path** where the biometric device saves its export
  files. It must be a folder the **backend server** can read (a local or mapped drive).
* **Import now** reads every `.csv`, `.txt`, `.tsv`, `.dat`, `.xlsx` and `.xls` file in the folder.
  Accepted layouts: one row per punch (Emp Code / Name / Date + Time, or one Date Time
  column), one row per day with In Time / Out Time columns, or a headerless ZKTeco attendance
  log. The first punch of a day is Time In, the last is Time Out. Results are stored in the
  `biometric_days` collection.
* People are matched by employee code, login ID or name. Anyone not matched is listed with a
  picker to link the device user to an employee; the link is saved and reused.
* The **Monthly Report** has a "Biometric time in / out vs entries" section (and a
  Biometric sheet in the Excel download): Bio In vs first entry start, Bio Out vs last entry
  end, biometric hours vs entered hours, and a status per day (Matched, Difference, Missing
  out punch, No entries, No biometric). The tolerance (default 15 minutes) is set on the
  Biometric page.

### Batch import from the Access BatchMaster table (Master › Batch Import)

* The batches come from the institute's **BatchMaster** table: the Access database (`.accdb` /
  `.mdb`) or the table saved as Excel / CSV (`BatchMaster.xlsx`). Columns used: BatchNo,
  FacultyAlloted (faculty short name), Course, BatchStartDate, BatchEndDate, ActualEndDate,
  BatchTimeIn, BatchTimeOut, ClassType, TotalHrs, CourseType, Status. Column order does not matter.
* Where to read it from is set by the developer in `backend/.env`:

  ```bash
  # Folder (or one file) holding the BatchMaster table
  BATCH_IMPORT_PATH=\\192.168.0.129\Test\DAILY_REPORT_SOFTWARE_2026
  # Table name inside an Access file
  BATCH_IMPORT_TABLE=BatchMaster
  # Automatic import on this day of every month (0 = off), at or after this hour (local time)
  BATCH_IMPORT_DAY=1
  BATCH_IMPORT_HOUR=6
  ```

  For a folder, the newest file named like *BatchMaster* is read (else the newest Access file,
  else the newest Excel / CSV). Restart the backend after changing `.env`.
* **Upload BatchMaster file** (Batch Import) and **Upload file** (Biometric) pick the file in the
  browser, for example from `\\192.168.0.129\Test\DAILY_REPORT_SOFTWARE_2026` on an office PC, and
  import it. Use these when the backend runs on **Vercel** or any server outside the office: such a
  server can never open the office share, and the monthly automatic import does not run there.
  `.accdb` / `.mdb` uploads still need the Access driver on the backend, so upload the `.xlsx`.
* **Changing the path without editing .env**: on Master › Batch Import, type another folder or
  file (for example `D:\Test\DAILY_REPORT_SOFTWARE_2026`) and click **Save path**. The saved path
  is used instead of `BATCH_IMPORT_PATH` (for the monthly import too). **Use backend/.env path**
  goes back to the `.env` value. The path is checked when saving.
* "Cannot open the network folder" means the computer running the backend cannot reach the share:
  check that 192.168.0.129 is on, the folder is shared, and the Windows user running the backend
  can open it (Win + R, paste the path, Enter). A `\\computer\share` path only works when the
  backend runs on Windows in the same office network (not on Vercel or another cloud server).
  The message also gives the Windows reason. If the folder opens in File Explorer but not in the
  app, the backend runs as another Windows user (started with "Run as administrator" or as a
  service): start `uvicorn` from a normal Command Prompt, or copy the file to a local folder.
* **Automatic monthly import**: the backend checks every 30 minutes and imports once a month
  (on `BATCH_IMPORT_DAY`, or at the first start after it if the backend was off). Manager /
  Admin can also click **Import batches now**, or run `python import_batches.py` in `backend`
  (for example from Windows Task Scheduler).
* **Assigning to faculty**: each FacultyAlloted short name is matched to the employee **code**
  (BAL → BALA SHANMUGAM.M (BAL), ARI → ARISH.P (ARI)), then login ID, then name. Give every
  faculty in **Employee** the same code as their short name in Access and the batches are
  assigned automatically. Short names that match nobody are listed on the page; link each once
  to an employee and the link is remembered for every later import. A batch taught by two
  faculty (same batch number, course and start date) is assigned to both (Faculty + Other
  Faculty).
* Batches are saved in **Master › Batch** (`master_batches`), showing Faculty and Short Name.
  Importing again updates the same batches; nothing is deleted. Status: `C` in Access, an
  ActualEndDate, or an end date older than 60 days → Completed; `B` → Break; a future start →
  Planned; otherwise Running. A batch number reused for a different batch is saved with `-2`.
* The Batch Import page shows the file found, the last import (rows, batches, assigned, status
  counts), the monthly schedule and any error (share offline, no permission), short names not
  matched, and course codes not yet in **Master › Course**.
* Network folder: the Windows account running the backend must be able to open the share.
  Reading `.accdb` / `.mdb` directly needs `pip install pyodbc` (in `requirements.txt` for
  Windows) and the free **Microsoft Access Database Engine** (same 32 / 64 bit as Python).
  Without it, save the table as `BatchMaster.xlsx` in the same folder.

### Assumptions to confirm

The screenshots did not show these, so sensible defaults were used and are easy to change:

* Fields of the **Marketing Support, DataBase Creation/Download** and **Travelling Time**
  tabs (`src/components/entry/tabs/`).
* Monthly Plan and Students Mark Entry layouts.

## Deploying the frontend on Vercel

`vercel.json` sends every page address (for example `/master/batch-import`) to `index.html`, so
refreshing any page or opening a link to it works instead of showing Vercel's 404 page. Requests to
`/api/...` and the built `/assets/...` files are not rewritten.

## Project structure

```text
src/
├── components/
│   ├── ui/            Button, Input, Select, SearchableSelect, Textarea, RadioGroup,
│   │                  DatePicker, TimePicker, Modal, ConfirmDialog, DataTable, Pagination,
│   │                  Tabs, Card, StatCard, StatusBadge, Loading, EmptyState, ErrorState …
│   ├── layout/        Header, Sidebar, Logo
│   ├── entry/         Daily Activity Entry pieces: header fields, nine tab panels,
│   │                  Outstation block, action bar, entries grid, Ctrl+A modal, filters
│   └── charts/        Single-series bar chart (Recharts)
├── config/            navigation.js (sidebar menu = legacy menu bar)
├── context/           Auth, Toast, Confirm dialog, Lookups (master data)
├── hooks/             useAsync, useDebounce, usePersistentState, usePreferences
├── layouts/           AppLayout (sidebar + header + page)
├── pages/             Dashboard, DailyEntry, EntryHistory, EntryDetails,
│                      DailyActivityPrint, Reports, MonthlyPlan, StudentsMarkEntry,
│                      Settings, Login, ModulePlaceholder, NotFound
├── services/          api.js (all data access, REST calls), http.js (fetch client)
├── utils/             constants, formatting, entry form validation, CSV export
├── App.jsx            routes
├── main.jsx
└── index.css          design tokens (colours, radius, shadows) for Tailwind
```

The design system lives in `src/index.css` (`@theme` tokens: brand blue, the maroon accent
used for the old tab captions, neutrals, status colours, radius and shadows) and the shared
components in `src/components/ui`. Pages only use these.

## API

Every page reads and writes data only through `src/services/api.js`, which calls these endpoints:

| Function | Endpoint |
| --- | --- |
| `login`, `logout`, `getCurrentUser` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| `savePreferences` | `PUT /api/auth/me/preferences` |
| `changePassword`, `getSetupStatus`, `requestManagerOtp`, `verifyManagerOtp` | `POST /api/auth/change-password`, `GET /api/auth/setup-status`, `POST /api/auth/manager/request-otp`, `POST /api/auth/manager/verify` |
| `getUsers`, `createUser`, `updateUser`, `deleteUser` (manager only) | `GET/POST /api/users`, `PUT/DELETE /api/users/{userId}` |
| `getLookups`, `addLookupValue` | `GET /api/lookups`, `POST /api/lookups/{colleges\|departments\|othersHeadings}` |
| `getDailyEntries(filters)` | `GET /api/daily-entries?q&facultyCode&activityType&facultyIn&dateFrom&dateTo&sortBy&sortDir&page&pageSize` → `{ items, total }` |
| `getDailyEntry(id)` | `GET /api/daily-entries/{id}` |
| `createDailyEntry`, `updateDailyEntry`, `deleteDailyEntry` | `POST /api/daily-entries`, `PUT /api/daily-entries/{id}`, `DELETE /api/daily-entries/{id}` |
| `getDashboardSummary` | `GET /api/dashboard?facultyCode` |
| `getMonthlyReport`, `getWorkingHoursReport` | `GET /api/reports/monthly`, `/working-hours` |
| `saveCourse`, `deleteCourse`, `saveChapter`, `deleteChapter` (manager, admin) | `POST /api/master/courses`, `PUT/DELETE /api/master/courses/{id}`, `POST /api/master/chapters`, `PUT/DELETE /api/master/chapters/{courseId}/{no}` |
| `getMasterRecords`, `saveMasterRecord`, `deleteMasterRecord` | `GET/POST /api/masters/{key}`, `PUT/DELETE /api/masters/{key}/{id}` |
| `getWorkAssignments`, `createWorkAssignments`, `updateWorkAssignment`, `deleteWorkAssignment` | `GET/POST /api/work-assignments`, `PUT/DELETE /api/work-assignments/{id}` |
| `getHrPolicy`, `saveHrPolicy`, `getEmployeeInfo`, `saveEmployeeInfo`, `getBatchCompletion`, `getLeaveRequests`, `createLeaveRequest`, `decideLeaveRequest` | `GET/PUT /api/hr/policy`, `GET /api/hr/info`, `PUT /api/hr/info/{userId}`, `GET /api/hr/batch-completion`, `GET/POST /api/hr/leave-requests`, `POST /api/hr/leave-requests/{id}/decision` |
| `getMonthlyPlans`, `saveMonthlyPlan`, `deleteMonthlyPlan` | `/api/monthly-plans` |
| `getStudentMarks`, `saveStudentMarks` | `/api/student-marks` |
| `getNotifications` | `GET /api/notifications` |
| `getBatchImportSettings`, `saveBatchImportSettings`, `importBatches`, `saveBatchFacultyMap` (manager, admin) | `GET/PUT /api/batch-import/settings`, `POST /api/batch-import/import`, `PUT /api/batch-import/map` |
| `requestCourse`, `getCourseRequests`, `setCourseRequestStatus` | `POST/GET /api/course-requests`, `PATCH /api/course-requests/{id}` |

Frontend `.env`:

```bash
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://localhost:8000   # FastAPI dev server
```

The Vite dev server proxies `/api` to FastAPI, so no CORS setup is needed in development.
`http.js` sends `Authorization: Bearer <token>` after login and turns error responses
(`{"detail": "..."}`, FastAPI's default) into messages shown in toasts.

A daily entry is sent in this shape, which maps directly to a MongoDB document:

```json
{
  "facultyCode": "SAN",
  "activityDate": "2026-10-08",
  "facultyIn": "Center",
  "timeFrom": "10:00",
  "timeTo": "11:30",
  "activityType": "class",
  "details": {
    "batchNo": "B-2601", "courseId": "RHCSA",
    "chapterNo": "3", "chapterType": "Lab",
    "todaySessionType": "Lab", "todaySessionDetail": "…"
  },
  "outstation": null
}
```

The server adds `id`, `facultyName`, `createdBy`, `createdAt`,
`updatedBy` and `updatedAt`.

## Backend (FastAPI + MongoDB)

Setup is in **Quick start** above. API docs: http://localhost:8000/docs.

Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` must be set, or the
manager sign-up shows "Email is not set up on the server". Port 587 uses STARTTLS, port 465 uses
SSL. For Gmail use an App Password (Google Account › Security › 2-Step Verification › App
passwords) and the same Gmail address as `SMTP_FROM`.

MongoDB collections: `users` (bcrypt password hashes, roles FACULTY / HR / ADMIN / STAFF / MANAGER),
`daily_entries`, `courses`, `chapters` (chapter / session details per course), `lookups` (one document per dropdown list), `monthly_plans`, `student_marks`,
`master_registrations`, `master_batches`, `master_attendance`, `master_products`, `master_oldRegistrations`, `master_vendors`, `master_assets`, `work_assignments`, `settings` (HR policy), `leave_requests`, `manager_otps` (expire automatically), `notifications`, `counters` (entry numbers DAE-0001…).

Rules enforced on the server: one manager only, created after the emailed 6-digit code is verified
(10 minutes, 5 attempts) and is never returned by the API or written to the log; Admin and Manager
add, edit, disable or delete employees (HR can view them); faculty and staff only add or change
their own entries and only see their own dashboard and reports; no overlapping time slots; the
Monthly Working Hrs Report is for HR, Admin and Manager.

## Tech stack

React 19, Vite 7, Tailwind CSS 4, React Router 7, Recharts, ExcelJS, lucide-react icons. JavaScript
(JSX). Backend: FastAPI, PyMongo, PyJWT, bcrypt.
