import { ArchiveRestore, UserCheck, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { canViewPeople, canManage, isSuperAdmin, roleLabel } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';

/**
 * v60 (was Deleted Employees): everyone who cannot sign in now, made inactive by hand or by the missing-entry
 * check. Their names still show in the lists and reports. Make active lets them sign in again.
 */
export default function InactiveEmployees() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => (canViewPeople(user) ? api.getInactiveUsers() : Promise.resolve([])), []);

  if (!canViewPeople(user)) {
    return (
      <>
        <PageHeader title="Inactive Employees" />
        <Card><p className="text-sm text-ink-600">Only HR, Admin and the Super Admin see this list.</p></Card>
      </>
    );
  }

  const activate = async (r) => {
    try {
      await api.updateUser(r.userId, { active: true });
      toast.success(`${r.name} is active again. The missing-entry check counts only the working days from tomorrow.`);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    { key: 'code', header: 'Short Name' },
    { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId || '-' },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    { key: 'role', header: 'Role', render: (r) => roleLabel(r.role) },
    { key: 'inactiveAt', header: 'Inactive since', render: (r) => (r.inactiveAt ? formatDateTime(r.inactiveAt) : '-') },
    {
      key: 'reason',
      header: 'Why',
      render: (r) => (
        <span>
          {r.inactiveReason || '-'}
          {r.autoInactive && <span className="ml-1.5 whitespace-nowrap rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700">no entries</span>}
        </span>
      ),
    },
    canManage(user) && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => activate(r)}>Make active</Button>,
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Inactive Employees"
        breadcrumb={[{ label: 'Admin' }, { label: 'Inactive Employees' }]}
        description="These employees cannot sign in. Their names and records still show in every list and report."
        actions={isSuperAdmin(user) && <Button variant="secondary" icon={ArchiveRestore} onClick={() => navigate('/master/deleted-employees')}>Deleted before v60</Button>}
      />
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !loading && !data?.length ? (
          <EmptyState icon={UserX} title="No inactive employees" message="Everyone can sign in." />
        ) : (
          <DataTable columns={columns} rows={data || []} rowKey="userId" loading={loading} caption="Inactive employees" />
        )}
      </Card>
    </>
  );
}
