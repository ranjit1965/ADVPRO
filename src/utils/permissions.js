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
