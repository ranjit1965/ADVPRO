import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import Input from '../../components/ui/Input';
import { useConfirm } from '../../context/ConfirmContext';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ROLES } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';

const ROLE_LABELS = { ADMIN: 'Admin', HR: 'HR', FACULTY: 'Faculty', STAFF: 'Staff' };
const roleLabel = (r) => ROLE_LABELS[r] || r;

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
  const [newRole, setNewRole] = useState('');
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();

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
  const defaults = () => setAccess(data.defaults);
  // Keep unsaved ticks of the other roles when the role list changes.
  const merge = (d) => {
    setData(d);
    setAccess((a) => Object.fromEntries(d.roles.map((r) => [r.key, a[r.key] ?? d.access[r.key]])));
  };

  const addRole = async (e) => {
    e?.preventDefault();
    if (!newRole.trim()) return;
    setAdding(true);
    try {
      merge(await api.addRole(newRole.trim()));
      toast.success(`Role ${newRole.trim().toUpperCase()} added. Tick its menus and Save, then choose it for employees in Master › Employees.`);
      setNewRole('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeRole = async (r) => {
    if (!(await confirm({ title: 'Remove role', message: `Remove the role ${r.key}? Only possible when no employee has it.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
    try {
      merge(await api.deleteRole(r.key));
      toast.success(`Role ${r.key} removed.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

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
        description="Tick the side-pane menus each role can open. Unticked menus are hidden for that role and their data is refused by the server. The Manager always has every menu."
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Role Access' }]}
        actions={
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={defaults}>Default access</Button>
            <Button icon={Save} loading={saving} disabled={!changed} onClick={save}>Save</Button>
          </>
        }
      />
      <Card className="mb-5" title="Roles" description="Add a role (for example ACCOUNTS or LAB ASSISTANT), tick its menus below and Save. Then pick it as the Role in Master › Employees.">
        <form onSubmit={addRole} className="flex flex-wrap items-end gap-3">
          <Input label="New role name" className="w-64" maxLength={30} value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. ACCOUNTS" />
          <Button type="submit" icon={Plus} loading={adding} disabled={!newRole.trim()}>Add role</Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.roles.map((r) => (
            <span key={r.key} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1 text-[13px]">
              <b>{roleLabel(r.key)}</b>
              <span className="text-ink-500">{r.users} employee{r.users === 1 ? '' : 's'}</span>
              {r.custom && (
                <button type="button" onClick={() => removeRole(r)} className="rounded p-0.5 text-ink-400 hover:text-danger-600" aria-label={`Remove role ${r.key}`} title="Remove role">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      </Card>
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Menu access per role</caption>
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-[13px] text-ink-600">
                <th scope="col" className="px-4 py-2.5 font-semibold">Menu</th>
                {data.roles.map((r) => (
                  <th key={r.key} scope="col" className="px-4 py-2.5 text-center font-semibold">{roleLabel(r.key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr key={s.key} className="border-b border-ink-100 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-ink-900">{s.label}</th>
                  {data.roles.map(({ key: r }) => (
                    <td key={r} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={!!access[r]?.[s.key]}
                        onChange={() => toggle(r, s.key)}
                        aria-label={`${s.label} for ${roleLabel(r)}`}
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
        <li><b>Dashboard</b> and <b>Settings</b> are always shown: Dashboard is the home page. Lab Support, MIS, Digital Marketing, Marketing and Transaction are not built yet; untick them to hide them.</li>
        <li>A new role starts with the same menus as Staff. It works like Staff everywhere else (own entries and reports).</li>
        <li>An Admin whose Admin access you removed on the Employees page works with the <b>Staff</b> column.</li>
        {data.updatedAt && <li>Last changed {formatDateTime(data.updatedAt)} by {data.updatedBy}.</li>}
      </ul>
    </>
  );
}
