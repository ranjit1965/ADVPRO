// Role-based access. The backend must enforce the same rules on its endpoints.
export const ROLES = { FACULTY: 'FACULTY', HR: 'HR', ADMIN: 'ADMIN', MANAGER: 'MANAGER' };

/** Roles allowed to open the Monthly Working Hrs Report. */
export const WORKING_HOURS_ROLES = [ROLES.HR, ROLES.ADMIN, ROLES.MANAGER];

/** True when the item has no role restriction or the user's role is in it. */
export const canAccess = (user, roles) => !roles || roles.includes(user?.role);

/** Roles allowed to maintain master data (courses, chapters / session details). */
export const MASTER_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/** Roles that can see every employee's details, dashboard and work hours (HR view-only). */
export const PEOPLE_VIEW_ROLES = [ROLES.HR, ROLES.ADMIN, ROLES.MANAGER];

/**
 * Menu (tab) access set by the Manager in Master › Role Access. The server sends `user.sections`
 * ({ master, admin, hr, faculty, labSupport, ... }); the Manager always has every menu.
 */
const SECTION_DEFAULTS = { master: MASTER_ROLES, admin: MASTER_ROLES };
export const hasSection = (user, key) => {
  if (!user) return false;
  if (user.role === ROLES.MANAGER) return true;
  if (user.sections && key in user.sections) return !!user.sections[key];
  return SECTION_DEFAULTS[key] ? SECTION_DEFAULTS[key].includes(user.role) : true;
};

/** Employees, Deleted Employees, Batch, Batch Import, Course and Biometric: in both the Master and the Admin menu. */
export const canManage = (user) => hasSection(user, 'master') || hasSection(user, 'admin');

/** Employees and Deleted Employees can also be viewed (read-only) by HR / Admin from the HR menu. */
export const canViewPeople = (user) => canManage(user) || (hasSection(user, 'hr') && PEOPLE_VIEW_ROLES.includes(user?.role));

const SHARED_PAGES = ['/master/batches', '/master/batch-import', '/master/courses', '/master/biometric'];

/** Which menu(s) a page address belongs to (for blocking typed-in addresses of a hidden menu). */
export const sectionForPath = (path) => {
  if (path.startsWith('/master/employees') || path.startsWith('/master/deleted-employees')) return null; // HR too; the page checks
  if (SHARED_PAGES.some((p) => path.startsWith(p))) return ['master', 'admin'];
  if (path.startsWith('/master')) return 'master';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/hr-report')) return 'hr';
  if (path.startsWith('/faculty') || path.startsWith('/entries')) return 'faculty';
  return null;
};
