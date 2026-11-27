import { masters } from './masters.json';

/** Master menu in the legacy order. Generic masters open /master/<key>; the rest have their own screens. */
export const MASTER_MENU = [
  { key: 'batches', label: 'Batch', roles: ['ADMIN', 'MANAGER'] },
  { key: 'externalFaculty', label: 'External Faculty' },
  { key: 'batchImport', label: 'Batch Import', to: '/master/batch-import', roles: ['ADMIN', 'MANAGER'], description: 'Upload the BatchMaster Excel file and assign each batch to its faculty.' },
  { key: 'employees', label: 'Employees', to: '/master/employees', description: 'Add, edit, disable and delete employee and faculty logins.' },
  { key: 'courses', label: 'Course', to: '/master/courses', description: 'Courses and their chapter / session details.' },
  { key: 'monthlyStaffReport', label: 'MontlyStaffReport', to: '/faculty/reports/working-hours', description: 'Working hours per faculty for a month.' },
  { key: 'inactiveEmployees', label: 'Inactive Employees', to: '/master/inactive-employees', roles: ['HR', 'ADMIN', 'MANAGER'], description: 'Employees who cannot sign in (made inactive by hand or by the missing-entry check). Make active lets them sign in again.' },
  { key: 'roleAccess', label: 'Roles & Access', to: '/master/role-access', roles: ['MANAGER'], description: 'Super Admin only: create roles and tick which menus each role can open.' },
  { key: 'dropdownValues', label: 'Dropdown Values', to: '/master/dropdown-values', description: 'Add, rename or remove the values of every dropdown, and set who gets class issue alerts.' },
  { key: 'biometric', label: 'Biometric', to: '/master/biometric', description: 'Upload the biometric file; Time In / Time Out are compared with the entries.' },
].map((m) => {
  const def = masters.find((d) => d.key === m.key);
  return { ...m, to: m.to || `/master/${m.key}`, description: m.description || def?.description };
});

export const masterByKey = (key) => masters.find((m) => m.key === key);
