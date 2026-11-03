import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, Save, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import RadioGroup from '../../components/ui/RadioGroup';
import DatePicker from '../../components/ui/DatePicker';
import TimePicker from '../../components/ui/TimePicker';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatTime, minutesBetween, toISODate, formatDuration } from '../../utils/format';

const LEAVE_TYPES = [
  { value: 'EL', label: 'EL - Earned Leave' },
  { value: 'CL', label: 'CL - Casual Leave' },
  { value: 'LOP', label: 'LOP - Loss of Pay' },
];
const empty = (user) => ({ kind: 'Leave', type: '', email: user.email || '', days: '', leaveType: '', dateFrom: toISODate(), dateTo: '', timeFrom: '', timeTo: '', reason: '' });

/** HR_Report › Leave/Permission Form (POST/PRE PERMISSION FORM). The manager sanctions or rejects. */
export default function LeaveForm() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => empty(user));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isManager = user.role === 'MANAGER';
  const isHr = api.HR_ROLES.includes(user.role);
  const [scope, setScope] = useState(isHr ? 'all' : 'mine');
  const list = useAsync(() => api.getLeaveRequests(scope), [scope]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const leave = form.kind === 'Leave';

  const save = async () => {
    const errs = {};
    if (!form.type) errs.type = 'Required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.dateFrom) errs.dateFrom = 'Required';
    if (!form.reason.trim()) errs.reason = 'Required';
    if (leave) {
      if (!/^\d+(\.5)?$/.test(form.days) || Number(form.days) <= 0) errs.days = 'Enter days (0.5 steps)';
      if (!form.leaveType) errs.leaveType = 'Required';
      if (!form.dateTo) errs.dateTo = 'Required';
      else if (form.dateTo < form.dateFrom) errs.dateTo = 'Must be on or after From';
    } else {
      if (!form.timeFrom) errs.timeFrom = 'Required';
      if (!form.timeTo) errs.timeTo = 'Required';
      else if (form.timeFrom && form.timeTo <= form.timeFrom) errs.timeTo = 'Must be after From';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error('Please fill the highlighted fields.');
    setSaving(true);
    try {
      const body = leave
        ? { kind: 'Leave', type: form.type, email: form.email, days: Number(form.days), leaveType: form.leaveType, dateFrom: form.dateFrom, dateTo: form.dateTo, reason: form.reason.trim() }
        : { kind: 'Permission', type: form.type, email: form.email, dateFrom: form.dateFrom, timeFrom: form.timeFrom, timeTo: form.timeTo, reason: form.reason.trim() };
      await api.createLeaveRequest(body);
      toast.success(`${form.kind} request sent to your manager.`);
      setForm(empty(user));
      list.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const decide = async (r, status) => {
    try {
      await api.decideLeaveRequest(r.id, status);
      toast.success(`Request ${status.toLowerCase()}.`);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const columns = [
    ...(scope === 'all' ? [{ key: 'employeeName', header: 'Employee', render: (r) => <span className="font-medium text-ink-900">{r.employeeName}</span> }] : []),
    { key: 'kind', header: 'Request', render: (r) => `${r.kind} (${r.type})` },
    { key: 'when', header: 'When', render: (r) => (r.kind === 'Leave' ? `${formatDate(r.dateFrom)} – ${formatDate(r.dateTo)}` : `${formatDate(r.dateFrom)}, ${formatTime(r.timeFrom)} – ${formatTime(r.timeTo)}`) },
    { key: 'days', header: 'Days / Time', render: (r) => (r.kind === 'Leave' ? `${r.days} ${r.leaveType}` : formatDuration(minutesBetween(r.timeFrom, r.timeTo))) },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    ...(isManager
      ? [{ key: 'act', header: '', align: 'right', render: (r) => r.status === 'Pending' && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="secondary" icon={Check} onClick={() => decide(r, 'Approved')}>Sanction</Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => decide(r, 'Rejected')}>Reject</Button>
          </div>
        ) }]
      : []),
  ];

  return (
    <>
      <PageHeader title="Leave / Permission Form" breadcrumb={[{ label: 'HR' }, { label: 'Leave/Permission Form' }]} />
      <Card>
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-xl font-bold text-brand-800">Vectra Technosoft Pvt Ltd</p>
          <p className="mt-1 text-center text-sm font-semibold tracking-wide text-success-700">POST/PRE PERMISSION FORM</p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RadioGroup label="Request" name="kind" options={['Leave', 'Permission']} value={form.kind} onChange={(v) => { setForm({ ...form, kind: v }); setErrors({}); }} />
            <Select label="Type" required sort={false} options={['Pre', 'Post']} value={form.type} error={errors.type} onChange={set('type')} hint="Pre: before the leave. Post: after it." />
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="font-semibold text-[#8a2a8f]">Employee Code :</dt><dd>{user.code}</dd>
            <dt className="font-semibold text-[#8a2a8f]">Employee Name :</dt><dd>{user.name}</dd>
            <dt className="font-semibold text-[#8a2a8f]">Designation :</dt><dd>{user.designation}</dd>
          </dl>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Email Id" required type="email" className="sm:col-span-2" value={form.email} error={errors.email} onChange={set('email')} />
            {leave ? (
              <>
                <Input label="Number of days leave" required inputMode="decimal" value={form.days} error={errors.days} onChange={set('days')} />
                <Select label="Leave Type" required options={LEAVE_TYPES} value={form.leaveType} error={errors.leaveType} onChange={set('leaveType')} />
                <DatePicker label="Date From" required value={form.dateFrom} error={errors.dateFrom} onChange={set('dateFrom')} />
                <DatePicker label="To" required value={form.dateTo} min={form.dateFrom} error={errors.dateTo} onChange={set('dateTo')} />
              </>
            ) : (
              <>
                <DatePicker label="Date" required value={form.dateFrom} error={errors.dateFrom} onChange={set('dateFrom')} />
                <div className="grid grid-cols-2 gap-4">
                  <TimePicker label="Time From" required value={form.timeFrom} error={errors.timeFrom} onChange={set('timeFrom')} />
                  <TimePicker label="Time To" required value={form.timeTo} error={errors.timeTo} onChange={set('timeTo')} />
                </div>
              </>
            )}
            <Textarea label="Reason" required className="sm:col-span-2" rows={3} maxLength={500} value={form.reason} error={errors.reason} onChange={set('reason')} />
          </div>

          <div className="mt-6 flex justify-center gap-3">
            <Button icon={Save} loading={saving} onClick={save}>Save</Button>
            <Button variant="secondary" icon={LogOut} onClick={() => navigate('/')}>Exit</Button>
          </div>
          <p className="mt-6 text-sm font-semibold text-danger-700">Note : Sanction / Rejection is in respective Manager&apos;s / Director&apos;s discretion</p>
        </div>
      </Card>

      <Card className="mt-5" title={scope === 'all' ? 'All leave and permission requests' : 'My requests'} bodyClassName="p-0"
        actions={isHr && <Select aria-label="Show" sort={false} options={[{ value: 'all', label: 'All employees' }, { value: 'mine', label: 'Only mine' }]} value={scope} onChange={(e) => setScope(e.target.value)} placeholder={null} />}>
        <DataTable columns={columns} rows={list.data || []} loading={list.loading} dense empty={<EmptyState title="No requests yet" />} />
      </Card>
    </>
  );
}
