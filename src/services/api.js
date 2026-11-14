// Service layer. Pages call only these functions; every one is a REST call to the
// FastAPI backend, which stores all data in MongoDB.
import { request, tokenStore } from './http';

export { API_BASE_URL } from './http';

/* ----------------------------------------------------------------- Auth */

export async function login(userId, password) {
  const data = await request('/auth/login', { method: 'POST', body: { userId, password } });
  tokenStore.set(data.accessToken);
  return data.user;
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' }).catch(() => {});
  tokenStore.clear();
}

export async function getCurrentUser() {
  if (!tokenStore.get()) return null;
  return request('/auth/me');
}

/** PUT /api/auth/me/preferences */
export async function savePreferences(prefs) {
  return request('/auth/me/preferences', { method: 'PUT', body: prefs });
}

export async function changePassword(currentPassword, newPassword) {
  return request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}

/* ---------------------------------------------- Manager account (email OTP) */

/** GET /api/auth/setup-status -> { managerExists } */
export async function getSetupStatus() {
  return request('/auth/setup-status');
}

/** POST /api/auth/manager/request-otp: emails a 6-digit code. Only while no manager exists. */
export async function requestManagerOtp(name, email) {
  return request('/auth/manager/request-otp', { method: 'POST', body: { name, email } });
}

/** POST /api/auth/manager/verify: checks the code and creates the manager account. */
export async function verifyManagerOtp({ email, otp, name, userId, password }) {
  return request('/auth/manager/verify', { method: 'POST', body: { email, otp, name, userId, password } });
}

/** POST /api/auth/forgot-password/request-otp: emails a reset code to the manager's email on record. -> { email (masked) } */
export async function requestPasswordResetOtp(userId) {
  return request('/auth/forgot-password/request-otp', { method: 'POST', body: { userId } });
}

/** POST /api/auth/forgot-password/reset: checks the code and sets the manager's new password. */
export async function resetPasswordWithOtp({ userId, otp, newPassword }) {
  return request('/auth/forgot-password/reset', { method: 'POST', body: { userId, otp, newPassword } });
}

/* --------------------------------------------------- Employees (Master › Employees: Manager and Admin) */

export async function getUsers() {
  return request('/users');
}

export async function createUser(user) {
  return request('/users', { method: 'POST', body: user });
}

