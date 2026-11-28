import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarX, KeyRound, LayoutDashboard, Pencil, Plus, ShieldCheck, ShieldOff, UserCheck, UserX, Users as UsersIcon } from 'lucide-react';
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
import { canManage, canViewPeople, isSuperAdmin, roleLabel, ROLES } from '../utils/permissions';
import { formatDateTime, formatDuration, monthLabel, toISODate } from '../utils/format';

const ROLE_OPTIONS = [ROLES.FACULTY, ROLES.HR, ROLES.MIS, ROLES.ADMIN].map((r) => ({ value: r, label: r }));
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMPTY = { code: '', employeeId: '', name: '', phone: '', personalEmail: '', email: '', role: 'FACULTY', branch: 'Chennai Center' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * HR, Admin and Super Admin view, add, edit and deactivate employees, with each person's hours this month and
 * a link to their dashboard. v60: Short Name (letters) + Employee ID (numbers), WhatsApp phone, personal email
 * (required) and official email; no Grade / Department / Designation. Only the Super Admin gives the login
 * (User ID and password). Nobody is deleted: they are made inactive (Inactive Employees).
 */
export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = canManage(user);
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
  const [roleOptions, setRoleOptions] = useState(ROLE_OPTIONS);
  const [loginFor, setLoginFor] = useState(null); // Super Admin: the employee whose login is being set
  const [login, setLogin] = useState({ userId: '', password: '' });
  const [loginErr, setLoginErr] = useState({});
  const branches = useMemo(() => [...new Set(['Chennai Center', ...rows.map((r) => r.branch).filter(Boolean)])].sort(), [rows]);

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
  useEffect(() => {
    if (canEdit)
      api
        .getRoles()
        .then((list) => setRoleOptions(list.map((r) => ({ value: r.key, label: r.label && r.label.toUpperCase() !== r.key.replace(/_/g, ' ') ? `${r.key} (${r.label})` : r.key }))))
        .catch((e) => toast.error(`Roles could not be loaded: ${e.message}`));
  }, [canEdit]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => [r.userId, r.code, r.employeeId, r.name, r.email, r.personalEmail, r.phone, r.role, r.branch].some((v) => String(v || '').toLowerCase().includes(s))) : rows;
  }, [rows, q]);

  if (!canViewPeople(user)) {
    return (
      <>
        <PageHeader title="Employees" />
        <Card><p className="text-sm text-ink-600">Access restricted. Only HR, Admin and Super Admin can see the employee list.</p></Card>
      </>
    );
  }

  const openNew = () => { setForm(EMPTY); setErrors({}); setEditing('new'); };
  const openEdit = (r) => { setForm({ ...EMPTY, ...r, email: r.email || '', personalEmail: r.personalEmail || '', phone: r.phone || '', employeeId: r.employeeId || '' }); setErrors({}); setEditing(r.userId); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const isNew = editing === 'new';
    const errs = {};
    if (!/^[A-Za-z]{2,5}$/.test(form.code)) errs.code = '2 to 5 letters';
    if (!/^\d{1,10}$/.test(form.employeeId)) errs.employeeId = isNew || form.employeeId ? 'Numbers only' : 'Required';
    if (!form.name.trim()) errs.name = 'Required';
    if (!/^\+?\d{10,15}$/.test(form.phone.replace(/[\s-]/g, ''))) errs.phone = '10-digit mobile (WhatsApp)';
    if (!EMAIL.test(form.personalEmail)) errs.personalEmail = form.personalEmail ? 'Invalid email' : 'Required';
    if (form.email && !EMAIL.test(form.email)) errs.email = 'Invalid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {
        code: form.code.toUpperCase(), employeeId: form.employeeId, name: form.name.trim().toUpperCase(), phone: form.phone.replace(/[\s-]/g, ''),
        personalEmail: form.personalEmail.trim(), email: form.email.trim() || null, role: form.role, branch: form.branch.trim(),
      };
      if (isNew) await api.createUser(body);
      else await api.updateUser(editing, body);
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

  // Super Admin: tick the roles the check works on (never Super Admin, Admin, HR).
  const toggleCheckRole = async (role, on) => {
    const now = new Set(check.settings.roles);
    if (on) now.add(role);
    else now.delete(role);
    try {
      const res = await api.setAutoInactiveRoles([...now]);
      setCheck({ ...check, settings: res.settings });
      setCheck(await api.getAutoInactive());
      toast.success('Saved. The check works on the ticked roles.');
    } catch (e) {
      toast.error(e.message);
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

  // Super Admin only: give or remove an Admin's access (an Admin without it works like a normal employee).
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

  // Super Admin only: the employee's login (User ID and password).
  const openLogin = (r) => { setLogin({ userId: r.hasLogin ? r.userId : '', password: '' }); setLoginErr({}); setLoginFor(r); };
  const saveLogin = async () => {
    const errs = {};
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(login.userId)) errs.userId = 'At least 3 letters or digits';
    if ((!loginFor.hasLogin || login.password) && login.password.length < 8) errs.password = 'Use at least 8 characters';
    setLoginErr(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api.setUserLogin(loginFor.userId, { userId: login.userId, password: login.password || null });
      toast.success(`Login saved for ${loginFor.name}.`);
      setLoginFor(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Short Name' },
    { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId || <span className="text-ink-400">-</span> },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
    isSuperAdmin(user) && { key: 'userId', header: 'Login', render: (r) => (r.hasLogin ? r.userId : <span className="text-ink-400">No login</span>) },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <span>
          {roleLabel(r.role)}
          {r.role === ROLES.ADMIN && r.adminAccess === false && <span className="ml-1.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700">access removed</span>}
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', hideOnMobile: true },
    { key: 'email', header: 'Official / Personal email', hideOnMobile: true, render: (r) => [r.email, r.personalEmail].filter(Boolean).join(' · ') },
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
            {isSuperAdmin(user) && <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => openLogin(r)} aria-label={`Login of ${r.name}`} title={r.hasLogin ? 'Change login' : 'Give login'} />}
            </>
          )}
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Employees"
 description={canEdit ? 'Add employees. The Super Admin gives each one a login (User ID and password).' : 'Every employee with their work hours this month. Open a dashboard to see that person\'s details.'}
        breadcrumb={[{ label: 'Employees' }]}
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={UsersIcon} onClick={() => navigate('/master/inactive-employees')}>Inactive employees</Button>
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
            <div className="rounded-lg border border-ink-200 p-3">
              <p className="mb-2 font-medium text-ink-900">Roles checked</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {roleOptions.filter((r) => !check.settings.never.includes(r.value)).map((r) => (
                  <label key={r.value} className="inline-flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-brand-600" disabled={!isSuperAdmin(user)} checked={check.settings.roles.includes(r.value)} onChange={(e) => toggleCheckRole(r.value, e.target.checked)} />
                    {r.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-500">
                {isSuperAdmin(user) ? 'Only the Super Admin changes this.' : 'Set by the Super Admin.'} Super Admin, Admin and HR are never made inactive. On the 4th morning each person first gets a WhatsApp message
                {check.settings.whatsappTemplate ? ` (template ${check.settings.whatsappTemplate})` : ' (set WA_INACTIVE_TEMPLATE_NAME to send it)'} and an email to their personal and official email, then is made inactive.
              </p>
            </div>
            {check.settings.lastRunAt && (
              <p className="text-ink-500">
                Last run {formatDateTime(check.settings.lastRunAt)} by {check.settings.lastRunBy}: {check.settings.lastRunCount} made inactive{check.settings.lastRunNames?.length ? ` (${check.settings.lastRunNames.join(', ')})` : ''}.
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
          <Input label="Short Name" required maxLength={5} value={form.code} error={errors.code} onChange={set('code')} hint="2 to 5 letters, e.g. ARI. Shown as NAME (SHORT · ID)" />
          <Input label="Employee ID" required inputMode="numeric" maxLength={10} value={form.employeeId} error={errors.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value.replace(/\D/g, '') })} hint="Numbers only" />
          <Input label="Name" required value={form.name} error={errors.name} onChange={set('name')} />
          <Input label="Phone (WhatsApp)" required inputMode="tel" maxLength={15} value={form.phone} error={errors.phone} onChange={set('phone')} />
          <Input label="Personal email" required type="email" value={form.personalEmail} error={errors.personalEmail} onChange={set('personalEmail')} />
          <Input label="Official email" type="email" value={form.email} error={errors.email} onChange={set('email')} hint="Optional, can be added later" />
          <Select label="Role" required options={roleOptions} value={form.role} onChange={set('role')} hint={user.role === ROLES.MANAGER ? 'Roles are created in Master › Roles & Access' : undefined} />
          <div>
            <Input label="Branch" list="branch-list" value={form.branch} onChange={set('branch')} hint="Pick one or type any place name" />
            <datalist id="branch-list">{branches.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!loginFor}
        onClose={() => setLoginFor(null)}
        title={loginFor ? `Login for ${loginFor.name}` : ''}
        description="Only the Super Admin gives or changes the User ID and password. A new password signs the employee out of other devices."
        footer={
          <>
            <Button variant="secondary" onClick={() => setLoginFor(null)}>Cancel</Button>
            <Button loading={saving} onClick={saveLogin}>Save login</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          <Input label="User ID" required autoComplete="off" value={login.userId} error={loginErr.userId} onChange={(e) => setLogin({ ...login, userId: e.target.value })} />
          <Input label={loginFor?.hasLogin ? 'New password' : 'Password'} required={!loginFor?.hasLogin} type="password" autoComplete="new-password" value={login.password} error={loginErr.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} hint={loginFor?.hasLogin ? 'Leave blank to keep the current one' : 'At least 8 characters'} />
        </div>
      </Modal>
    </>
  );
}
