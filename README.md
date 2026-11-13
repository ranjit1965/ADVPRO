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
# edit .env: MONGODB_URI, JWT_SECRET and the SMTP_* email settings
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
| Master (Admin, Manager) | `/master`, `/master/<key>` | Legacy Master menu: Registration, Batch, Employees, Course, Attendence, Product, Old Registrations, Shedulling, MontlyStaffReport, Vendor, Assest. Each list has tick boxes: tick rows (or the header box for the page, or **Select all**) and click **Delete selected**, then **OK, delete**, to remove them from the database in one call (`POST /api/masters/<key>/delete-many`). Generic screens are driven by `src/config/masters.json` (copy in `backend/app/masters.json`, keep both identical); each is its own collection `master_<key>` |
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
* Eight tabs: **Class, Seminar / Work Shop, Marketing Support, Course Preparation,
  Self Learning / Knowledge Sharing, Faculty Development, Travelling Time, Others**. DataBase
  Creation/Download is now a type inside Marketing Support (old DataBase entries still show).
  Each tab shows a badge with that day's entry count. The tabs share the full row: one row on
  laptops and larger screens, two rows on tablets, two per row on phones. The Software and System Fault sections
  were removed: new ones cannot be saved, but old ones still show in My Entries, reports and print.
* **Class**: **Course ID** first (left), then **Batch No** (Center) or **Class in** (College / OD,
  options include **Advantage Pro**), Chapter / Session No,
  **Day Order (1 to 20)**, **No of Students**, Today's Session Type (includes **LAB Creation** and **Coding**),
  **Daily test** and **Daily activity post** (Yes / No, for Center and College / OD), and Detail.
  With **College / OD** the College / OD block appears: College Name, Dept, Sec, Total Absent,
  **Total Present**, Total Absent (Present + Absent cannot be more than No of Students), YOP, **Faculty role** (Main Faculty / Assistance Faculty; Assistance asks for the **Main faculty name**) and four optional Yes / No questions: Videos shown, Guided exercise
  PPT shown, Menti quiz conducted, Task given. (The stored value is still `Outstation`, so older
  entries keep working; their Total Student and Daily test are shown in the new fields.)
* **Class › Batch No** lists only the batches assigned to the selected faculty (see Batch import
  below): open batches first, then batches completed in the last 12 months. Picking a batch fills
  Course ID when that course is in the course list. **Request new course** emails the Manager /
  Admin (`COURSE_REQUEST_EMAILS`) to add a missing course and, when WhatsApp is set up (see
  **WhatsApp course request message** below), sends them a WhatsApp template message at the same
  time. Both the mail and the message name the employee who sent the request.
* **YOP** (Seminar, Marketing, College / OD) is a dropdown of the current year and the next five
  (2026 to 2031 in 2026). A year saved earlier outside that range still shows on old entries.
* **Daily Activity Print** uses the same layout as the old software: ADVANTAGE PRO, "NAME (CODE)
  Daily Activity Report", Date, and the columns JobDate (01/Sep/26), Time From, Time To, Batch No,
  Paper Name (course name), S.No (chapter), S.Type (L / T), College Name, Dept, YOP, Topic and
  C.Type, with the code legend below (CL Class, GL Seminar Guest, IV Seminar Industrial Visit,
  CO Counseling, MK Marketing Support, CP Learn Preparation, SL Learn Self Preparation, DB DataBase,
  TR Travelling, OT Others, IN Internship, KS Knowledge Sharing, CA Class Attended, FD Faculty Development;
  SW Software and SF System Fault for old entries), plus a **Faculty Role** column (Main / Assistance and the main
  faculty name). Times are in 24-hour format. **Download PDF** (jsPDF, A4 landscape) and **Download Excel**
  (A4 landscape, fit to width) save the same sheet.
* **Course Preparation**: Course ID (+ **Request new course**, the same mail and WhatsApp request as
  Class), Material Type, Chapter / Session No, **Activity Quantity** (numbers only; was No of Pages), Details.
