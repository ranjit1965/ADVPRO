import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ROLES } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';

const ROLE_LABELS = { ADMIN: 'Admin', HR: 'HR', FACULTY: 'Faculty', STAFF: 'Staff' };

/**
 * Master › Role Access (Manager only): tick which menus (tabs) each role may open. Unticked menus
 * disappear from that role's sidebar and the server refuses their data. The Manager keeps every menu.
 */
export default function RoleAccess() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [access, setAccess] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError('');
    api
      .getRoleAccess()
      .then((d) => {
        setData(d);
        setAccess(d.access);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (user?.role === ROLES.MANAGER) load();
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== ROLES.MANAGER) {
    return (
      <>
        <PageHeader title="Role Access" />
        <Card><p className="text-sm text-ink-600">Only the Manager can change which menus each role can open.</p></Card>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoader />;

  const toggle = (role, key) => setAccess((a) => ({ ...a, [role]: { ...a[role], [key]: !a[role][key] } }));
  const changed = JSON.stringify(access) !== JSON.stringify(data.access);
  const defaults = () =>
    setAccess(Object.fromEntries(data.roles.map((r) => [r, Object.fromEntries(data.sections.map((s) => [s.key, s.default.includes(r)]))])));

  const save = async () => {
    setSaving(true);
    try {
      const d = await api.saveRoleAccess(access);
      setData(d);
      setAccess(d.access);
      toast.success('Access saved. It applies to each person the next time they open or refresh the app.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Role Access"
        description="Tick the menus each role can open. Unticked menus are hidden for that role and their data is refused by the server. The Manager always has every menu."
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Role Access' }]}
        actions={
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={defaults}>Default access</Button>
            <Button icon={Save} loading={saving} disabled={!changed} onClick={save}>Save</Button>
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Menu access per role</caption>
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-[13px] text-ink-600">
                <th scope="col" className="px-4 py-2.5 font-semibold">Menu</th>
                {data.roles.map((r) => (
                  <th key={r} scope="col" className="px-4 py-2.5 text-center font-semibold">{ROLE_LABELS[r] || r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr key={s.key} className="border-b border-ink-100 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-ink-900">{s.label}</th>
                  {data.roles.map((r) => (
                    <td key={r} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={!!access[r]?.[s.key]}
                        onChange={() => toggle(r, s.key)}
                        aria-label={`${s.label} for ${ROLE_LABELS[r] || r}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-ink-600">
        <li><b>Master</b> gives the whole Master menu: employees, courses, batches, batch import, biometric, scheduling and the other masters.</li>
        <li><b>Admin</b> gives Data Upload (batch and biometric files).</li>
        <li><b>HR</b> shows the HR menu. HR and Admin can also edit HR Policy, employee info and Halfyearly reports while it is ticked.</li>
        <li>An Admin whose Admin access you removed on the Employees page works with the <b>Staff</b> column.</li>
        {data.updatedAt && <li>Last changed {formatDateTime(data.updatedAt)} by {data.updatedBy}.</li>}
      </ul>
    </>
  );
}
