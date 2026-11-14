import { masters } from './masters.json';

/** Master menu in the legacy order. Generic masters open /master/<key>; the rest have their own screens. */
export const MASTER_MENU = [
  { key: 'registrations', label: 'Registration' },
  { key: 'batches', label: 'Batch' },
  { key: 'batchImport', label: 'Batch Import', to: '/master/batch-import', description: 'Upload the BatchMaster Excel file and assign each batch to its faculty.' },
  { key: 'employees', label: 'Employees', to: '/master/employees', description: 'Add, edit, disable and delete employee and faculty logins.' },
  { key: 'courses', label: 'Course', to: '/master/courses', description: 'Courses and their chapter / session details.' },
  { key: 'attendance', label: 'Attendence' },
  { key: 'products', label: 'Product' },
  { key: 'oldRegistrations', label: 'Old Registrations' },
  { key: 'scheduling', label: 'Shedulling', to: '/master/scheduling', description: 'Assign work to employees and faculty and follow its progress.' },
  { key: 'monthlyStaffReport', label: 'MontlyStaffReport', to: '/faculty/reports/working-hours', description: 'Working hours per faculty for a month.' },
  { key: 'vendors', label: 'Vendor' },
  { key: 'assets', label: 'Assest' },
  { key: 'deletedEmployees', label: 'Deleted Employees', to: '/master/deleted-employees', description: 'Deleted employees with their saved entries and records. Restore brings them back.' },
  { key: 'roleAccess', label: 'Role Access', to: '/master/role-access', roles: ['MANAGER'], description: 'Manager only: tick which menus Admin, HR, Faculty and Staff can open.' },
  { key: 'biometric', label: 'Biometric', to: '/master/biometric', description: 'Upload the biometric file; Time In / Time Out are compared with the entries.' },
].map((m) => {
  const def = masters.find((d) => d.key === m.key);
  return { ...m, to: m.to || `/master/${m.key}`, description: m.description || def?.description };
});

export const masterByKey = (key) => masters.find((m) => m.key === key);
