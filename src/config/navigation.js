import {
  LayoutDashboard,
  Database,
  ArrowLeftRight,
  BarChart3,
  Megaphone,
  GraduationCap,
  ShieldCheck,
  LifeBuoy,
  MonitorSmartphone,
  FileBarChart,
  Settings,
  LogOut,
  ClipboardCheck,
} from 'lucide-react';
import { MASTER_MENU } from './masterMenu';
import { MASTER_ROLES, PEOPLE_VIEW_ROLES, WORKING_HOURS_ROLES } from '../utils/permissions';

/**
 * Sidebar navigation: Dashboard, My Work, Master, then the department menus in the agreed
 * order (Faculty, Lab Support, MIS, Digital Marketing, Admin, Marketing, HR), then Transaction.
 * `restricted: true` items were greyed out for the FACULTY role in the legacy app
 * and stay visible-but-locked here; the backend will decide this per role later.
 */
export const NAVIGATION = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { key: 'my-work', label: 'My Work', icon: ClipboardCheck, to: '/my-work' },
  {
    key: 'master',
    label: 'Master',
    icon: Database,
    roles: MASTER_ROLES,
    children: MASTER_MENU.map((m) => ({ key: `master-${m.key}`, label: m.label, to: m.to })),
  },
  // Department menus in the agreed order: Faculty, Lab Support, MIS, Digital Marketing, Admin, Marketing, HR.
  {
    key: 'faculty',
    label: 'Faculty',
    icon: GraduationCap,
    children: [
      {
        key: 'daily-activity',
        label: 'Daily Activity',
        children: [
          { key: 'entry', label: 'Entry', to: '/faculty/daily-activity/entry' },
          { key: 'history', label: 'My Entries', to: '/faculty/daily-activity/history' },
          { key: 'print', label: 'Print', to: '/faculty/daily-activity/print' },
        ],
      },
      { key: 'monthly-plan', label: 'Monthly Plan', to: '/faculty/monthly-plan' },
      { key: 'students-mark-entry', label: 'Students Mark Entry', to: '/faculty/students-mark-entry' },
      { key: 'others', label: 'Others', to: '/faculty/daily-activity/entry?type=others' },
      { key: 'monthly-report', label: 'Monthly Report', to: '/faculty/reports/monthly' },
      { key: 'monthly-working-hrs-report', label: 'Monthly Working Hrs Report', to: '/faculty/reports/working-hours', roles: WORKING_HOURS_ROLES },
    ],
  },
  { key: 'lab-support', label: 'Lab Support', icon: LifeBuoy, restricted: true },
  { key: 'mis', label: 'MIS', icon: BarChart3, restricted: true },
  { key: 'digital-marketing', label: 'Digital Marketing', icon: MonitorSmartphone, restricted: true },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, restricted: true },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, restricted: true },
  {
    key: 'hr-report',
    label: 'HR',
    icon: FileBarChart,
    children: [
      { key: 'employees', label: 'Employees', to: '/master/employees', roles: PEOPLE_VIEW_ROLES },
      { key: 'hr-policy', label: 'HR Policy', to: '/hr-report/policy' },
      { key: 'your-info', label: 'Your Info', to: '/hr-report/your-info' },
      { key: 'batch-completion', label: 'Batch Paper Completion', to: '/hr-report/batch-paper-completion' },
      { key: 'leave', label: 'Leave/Permission Form', to: '/hr-report/leave-permission' },
    ],
  },
  { key: 'transaction', label: 'Transaction', icon: ArrowLeftRight, restricted: true },
];

export const FOOTER_NAVIGATION = [
  { key: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
  { key: 'exit', label: 'Exit', icon: LogOut, action: 'logout' },
];
