// Role-based access. The backend must enforce the same rules on its endpoints.
export const ROLES = { FACULTY: 'FACULTY', HR: 'HR', MIS: 'MIS', ADMIN: 'ADMIN', MANAGER: 'MANAGER' };

/** Roles allowed to open the Monthly Working Hrs Report. */
export const WORKING_HOURS_ROLES = [ROLES.HR, ROLES.MIS, ROLES.ADMIN, ROLES.MANAGER];

/** True when the item has no role restriction or the user's role is in it. */
export const canAccess = (user, roles) => !roles || roles.includes(user?.role);
/** A menu item: allowed by `roles` and not hidden by `hideRoles`. */
export const canSeeItem = (user, item) => canAccess(user, item.roles) && !(item.hideRoles || []).includes(user?.role);

/** Roles allowed to maintain master data (courses, chapters / session details). */
export const MASTER_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/** Roles that can see every employee's details, dashboard and work hours (HR view-only). */
export const PEOPLE_VIEW_ROLES = [ROLES.HR, ROLES.MIS, ROLES.ADMIN, ROLES.MANAGER];

/**
 * Menu (tab) access set by the Super Admin in Master › Role Access. The server sends `user.sections`
 * ({ master, admin, hr, faculty, labSupport, ... }); the Super Admin always has every menu.
 */
const SECTION_DEFAULTS = { master: MASTER_ROLES, admin: MASTER_ROLES };
export const hasSection = (user, key) => {
  if (!user) return false;
  if (user.role === ROLES.MANAGER) return true;
  if (user.sections && key in user.sections) return !!user.sections[key];
  return SECTION_DEFAULTS[key] ? SECTION_DEFAULTS[key].includes(user.role) : true;
};

/** The Super Admin role is shown as "Super Admin" everywhere (the stored role key stays MANAGER). */
export const SUPER_ADMIN_LABEL = 'Super Admin';
export const roleLabel = (role, label) => (role === ROLES.MANAGER ? SUPER_ADMIN_LABEL : label || role);
/** Only the Super Admin deletes records (courses, chapters, batches, dropdown values, employees ...). */
export const isSuperAdmin = (user) => user?.role === ROLES.MANAGER;

/** HR and Admin roles also get the admin pages (Employees, Batch, Course, ...) in the HR menu. */
const HR_MANAGE_ROLES = [ROLES.HR, ROLES.MIS, ROLES.ADMIN];
export const hrManages = (user) => hasSection(user, 'hr') && HR_MANAGE_ROLES.includes(user?.role);

/** Data Upload, Employees, Batch, Batch Import, Course, Biometric, Dropdown Values: Master, Admin and HR menus. */
export const canManage = (user) => hasSection(user, 'master') || hasSection(user, 'admin') || hrManages(user);

/** Employees can be viewed, added and edited by whoever manages (no delete unless Super Admin). */
export const canViewPeople = (user) => canManage(user);

/** HR, Admin and Super Admin do not record entries; they view faculty entries and dashboards. */
export const NO_ENTRY_ROLES = [ROLES.HR, ROLES.MIS, ROLES.ADMIN, ROLES.MANAGER];
export const makesEntries = (user) => !!user && !NO_ENTRY_ROLES.includes(user.role);

const SHARED_PAGES = ['/master/batches', '/master/externalFaculty', '/master/external-faculty-report', '/master/external-certifications', '/master/batch-import', '/master/courses', '/master/biometric', '/master/dropdown-values', '/admin/data-upload', '/admin/yearly-holidays'];

/** Which menu(s) a page address belongs to (for blocking typed-in addresses of a hidden menu). */
export const sectionForPath = (path) => {
  if (path.startsWith('/master/employees') || path.startsWith('/master/deleted-employees') || path.startsWith('/master/inactive-employees')) return null; // HR too; the page checks
  if (SHARED_PAGES.some((p) => path.startsWith(p))) return ['master', 'admin', 'hr', 'mis']; // HR / MIS: the page checks the role
  if (path.startsWith('/master')) return 'master';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/mis/')) return ['mis', 'hr', 'admin']; // v62 Incentive: the page checks the role
  if (path.startsWith('/hr-report')) return ['hr', 'mis']; // v60: HR Policy is in the MIS menu too
  if (path.startsWith('/faculty') || path.startsWith('/entries')) return 'faculty';
  return null;
};

/** HR, Admin and Super Admin see everyone's daily entries; everyone else sees only their own. */
export const ENTRY_VIEW_ALL_ROLES = [ROLES.HR, ROLES.MIS, ROLES.ADMIN, ROLES.MANAGER];
export const seesAllEntries = (user) => ENTRY_VIEW_ALL_ROLES.includes(user?.role);
/** Admin and Super Admin can edit anyone's entry; everyone else only their own (same rule as the server). */
export const canEditEntry = (user, entry) => [ROLES.ADMIN, ROLES.MANAGER].includes(user?.role) || (!!entry && entry.facultyCode === user?.code);
/** Delete: your own entry, or the Super Admin for anyone's. */
export const canDeleteEntry = (user, entry) => isSuperAdmin(user) || (!!entry && entry.facultyCode === user?.code);