* **Self Learning / Knowledge Sharing**: Type (**Self Learning, Knowledge Sharing, Class Attended**;
  Class Attended also asks **Class taken by** (faculty) and **Online / Offline**), Course ID (no Add
  course here), Chapter / Session No, **Chap / Session Type**, **Material Type**, Details.
  * Self Learning and Class Attended: Chap / Session Type is **Theory** or **Lab**. Material Type
    then lists, for Theory: PPT, Book, PDF, Online Book, Google, AI; for Lab: Guided Exercise,
    Practical Exercise, Coding in VS Code, Cloud Lab. **Ctrl + A** adds a new material type to the
    chosen list.
  * Knowledge Sharing: Chap / Session Type uses the same list as Class › Today's Session Type
    (Ctrl + A adds to it), and **Trainee (who learned from me)** picks an employee.
* **Seminar / Work Shop**: Type (**Guest Lecture, IV / Work Shop, Internship**) and **Faculty role**
  (Main / Assistance, with the main faculty name). Internship asks the same course questions as
  Knowledge Sharing; the other types ask the college details. Remarks for all except Internship.
* **Marketing Support** types: TC calls, Mailers, SMS (**Total Msg**), **Lab Creation - Check**
  (was Label Printout: **College Name**, **Course ID**, **No of Students** (numbers only),
  **Utilization Check** Yes / No and **Fresh Lab / Repeat Lab Creation**, all required, plus Remarks), **DataBase Creation/Download** (College / Database Name, File Name, Total Records,
  Stored Place, Remarks; print code DB), Councelling (**Enq Form No** typed by hand, **Course Name**
  from the course list, Remarks) and Registration (**Register No** typed by hand, Remarks).
* **Travelling Time**: **From Place** and **To Place** are each a Home / Office / College toggle;
  College opens the college list (Ctrl + A adds a college). Then Mode of Travel, Purpose, Remarks.
* **Request new course** shows **Send mail & WhatsApp**: one click sends both.
* **Faculty Development**: Type (Meeting with HR, Meeting with Ranjit sir, Staff Meeting) and
  Remarks (required). Meetings count in worked hours and in activity performance.
* **Others**: headings include **Lunch Break** and **Tea Break**. Others (breaks included) count
  in worked hours but **not in activity performance**; reports show them in a separate Others
  column. Training Attended and Staff Meeting are not Others headings (meetings should be entered
  in Faculty Development). Break entries saved earlier under Faculty Development are moved to
  Others at the next backend start. There is no daily limit; over 1 hour asks to confirm. Old "Learning / Preparation" entries are moved to the right tab on the
  first start (see `backend/app/seed.py`, `migrate()`).
* **[CTRL + A]** on College Name / Dept / Course ID / **Mode of Travel** / Knowledge Sharing session type / Material Type opens "Add new"; any user can add a new value (it is saved to the shared list).
* Every dropdown is sorted A to Z. Search boxes (faculty, employees, courses, colleges...)
  list only the values that **start with** the typed letters.
* Buttons: **Save** (Ctrl + S), **Clear**, **Delete**, **Exit**. **Edit** is above the
  "Entries for the day" grid: select a row there, then click Edit. While editing, the form shows
  **Update** and **Cancel edit**; Clear is hidden (it only shows in entry mode).
* Validation: required fields, Time To after Time From, no future dates, numbers only where
  expected, Total Absent not above No of Students, and no overlapping time slots.

