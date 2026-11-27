import {
  LayoutDashboard,
  Database,
  BarChart3,
  Megaphone,
  GraduationCap,
  ShieldCheck,
  LifeBuoy,
  MonitorSmartphone,
  FileBarChart,
  Settings,
  LogOut,
} from 'lucide-react';
import { MASTER_MENU } from './masterMenu';
import { NO_ENTRY_ROLES, WORKING_HOURS_ROLES } from '../utils/permissions';

/**
 * Sidebar navigation: Dashboard, Master, then the department menus in the agreed
 * order (Faculty, Lab Support, MIS, Digital Marketing, Admin, Marketing, HR).
 * `restricted: true` items were greyed out for the FACULTY role in the legacy app
 * and stay visible-but-locked here; the backend will decide this per role later.
 */
const ADMIN_ONLY = ['ADMIN', 'MANAGER'];
const ADMIN_PAGES = [
  // v61: Data Upload, Batch and Batch Import: Admin and Super Admin only (not in the HR / MIS menus)
  { key: 'data-upload', label: 'Data Upload', to: '/admin/data-upload', roles: ADMIN_ONLY },
  { key: 'admin-employees', label: 'Employees', to: '/master/employees' },
  { key: 'admin-inactive-employees', label: 'Inactive Employees', to: '/master/inactive-employees', roles: ['HR', 'MIS', 'ADMIN', 'MANAGER'] },
  { key: 'admin-batch', label: 'Batch', to: '/master/batches', roles: ADMIN_ONLY },
  { key: 'admin-batch-import', label: 'Batch Import', to: '/master/batch-import', roles: ADMIN_ONLY },
  {
    key: 'admin-external-faculty',
    label: 'External Faculty',
    roles: ['HR', 'MIS', 'ADMIN', 'MANAGER'],
    children: [
      { key: 'ext-add', label: 'Add External Faculty', to: '/master/externalFaculty' },
      { key: 'ext-report', label: 'External Faculty Monthly Report', to: '/master/external-faculty-report' },
      { key: 'ext-certs', label: 'External Certifications', to: '/master/external-certifications' },
    ],
  },
  { key: 'admin-course', label: 'Course', to: '/master/courses' },
  { key: 'admin-biometric', label: 'Biometric', to: '/master/biometric' },
  { key: 'admin-dropdown-values', label: 'Dropdown Values', to: '/master/dropdown-values' },
];
const HR_PAGE_ROLES = ['HR', 'MIS', 'ADMIN', 'MANAGER'];
// v60: Attendance is inside the Admin and HR menus (no longer its own menu on the left).
const ATTENDANCE_GROUP = (prefix) => ({
  key: `${prefix}-attendance`,
  label: 'Attendance',
  roles: HR_PAGE_ROLES,
  children: [
    { key: `${prefix}-attendance-entry`, label: 'Daily Entry Submission', to: '/attendance/staff/entry' },
    { key: `${prefix}-attendance-print`, label: 'Print', to: '/attendance/staff/print' },
    { key: `${prefix}-attendance-timesheet`, label: 'Time Sheet', to: '/attendance/staff/time-sheet' },
  ],
});

export const NAVIGATION = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  {
    key: 'master',
    label: 'Master',
    icon: Database,
    section: 'master',
    children: MASTER_MENU.map((m) => ({ key: `master-${m.key}`, label: m.label, to: m.to, roles: m.roles })),
  },
  // Department menus in the agreed order: Faculty, Lab Support, MIS, Digital Marketing, Admin, Marketing, HR.
  {
    key: 'faculty',
    label: 'Faculty',
    icon: GraduationCap,
    section: 'faculty',
    children: [
      {
        key: 'daily-activity',
        label: 'Daily Activity',
        children: [
          { key: 'entry', label: 'Entry', to: '/faculty/daily-activity/entry', hideRoles: NO_ENTRY_ROLES }, // HR, Admin, Super Admin only view
          { key: 'history', label: 'My Entries', to: '/faculty/daily-activity/history', hideRoles: NO_ENTRY_ROLES },
          { key: 'history-all', label: 'Faculty Entries', to: '/faculty/daily-activity/history', roles: NO_ENTRY_ROLES },
          { key: 'print', label: 'Print', to: '/faculty/daily-activity/print' },
        ],
      },
      { key: 'students-mark-entry', label: 'Students Mark Entry', to: '/faculty/students-mark-entry' },
      { key: 'others', label: 'Others', to: '/faculty/daily-activity/entry?type=others', hideRoles: NO_ENTRY_ROLES },
      { key: 'monthly-report', label: 'Monthly Report', to: '/faculty/reports/monthly' },
      { key: 'monthly-working-hrs-report', label: 'Monthly Working Hrs Report', to: '/faculty/reports/working-hours', roles: WORKING_HOURS_ROLES },
    ],
  },
  { key: 'lab-support', label: 'Lab Support', icon: LifeBuoy, restricted: true, section: 'labSupport' },
  // v60: the MIS role (and the Super Admin) open the MIS menu: every HR page except the Halfyearly Program
  // Report and its mails. For the other roles it stays a locked item.
  {
    key: 'mis',
    label: 'MIS',
    icon: BarChart3,
    section: 'mis',
    roles: ['MIS', 'MANAGER'],
    children: [
      { key: 'mis-hr-policy', label: 'HR Policy', to: '/hr-report/policy' },
      ...ADMIN_PAGES.filter((p) => p.roles !== ADMIN_ONLY).map((p) => ({ ...p, key: `mis-${p.key}`, roles: p.roles || HR_PAGE_ROLES })),
      { key: 'mis-incentive', label: 'Incentive', roles: ['MIS', 'HR', 'ADMIN', 'MANAGER'], children: [{ key: 'mis-incentive-amount', label: 'Incentive Amount', to: '/mis/incentive-amount' }] },
      ATTENDANCE_GROUP('mis'),
    ],
  },
  { key: 'mis-locked', label: 'MIS', icon: BarChart3, restricted: true, section: 'mis', hideRoles: ['MIS', 'MANAGER'] },
  { key: 'digital-marketing', label: 'Digital Marketing', icon: MonitorSmartphone, restricted: true, section: 'digitalMarketing' },
  {
    key: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    section: 'admin',
    children: [...ADMIN_PAGES, ATTENDANCE_GROUP('admin')],
  },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, restricted: true, section: 'marketing' },
  {
    key: 'hr-report',
    label: 'HR',
    icon: FileBarChart,
    section: 'hr',
    hideRoles: ['MIS'], // v60: MIS has these pages in the MIS menu
    children: [
      { key: 'hr-policy', label: 'HR Policy', to: '/hr-report/policy' },
      { key: 'halfyearly', label: 'Halfyearly Program Report', to: '/hr-report/halfyearly', hideRoles: ['MIS'] },
      { key: 'cert-status', label: 'Certification Mails', to: '/hr-report/certification-status', roles: HR_PAGE_ROLES, hideRoles: ['MIS'] },
      // The Admin menu pages, also here for the HR and Admin roles.
      // Deleted Employees is left out of the HR menu: Super Admin only, in the Admin menu.
      ...ADMIN_PAGES.map((p) => ({ ...p, key: `hr-${p.key}`, roles: p.roles || HR_PAGE_ROLES })),
      ATTENDANCE_GROUP('hr'),
    ],
  },
];

export const FOOTER_NAVIGATION = [
  { key: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
  { key: 'exit', label: 'Exit', icon: LogOut, action: 'logout' },
];
