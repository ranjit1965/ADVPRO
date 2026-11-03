import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import DataTable from '../components/ui/DataTable';
import ErrorState from '../components/ui/ErrorState';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { canAccess, MASTER_ROLES, PEOPLE_VIEW_ROLES, ROLES } from '../utils/permissions';
import { formatDuration, monthLabel, toISODate } from '../utils/format';

const ROLE_OPTIONS = [ROLES.FACULTY, ROLES.HR, ROLES.ADMIN, 'STAFF'];
const EMPTY = { userId: '', code: '', name: '', email: '', role: 'FACULTY', designation: 'FACULTY', grade: 'E1', department: '', branch: 'Chennai Center', password: '' };

/**
 * Admin and Manager add, edit, deactivate and delete employees (faculty, HR, admin, staff).
 * HR sees the same list read-only, with each person's hours this month and a link to their dashboard.
 */
export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = canAccess(user, MASTER_ROLES);
  const month = toISODate().slice(0, 7);
  const [hours, setHours] = useState({});
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | userId
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.getUsers().then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
    api
      .getWorkingHoursReport({ month })
      .then((d) => setHours(Object.fromEntries(d.rows.map((r) => [r.facultyCode, r]))))
      .catch(() => setHours({}));
  }, [month]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => [r.userId, r.code, r.name, r.email, r.role, r.department].some((v) => String(v || '').toLowerCase().includes(s))) : rows;
  }, [rows, q]);

  if (!canAccess(user, PEOPLE_VIEW_ROLES)) {
    return (
      <>
        <PageHeader title="Employees" />
        <Card><p className="text-sm text-ink-600">Access restricted. Only HR, Admin and Manager can see the employee list.</p></Card>
      </>
    );
  }

  const openNew = () => { setForm(EMPTY); setErrors({}); setEditing('new'); };
  const openEdit = (r) => { setForm({ ...EMPTY, ...r, password: '' }); setErrors({}); setEditing(r.userId); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const isNew = editing === 'new';
    const errs = {};
    if (!/^[A-Za-z0-9._-]{3,}$/.test(form.userId)) errs.userId = 'At least 3 letters or digits';
    if (!/^[A-Za-z]{2,5}$/.test(form.code)) errs.code = '2 to 5 letters';
    if (!form.name.trim()) errs.name = 'Required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (isNew ? form.password.length < 8 : form.password && form.password.length < 8) errs.password = 'Use at least 8 characters';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { ...form, code: form.code.toUpperCase(), name: form.name.trim().toUpperCase() };
      if (isNew) await api.createUser(body);
      else {
        const { userId, ...patch } = body;
        if (!patch.password) delete patch.password;
        await api.updateUser(userId, patch);
      }
      toast.success(isNew ? 'Employee added.' : 'Employee updated.');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await api.updateUser(r.userId, { active: !r.active });
      toast.success(r.active ? `${r.name} can no longer sign in.` : `${r.name} can sign in again.`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete employee', message: `Delete ${r.name} (${r.userId})? Their saved entries stay in the reports.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteUser(r.userId);
      toast.success('Employee deleted.');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    { key: 'userId', header: 'User ID' },
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    { key: 'role', header: 'Role' },
    { key: 'department', header: 'Department', hideOnMobile: true },
    { key: 'email', header: 'Email', hideOnMobile: true },
    { key: 'hours', header: `Hours, ${monthLabel(month)}`, align: 'right', render: (r) => (hours[r.code] ? <span className="tabular-nums">{formatDuration(hours[r.code].totalMinutes)}</span> : <span className="text-ink-400">-</span>) },
    { key: 'days', header: 'Days', align: 'right', hideOnMobile: true, render: (r) => hours[r.code]?.days ?? '-' },
    { key: 'active', header: 'Status', render: (r) => (r.active ? <span className="text-success-700">Active</span> : <span className="text-ink-400">Disabled</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={LayoutDashboard} onClick={() => navigate(`/?code=${encodeURIComponent(r.code)}`)} aria-label={`Open ${r.name}'s dashboard`} title="Open dashboard" />
          {canEdit && r.role !== ROLES.MANAGER && (
            <>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`} />
            <Button size="sm" variant="ghost" icon={r.active ? UserX : UserCheck} onClick={() => toggleActive(r)} aria-label={r.active ? `Disable ${r.name}` : `Enable ${r.name}`} />
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r)} aria-label={`Delete ${r.name}`} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description={canEdit ? 'Add faculty, HR, admin and other staff logins.' : 'Every employee with their work hours this month. Open a dashboard to see that person\'s details.'}
        breadcrumb={canEdit ? [{ label: 'Master', to: '/master' }, { label: 'Employees' }] : [{ label: 'Employees' }]}
        actions={canEdit && <Button icon={Plus} onClick={openNew}>Add employee</Button>}
      />
      <Card>
        <div className="mb-4 max-w-xs">
          <Input label="Search" placeholder="Name, user ID, role…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : <DataTable columns={columns} rows={filtered} rowKey="userId" loading={loading} caption="Employees" />}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add employee' : 'Edit employee'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={save}>{editing === 'new' ? 'Add' : 'Save'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="User ID" required value={form.userId} error={errors.userId} onChange={set('userId')} readOnly={editing !== 'new'} />
          <Input label="Employee code" required value={form.code} error={errors.code} onChange={set('code')} hint="Shown as NAME (CODE) in dropdowns" />
          <Input label="Name" required value={form.name} error={errors.name} onChange={set('name')} />
          <Input label="Email" type="email" value={form.email} error={errors.email} onChange={set('email')} />
          <Select label="Role" required options={ROLE_OPTIONS} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, designation: e.target.value })} />
          <Input label="Designation" value={form.designation} onChange={set('designation')} />
          <Input label="Department" value={form.department} onChange={set('department')} />
          <Input label="Grade" value={form.grade} onChange={set('grade')} />
          <Input label="Branch" value={form.branch} onChange={set('branch')} />
          <Input label={editing === 'new' ? 'Password' : 'New password'} required={editing === 'new'} type="password" autoComplete="new-password" value={form.password} error={errors.password} onChange={set('password')} hint={editing === 'new' ? undefined : 'Leave blank to keep the current one'} />
        </div>
      </Modal>
    </>
  );
}