* "Advantage Pro" (Class in) and "LAB Creation" (Today's Session Type) are added to an existing
  database automatically at the next backend start.
* On phones, short fields sit two per row (Time From / Time To, Chapter / Chap Type, Day Order /
  No of Students, Daily test / Daily activity post...), with shorter labels so the boxes stay level.
* Screens fit phones (iPhone 375 to 430 px wide), tablets, laptops, desktops and large monitors
  (content widens to 1680 px on 2K / 4K screens). Date boxes no longer overflow on iPhone Safari.

* **Dashboard** no longer shows the "This month" performance card. Performance time (all
  activities except Others) is in **Monthly Report** (Generate Report: KPI card and Excel) and in
  the Monthly Working Hrs Report.

### HR › Halfyearly Program Report

Page `/hr-report/halfyearly`, under the heading **HALFYEARLY PROGRAM REPORT**.

* **HR, Manager and Admin** assign each employee or faculty a **Target Certification**, either picked
  from the course list or typed by hand, with a **Starting Month** and **Ending Month**. They can edit
  or delete a row and filter by employee.
* **The employee / faculty** fills in, on the same row: **Achieved?** (Yes / No; Yes asks the **Date of
  completion** and the **Certification code**) and **Course Delivery Ready?** (Yes / No), then Save.
  Each person sees only their own rows. Export downloads a CSV.
* For an HR login, create the user in Master › Employees with role **HR** (passwords need at least
  8 characters, so "hr" alone is not accepted).

### WhatsApp course request message

When a course request is sent, the backend also sends a WhatsApp **template** message through
Pinbot (`backend/app/whatsapp.py`). Set in `backend/.env` (and in Vercel / the server environment):

```
WA_API_BASE=https://partnersv1.pinbot.ai/v3
WA_API_KEY=...            # Pinbot API key
WA_PHONE_NUMBER_ID=...    # your WhatsApp business phone number id in Pinbot
WA_TEMPLATE_ID=...        # id of the approved template
WA_TEMPLATE_NAME=course_request
WA_TEMPLATE_LANG=en
WA_NOTIFY_NUMBERS=919876543210,9812345678   # Manager and Admin; a 10-digit number gets 91 added
WA_TEMPLATE_PARAMS=employee,code,course,courseId,remarks   # what fills {{1}}, {{2}} ... in order
```

The default `WA_TEMPLATE_PARAMS` fills a **Utility** template with five body variables, for example:

```
New course request from {{1}} ({{2}}).
Course: {{3}}
Suggested Course ID: {{4}}
Remarks: {{5}}
Please add it to the course list.
```

`WA_TEMPLATE_PARAMS` must list exactly as many values as the approved template has variables, in
the template's order, or WhatsApp refuses the message with error #132000 ("Number of parameters does
not match"). Names you can use: `employee` (name), `code` (employee code), `employeeCode` (name and
code together), `course`, `courseId`, `remarks`, `date` and `email`. An empty value is sent as "-". If WhatsApp is not set up, or Pinbot refuses the message, the
mail is still sent and the error is saved on the request (`whatsapp.errors`). The request body
follows the Meta Cloud API template format; check it against your Pinbot account before going live.

### Batches (Master › Batches)

Adding or editing a batch by hand asks **Mode** (Center / At College) and **Online / Offline**.
Existing batches are converted at the next backend start: Online becomes Center + Online,
Outstation becomes At College + Offline. Batches from the Batch Master upload are Center + Offline.

### Passwords

Only **Admin** (and the Manager account) can change passwords: their own under Settings, and any
employee's under Master › Employees (Edit › New password). Faculty, staff and HR cannot change a
password; `POST /api/auth/change-password` returns 403 for them.

### Admin › Data Upload

Admin and Manager choose **Batch Master** or **Biometric** in the dropdown and upload the Excel
file (`.xlsx`, `.xls` or `.csv`; the columns can be in any order). Batch Master saves each batch
for its employee (matched by name and short name); Biometric saves Time In / Time Out per employee
per day, which the monthly report compares with the entries. Uploading a month again replaces those
days. Choose the file, then click **Save**: the backend reads it and updates the database. The same Choose file / Save is on Master › Batch Import and Master › Biometric.
From the day before the last day of the month (and in the first 5 days of the next month if it was
missed), the Dashboard and this page remind Admin / Manager until each file is uploaded.
`.xls` files need `xlrd` (in `backend/requirements.txt`).

### Biometric time in / out (Master › Biometric)

* Admin / Manager click **Choose file**, pick the device export from this computer (`.xlsx`,
  `.xls` or `.csv`; `.txt` / `.tsv` / `.dat` logs also work), and click **Save records**. The
  backend reads it and saves the records. There is no folder path.
  Accepted layouts, columns in any order: one row per punch (Emp Code / Name / Date + Time, or
  one Date Time column), one row per day with In Time / Out Time columns, or a headerless
  ZKTeco attendance log. The first punch of a day is Time In, the last is Time Out. Results are
  stored in `biometric_days`; saving a day again replaces it.
* People are matched by employee code, login ID or name. Anyone not matched is listed with a
  picker to link the device user to an employee; their saved days move to that employee and the
  link is reused for every later upload.
