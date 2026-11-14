import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ROLES } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';

/**
 * Master › Roles & Access (Manager only). Roles are stored in the `roles` collection: the Manager
 * creates them here, ticks which side-pane menus each one can open, and picks them for employees in
 * Master › Employees. Unticked menus are hidden for that role and refused by the server.
 */
export default function RoleAccess() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [access, setAccess] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const [adding, setAdding] = useState(false);

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
        <PageHeader title="Roles & Access" />
        <Card><p className="text-sm text-ink-600">Only the Manager can create roles and change which menus each role can open.</p></Card>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoader />;

  const toggle = (role, key) => setAccess((a) => ({ ...a, [role]: { ...a[role], [key]: !a[role][key] } }));
  const changed = JSON.stringify(access) !== JSON.stringify(data.access);
  // Keep unsaved ticks of the other roles when the role list changes.
  const merge = (d) => {
    setData(d);
    setAccess((a) => Object.fromEntries(d.roles.map((r) => [r.key, a[r.key] ?? d.access[r.key]])));
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

  const addRole = async (e) => {
    e?.preventDefault();
    if (newRole.name.trim().length < 2) return;
    setAdding(true);
    try {
      merge(await api.addRole(newRole.name.trim(), newRole.description.trim()));
      toast.success(`Role ${newRole.name.trim()} created. Tick its menus below and Save, then choose it for employees in Master › Employees.`);
      setNewRole({ name: '', description: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeRole = async (r) => {
    if (!(await confirm({ title: 'Delete role', message: `Delete the role ${r.label}? Only possible when no employee has it.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      merge(await api.deleteRole(r.key));
      toast.success(`Role ${r.label} deleted.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Roles & Access"
        description="Create roles, then tick the side-pane menus each role can open. The Manager always has every menu."
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Roles & Access' }]}
      />

      <Card className="mb-5" title="Roles" description="Every role here is offered in the Role list of Master › Employees. Admin, HR, Faculty and Staff are built in.">
        <form onSubmit={addRole} className="mb-4 flex flex-wrap items-end gap-3">
          <Input label="New role name" required className="w-56" maxLength={30} value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} placeholder="e.g. Accounts" />
          <Input label="Description" className="min-w-[220px] flex-1" maxLength={200} value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} placeholder="What this role does (optional)" />
          <Button type="submit" icon={Plus} loading={adding} disabled={newRole.name.trim().length < 2}>Create role</Button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Roles</caption>
            <thead>
              <tr className="border-b border-ink-100 text-left text-[13px] text-ink-600">
                <th scope="col" className="py-2 pr-4 font-semibold">Role</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Employees</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Created</th>
                <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.roles.map((r) => (
                <tr key={r.key} className="border-b border-ink-100 last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-ink-900">{r.label}</span> <span className="text-xs text-ink-500">{r.key}</span>
                    {!r.custom && <span className="ml-1.5 rounded-full bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600">built in</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-600">{r.description || '-'}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.users}</td>
                  <td className="py-2.5 pr-4 text-xs text-ink-500">{r.custom ? `${r.createdBy || ''}${r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ''}` : '-'}</td>
                  <td className="py-2.5 text-right">
                    {r.custom && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeRole(r)} aria-label={`Delete role ${r.label}`} title="Delete role" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Menu access"
        description="Tick a menu to give it to the role; untick to remove it. Unticked menus are hidden for that role and their data is refused by the server."
        actions={
          <>
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setAccess(data.defaults)}>Default access</Button>
            <Button size="sm" icon={Save} loading={saving} disabled={!changed} onClick={save}>Save</Button>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Menu access per role</caption>
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-[13px] text-ink-600">
                <th scope="col" className="px-4 py-2.5 font-semibold">Menu</th>
                {data.roles.map((r) => (
                  <th key={r.key} scope="col" className="px-4 py-2.5 text-center font-semibold">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr key={s.key} className="border-b border-ink-100 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-ink-900">{s.label}</th>
                  {data.roles.map((r) => (
                    <td key={r.key} className="px-4 py-3 text-center">
                      <input type="checkbox" className="size-4 accent-brand-600" checked={!!access[r.key]?.[s.key]} onChange={() => toggle(r.key, s.key)} aria-label={`${s.label} for ${r.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-ink-600">
        <li><b>Master</b> gives the whole Master menu: batch, batch import, employees, course, biometric and deleted employees.</li>
        <li><b>Admin</b> gives Data Upload (batch and biometric files).</li>
        <li><b>HR</b> shows the HR menu. HR and Admin can also edit HR Policy, employee info and Halfyearly reports while it is ticked.</li>
        <li><b>Dashboard</b> and <b>Settings</b> are always shown. A new role starts with Staff&apos;s menus and works like Staff elsewhere (own entries and reports).</li>
        <li>An Admin whose Admin access you removed on the Employees page works with the <b>Staff</b> column.</li>
        {data.updatedAt && <li>Last changed {formatDateTime(data.updatedAt)}{data.updatedBy ? ` by ${data.updatedBy}` : ''}.</li>}
      </ul>
    </>
  );
}