export async function updateUser(userId, patch) {
  return request(`/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: patch });
}

export async function deleteUser(userId) {
  return request(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

/** Roles for the Employee form, from the roles table: [{ key, label }]. */
export async function getRoles() {
  return request('/access/roles');
}

export async function addRole(name, description = '') {
  return request('/access/roles', { method: 'POST', body: { name, description } });
}

export async function deleteRole(role) {
  return request(`/access/roles/${encodeURIComponent(role)}`, { method: 'DELETE' });
}

/** One deleted employee with their saved entries, leave, work and halfyearly records. */
export async function getDeletedUser(userId) {
  return request(`/users/deleted/${encodeURIComponent(userId)}`);
}

/** Deleted employees (moved here by Delete), newest first. */
export async function getDeletedUsers() {
  return request('/users/deleted/list');
}

/** Bring a deleted employee back (active again). */
export async function restoreUser(userId) {
  return request(`/users/deleted/${encodeURIComponent(userId)}/restore`, { method: 'POST' });
}

/** Master › Role Access (Manager): which menus each role may open. */
export async function getRoleAccess() {
  return request('/access');
}

export async function saveRoleAccess(roles) {
  return request('/access', { method: 'PUT', body: { roles } });
}

/** Missing-entry check: who would be made inactive now, its settings and last run. */
export async function getAutoInactive() {
  return request('/users/auto-inactive');
}

/** Run the missing-entry check now (it also runs by itself every day). */
export async function runAutoInactive() {
  return request('/users/auto-inactive/run', { method: 'POST' });
}

export async function getNotifications() {
  return request('/notifications');
}

/* -------------------------------------------------------------- Lookups */


export async function getLookups() {
  return request('/lookups');
}

/** Used by Ctrl + A on College Name / Dept, and "Add new heading" on the Others tab. */
export async function addLookupValue(kind, value) {
  return request(`/lookups/${kind}`, { method: 'POST', body: { value } });
}

/** "Add course" on the Learning tab: any signed-in user can add a missing course. Returns { id, name }. */
export async function addCourse(course) {
  return request('/lookups/courses', { method: 'POST', body: course });
}

/** Class tab "Request Batch No": saved, emailed and sent on WhatsApp to Manager / Admin. Returns { id, emailedTo, whatsappTo }. */
export async function requestBatch(body) {
  return request('/batch-requests', { method: 'POST', body });
}

/** Master › Course: pending Batch No requests. */
export async function getBatchRequests(status = 'Pending') {
  return request('/batch-requests', { params: { status } });
}

export async function setBatchRequestStatus(id, status) {
  return request(`/batch-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
}

/** Class tab "Request new course": saved and emailed to every Manager and Admin. Returns { id, emailedTo }. */
export async function requestCourse(body) {
  return request('/course-requests', { method: 'POST', body });
}

/** Master › Courses: requests waiting to be added (status Pending by default). */
export async function getCourseRequests(status = 'Pending') {
  return request('/course-requests', { params: { status } });
}

export async function setCourseRequestStatus(id, status) {
  return request(`/course-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
}

/* ------------------------------------------- Master: courses and chapters */
// Manager and Admin maintain these; the Class tab reads them through getLookups().


/** POST /api/master/courses (new) or PUT /api/master/courses/{id} */
export async function saveCourse(course, isNew) {
  return isNew ? request('/master/courses', { method: 'POST', body: course }) : request(`/master/courses/${encodeURIComponent(course.id)}`, { method: 'PUT', body: course });
}

/** DELETE /api/master/courses/{id}: also removes its chapters. */
export async function deleteCourse(id) {
  return request(`/master/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** POST /api/master/chapters (new) or PUT /api/master/chapters/{courseId}/{no} */
export async function saveChapter(chapter, originalNo) {
  const isNew = originalNo == null;
  return isNew
    ? request('/master/chapters', { method: 'POST', body: chapter })
    : request(`/master/chapters/${encodeURIComponent(chapter.courseId)}/${originalNo}`, { method: 'PUT', body: chapter });
}

export async function deleteChapter(courseId, no) {
  return request(`/master/chapters/${encodeURIComponent(courseId)}/${no}`, { method: 'DELETE' });
}

/* --------------------------------------------------------------- Masters */
// Master › Registration, Batch, Attendence, Product, Old Registrations, Vendor, Assest.
// Each is its own collection (master_<key>) described in src/config/masters.json.
// Admin and Manager maintain them.



/** GET /api/masters/{key} */
export async function getMasterRecords(key) {
  return request(`/masters/${key}`);
}

/** POST /api/masters/{key} (new) or PUT /api/masters/{key}/{id} */
export async function saveMasterRecord(key, record) {
  return record.id ? request(`/masters/${key}/${record.id}`, { method: 'PUT', body: record }) : request(`/masters/${key}`, { method: 'POST', body: record });
}

/** DELETE /api/masters/{key}/{id} */
export async function deleteMasterRecord(key, id) {
  return request(`/masters/${key}/${id}`, { method: 'DELETE' });
}

/** POST /api/masters/{key}/delete-many: deletes the ticked records, returns { deleted } */
export async function deleteMasterRecords(key, ids) {
  return request(`/masters/${key}/delete-many`, { method: 'POST', body: { ids } });
}

/* ------------------------------------------------------------ HR_Report */
// HR Policy and Your Info.

export const HR_ROLES = ['HR', 'MANAGER', 'ADMIN'];

/** GET /api/hr/policy */
export async function getHrPolicy() {
  return request('/hr/policy');
}

/** PUT /api/hr/policy (HR, Manager, Admin) */
export async function saveHrPolicy(content) {
  return request('/hr/policy', { method: 'PUT', body: { content } });
}


/** GET /api/hr/info?userId= : your own info; HR, Manager and Admin can open anyone's. */
export async function getEmployeeInfo(userId) {
  return request('/hr/info', { params: { userId } });
}

/** PUT /api/hr/info/{userId} (HR, Manager, Admin) */
export async function saveEmployeeInfo(userId, patch) {
  return request(`/hr/info/${encodeURIComponent(userId)}`, { method: 'PUT', body: patch });
}

/* ------------------------------------------------------- Daily activity */



/**
 * GET /api/daily-entries
 * filters: q, facultyCode, activityType, facultyIn, dateFrom, dateTo,
 *          sortBy, sortDir, page, pageSize
 */
export async function getDailyEntries(filters = {}) {
  return request('/daily-entries', { params: filters });
}

export async function getDailyEntry(id) {
  return request(`/daily-entries/${id}`);
}



/** POST /api/daily-entries */
export async function createDailyEntry(payload) {
  return request('/daily-entries', { method: 'POST', body: payload });
}

/** PUT /api/daily-entries/{id} */
export async function updateDailyEntry(id, payload) {
  return request(`/daily-entries/${id}`, { method: 'PUT', body: payload });
}

/** DELETE /api/daily-entries/{id} */
export async function deleteDailyEntry(id) {
  return request(`/daily-entries/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------ Dashboard */



export async function getDashboardSummary(facultyCode) {
  return request('/dashboard', { params: { facultyCode } });
}

/* -------------------------------------------------------------- Reports */


/* ------------------------------------------------------------ Biometric */
// Master › Biometric / Admin › Data Upload: device file upload, tolerance, and links for unmatched device users.

export async function getBiometricSettings() {
  return request('/biometric/settings');
}

export async function saveBiometricSettings(body) {
  return request('/biometric/settings', { method: 'PUT', body });
}

/** Saves the device export file chosen in the browser (.xlsx, .xls or .csv): read and stored in the database. */
export async function uploadBiometric(file) {
  return request('/biometric/upload', { method: 'POST', body: file, params: { name: file.name } });
}

/** Links a device user id / name to an employee code (empty code removes the link) and moves their days. */
export async function saveBiometricMap(deviceKey, code) {
  return request('/biometric/map', { method: 'PUT', body: { deviceKey, code: code || null } });
}

export async function getBiometricRecords(month, code) {
  return request('/biometric/records', { params: { month, code } });
}

/* --------------------------------------------------------- Batch import */
// Master › Batch Import / Admin › Data Upload: the BatchMaster Excel file.

export async function getBatchImportSettings() {
  return request('/batch-import/settings');
}

/** Saves the BatchMaster file chosen in the browser (.xlsx, .xls or .csv): read and stored in the database. */
export async function uploadBatches(file) {
  return request('/batch-import/upload', { method: 'POST', body: file, params: { name: file.name } });
}

/** Links a faculty short name from the file to an employee code (empty code removes the link) and assigns its batches. */
export async function saveBatchFacultyMap(shortName, code) {
  return request('/batch-import/map', { method: 'PUT', body: { shortName, code: code || null } });
}

/** GET /api/reports/monthly?month=YYYY-MM&facultyCode= */
export async function getMonthlyReport({ month, facultyCode, activityType, facultyIn }) {
  return request('/reports/monthly', { params: { month, facultyCode, activityType, facultyIn } });
}

/** GET /api/reports/working-hours?month=YYYY-MM */
export async function getWorkingHoursReport({ month, facultyCode }) {
  return request('/reports/working-hours', { params: { month, facultyCode } });
}

/* -------------------------------------------------- Students mark entry */


export async function getStudentMarks(query) {
  return request('/student-marks', { params: query });
}

export async function saveStudentMarks(query, rows) {
  return request('/student-marks', { method: 'POST', body: { ...query, rows } });
}

/** GET /api/hr/halfyearly?employeeCode= : Halfyearly Program Report rows (employees see only their own). */
export async function getHalfyearly({ employeeCode } = {}) {
  return request('/hr/halfyearly', { params: { employeeCode } });
}

/** POST /api/hr/halfyearly (HR, Manager, Admin): assign a target certification and its months. */
export async function assignHalfyearly(body) {
  return request('/hr/halfyearly', { method: 'POST', body });
}

/** PUT /api/hr/halfyearly/{id} (HR, Manager, Admin): change the assignment. */
export async function updateHalfyearly(id, body) {
  return request(`/hr/halfyearly/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

/** PUT /api/hr/halfyearly/{id}/status: achieved, completion date, certification code, delivery ready. */
export async function updateHalfyearlyStatus(id, body) {
  return request(`/hr/halfyearly/${encodeURIComponent(id)}/status`, { method: 'PUT', body });
}

/** DELETE /api/hr/halfyearly/{id} (HR, Manager, Admin) */
export async function deleteHalfyearly(id) {
  return request(`/hr/halfyearly/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** PUT /api/users/{userId}/admin-access (Manager only): give (true) or remove (false) an Admin's access. */
export async function setAdminAccess(userId, enabled) {
  return request(`/users/${encodeURIComponent(userId)}/admin-access`, { method: 'PUT', body: { enabled } });
}