* The **Monthly Report** has a "Biometric time in / out vs entries" section (and a
  Biometric sheet in the Excel download): Bio In vs first entry start, Bio Out vs last entry
  end, biometric hours vs entered hours, and a status per day (Matched, Difference, Missing
  out punch, No entries, No biometric). The tolerance (default 15 minutes) is set on the
  Biometric page.

### Batch import (Master › Batch Import)

* Admin / Manager click **Choose file**, pick the **BatchMaster** Excel file from this computer
  (`.xlsx`, `.xls` or `.csv`; in Access, export the BatchMaster table to Excel first), and click
  **Save batches**. The backend reads it and saves the batches in one bulk write, so even a few
  thousand batches save in seconds. There is no folder path, `.env` path or automatic monthly import.
* Columns used (any order): BatchNo, FacultyAlloted (faculty short name), Course,
  BatchStartDate, BatchEndDate, ActualEndDate, BatchTimeIn, BatchTimeOut, ClassType, TotalHrs,
  CourseType, Status.
* **Assigning to faculty**: each FacultyAlloted short name is matched to the employee **code**
  (BAL → BALA SHANMUGAM.M (BAL), ARI → ARISH.P (ARI)), then login ID, then name. Give every
  faculty in **Employee** the same code as their short name and the batches are assigned
  automatically. Short names that match nobody are listed on the page; link each once to an
  employee: that short name's batches are assigned at once and the link is remembered for every
  later upload. A batch taught by two faculty (same batch number, course and start date) is
  assigned to both (Faculty + Other Faculty).
* Batches are saved in **Master › Batch** (`master_batches`), showing Faculty and Short Name, and
  each faculty sees their batches in the Class tab. Saving a new file updates the same batches;
  nothing is deleted. Status: `C`, an ActualEndDate, or an end date older than 60 days →
  Completed; `B` → Break; a future start → Planned; otherwise Running. A batch number reused for a
  different batch is saved with `-2`.
* The page shows the last upload (file, who, rows, batches, assigned, status counts), short
  names not matched, and course codes not yet in **Master › Course**.

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
| `getHalfyearly`, `assignHalfyearly`, `updateHalfyearly`, `updateHalfyearlyStatus`, `deleteHalfyearly` | `GET/POST /api/hr/halfyearly`, `PUT/DELETE /api/hr/halfyearly/{id}`, `PUT /api/hr/halfyearly/{id}/status` |
| `getMonthlyPlans`, `saveMonthlyPlan`, `deleteMonthlyPlan` | `/api/monthly-plans` |
| `getStudentMarks`, `saveStudentMarks` | `/api/student-marks` |
| `getNotifications` | `GET /api/notifications` |
| `getBatchImportSettings`, `uploadBatches`, `saveBatchFacultyMap` (manager, admin) | `GET /api/batch-import/settings`, `POST /api/batch-import/upload?name=` (raw file body), `PUT /api/batch-import/map` |
| `getBiometricSettings`, `saveBiometricSettings`, `uploadBiometric`, `saveBiometricMap`, `getBiometricRecords` | `GET/PUT /api/biometric/settings` (tolerance), `POST /api/biometric/upload?name=` (raw file body), `PUT /api/biometric/map`, `GET /api/biometric/records` |
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
`master_registrations`, `master_batches`, `master_attendance`, `master_products`, `master_oldRegistrations`, `master_vendors`, `master_assets`, `work_assignments`, `settings` (HR policy), `leave_requests`, `halfyearly_reports`, `course_requests`, `manager_otps` (expire automatically), `notifications`, `counters` (entry numbers DAE-0001…).

Rules enforced on the server: one manager only, created after the emailed 6-digit code is verified
(10 minutes, 5 attempts) and is never returned by the API or written to the log; Admin and Manager
add, edit, disable or delete employees (HR can view them); faculty and staff only add or change
their own entries and only see their own dashboard and reports; no overlapping time slots; the
Monthly Working Hrs Report is for HR, Admin and Manager.

## Tech stack

React 19, Vite 7, Tailwind CSS 4, React Router 7, Recharts, ExcelJS, lucide-react icons. JavaScript
(JSX). Backend: FastAPI, PyMongo, PyJWT, bcrypt.
