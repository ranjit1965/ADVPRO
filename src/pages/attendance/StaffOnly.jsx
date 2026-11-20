import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';

export const ATTENDANCE_ROLES = ['HR', 'ADMIN', 'MANAGER'];

/** Attendance pages: HR, Admin and the Super Admin only. */
export default function StaffOnly({ title, children }) {
  const { user } = useAuth();
  if (!ATTENDANCE_ROLES.includes(user?.role)) {
    return (
      <>
        <PageHeader title={title} />
        <Card><p className="text-sm text-ink-600">Access restricted. Only HR, Admin and Super Admin can open Attendance.</p></Card>
      </>
    );
  }
  return children;
}
