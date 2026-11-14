import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, CalendarX, LayoutDashboard, Pencil, Plus, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX } from 'lucide-react';
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
import { canAccess, hasSection, MASTER_ROLES, PEOPLE_VIEW_ROLES, ROLES } from '../utils/permissions';
import { formatDuration, monthLabel, toISODate } from '../utils/format';

const ROLE_OPTIONS = [ROLES.FACULTY, ROLES.HR, ROLES.ADMIN, 'STAFF'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMPTY = { userId: '', code: '', name: '', email: '', role: 'FACULTY', designation: 'FACULTY', grade: 'E1', department: '', branch: 'Chennai Center', password: '' };

/**
 * Admin and Manager add, edit, deactivate and delete employees (faculty, HR, admin, staff).
 * HR sees the same list read-only, with each person's hours this month and a link to their dashboard.
 */
export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasSection(user, 'master');
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
  const [check, setCheck] = useState(null); // missing-entry check: { settings, preview }
  const [checkOpen, setCheckOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleted, setDeleted] = useState(null); // Deleted employees list, null = closed
  const [restoring, setRestoring] = useState('');

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

  if (!(hasSection(user, 'master') || (hasSection(user, 'hr') && canAccess(user, PEOPLE_VIEW_ROLES)))) {
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
      toast.success(
        r.active
          ? `${r.name} can no longer sign in.`
          : `${r.name} is active again.${r.autoInactive ? ' The missing-entry check counts only the working days from tomorrow.' : ''}`,
      );
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openDeleted = async () => {
    setDeleted([]);
    try {
      setDeleted(await api.getDeletedUsers());
    } catch (e) {
      toast.error(e.message);
      setDeleted(null);
    }
  };

  const restore = async (r) => {
    setRestoring(r.userId);
    try {
      await api.restoreUser(r.userId);
      toast.success(`${r.name} restored and active again.`);
      setDeleted((list) => list.filter((d) => d.userId !== r.userId));
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRestoring('');
    }
  };

  // Missing-entry check: preview who would be made inactive, then run it now if wanted.
  const openCheck = async () => {
    setCheck(null);
    setCheckOpen(true);
    try {
      setCheck(await api.getAutoInactive());
    } catch (e) {
      toast.error(e.message);
      setCheckOpen(false);
    }
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const res = await api.runAutoInactive();
      toast.success(res.count ? `${res.count} employee(s) made inactive.` : 'Everyone has entries. Nobody was made inactive.');
      setCheckOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  // Manager only: give or remove an Admin's access (an Admin without it works like a normal employee).
  const toggleAdminAccess = async (r) => {
    const removing = r.adminAccess !== false;
    if (removing && !(await confirm({ title: 'Remove Admin access', message: `${r.name} will no longer create batches, upload Batch Master or manage employees until you give the access back.`, confirmLabel: 'OK, remove', tone: 'danger' }))) return;
    try {
      await api.setAdminAccess(r.userId, !removing);
      toast.success(removing ? `Admin access removed for ${r.name}.` : `Admin access given back to ${r.name}.`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete employee', message: `Delete ${r.name} (${r.userId})? They move to Deleted employees and can no longer sign in. You can restore them from there. Their saved entries stay in the reports.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteUser(r.userId);
      toast.success(`${r.name} moved to Deleted employees.`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    { key: 'userId', header: 'User ID' },
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <span>
          {r.role}
          {r.role === ROLES.ADMIN && r.adminAccess === false && <span className="ml-1.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700">access removed</span>}
        </span>
      ),
    },
    { key: 'department', header: 'Department', hideOnMobile: true },
    { key: 'email', header: 'Email', hideOnMobile: true },
    { key: 'hours', header: `Hours, ${monthLabel(month)}`, align: 'right', render: (r) => (hours[r.code] ? <span className="tabular-nums">{formatDuration(hours[r.code].totalMinutes)}</span> : <span className="text-ink-400">-</span>) },
    { key: 'days', header: 'Days', align: 'right', hideOnMobile: true, render: (r) => hours[r.code]?.days ?? '-' },
    {
      key: 'active',
      header: 'Status',
      render: (r) =>
        r.active ? (
          <span className="text-success-700">Active</span>
        ) : (
          <span title={r.inactiveReason || ''}>
            <span className="text-danger-700">Inactive</span>
            {r.autoInactive && <span className="ml-1.5 whitespace-nowrap rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700">no entries</span>}
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={LayoutDashboard} onClick={() => navigate(`/?code=${encodeURIComponent(r.code)}`)} aria-label={`Open ${r.name}'s dashboard`} title="Open dashboard" />
          {user.role === ROLES.MANAGER && r.role === ROLES.ADMIN && (
            <Button
              size="sm"
              variant="ghost"
              icon={r.adminAccess === false ? ShieldCheck : ShieldOff}
              onClick={() => toggleAdminAccess(r)}
              aria-label={r.adminAccess === false ? `Give Admin access to ${r.name}` : `Remove Admin access from ${r.name}`}
              title={r.adminAccess === false ? 'Give Admin access' : 'Remove Admin access'}
            />
          )}
          {canEdit && r.role !== ROLES.MANAGER && (
            <>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`} />
            <Button size="sm" variant="ghost" icon={r.active ? UserX : UserCheck} onClick={() => toggleActive(r)} aria-label={r.active ? `Make ${r.name} inactive` : `Make ${r.name} active`} title={r.active ? 'Make inactive' : 'Make active'} />
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
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={ArchiveRestore} onClick={openDeleted}>Deleted employees</Button>
              <Button variant="secondary" icon={CalendarX} onClick={openCheck}>Missing entries check</Button>
              <Button icon={Plus} onClick={openNew}>Add employee</Button>
            </div>
          )
        }
      />
      <Card>
        <div className="mb-4 max-w-xs">
          <Input label="Search" placeholder="Name, user ID, role…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && rows.some((r) => r.autoInactive && !r.active) && (
          <p className="mb-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
            Employees marked <b>no entries</b> were made inactive automatically because they saved no daily entry on {check?.settings?.days ?? 3} working days in a row. Click the <UserCheck className="inline size-4 align-text-bottom" aria-hidden /> button on their row to make them active again.
          </p>
        )}
        {error ? <ErrorState message={error} onRetry={load} /> : <DataTable columns={columns} rows={filtered} rowKey="userId" loading={loading} caption="Employees" />}
      </Card>

      <Modal
        open={deleted !== null}
        onClose={() => setDeleted(null)}
        title="Deleted employees"
        size="lg"
        footer={<Button variant="secondary" onClick={() => setDeleted(null)}>Close</Button>}
      >
        {deleted?.length ? (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100 text-sm">
            {deleted.map((d) => (
              <li key={d.userId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div>
                  <p className="font-medium text-ink-900">{d.name} ({d.code})</p>
                  <p className="text-ink-500">
                    {d.userId} · {d.role}{d.department ? ` · ${d.department}` : ''}{d.email ? ` · ${d.email}` : ''}
                  </p>
                  <p className="text-xs text-ink-400">Deleted {d.deletedAt ? new Date(d.deletedAt).toLocaleString() : ''}{d.deletedBy ? ` by ${d.deletedBy}` : ''}</p>
                </div>
                <Button size="sm" icon={ArchiveRestore} loading={restoring === d.userId} onClick={() => restore(d)}>Restore</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">No deleted employees.</p>
        )}
      </Modal>

      <Modal
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        title="Missing entries check"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckOpen(false)}>Close</Button>
            <Button variant="danger" loading={running} disabled={!check?.preview?.count} onClick={runCheck}>Make them inactive now</Button>
          </>
        }
      >
        {!check ? (
          <p className="text-sm text-ink-600">Checking…</p>
        ) : (
          <div className="space-y-4 text-sm text-ink-700">
            <p>
              {check.settings.roles.join(' and ')} with no daily entry on their last <b>{check.settings.days} working days</b> (today not counted) are made inactive{' '}
              {check.settings.enabled ? <>automatically every day at <b>{check.settings.time}</b></> : 'by the scheduled task on the server'}. Weekly off: {check.settings.weeklyOff.map((d) => WEEKDAYS[d]).join(', ') || 'none'}; holidays and approved leave are skipped. Days before {check.settings.startDate}, and days up to the day someone was made active again, are not counted.
            </p>
            {check.settings.lastRunAt && (
              <p className="text-ink-500">
                Last run {new Date(check.settings.lastRunAt).toLocaleString()} by {check.settings.lastRunBy}: {check.settings.lastRunCount} made inactive{check.settings.lastRunNames?.length ? ` (${check.settings.lastRunNames.join(', ')})` : ''}.
              </p>
            )}
            {check.preview.count ? (
              <div>
                <p className="mb-2 font-medium text-ink-900">Would be made inactive now ({check.preview.count}):</p>
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                  {check.preview.employees.map((e) => (
                    <li key={e.userId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span className="font-medium text-ink-900">{e.name} ({e.code})</span>
                      <span className="text-ink-500">No entry on {e.missedDays.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-success-700">Everyone checked has an entry on at least one of their last {check.settings.days} working days.</p>
            )}
          </div>
        )}
      </Modal>

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
