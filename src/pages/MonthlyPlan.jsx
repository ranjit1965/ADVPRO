import { useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Textarea from '../components/ui/Textarea';
import Modal from '../components/ui/Modal';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import AssigneePicker from '../components/master/AssigneePicker';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import * as api from '../services/api';
import { canAccess, MASTER_ROLES } from '../utils/permissions';
import { monthLabel, toISODate } from '../utils/format';

const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
const EMPTY = { week: '', courseId: '', batchNo: '', plannedSessions: '', topics: '', assignees: [] };

/**
 * Monthly Plan. Admin and Manager assign plans to employees and faculty (one plan per person)
 * and see everyone's plans. Everyone else sees only the plans assigned to them and updates
 * the status and a progress note.
 */
export default function MonthlyPlan() {
  const { user } = useAuth();
  const boss = canAccess(user, MASTER_ROLES);
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(toISODate().slice(0, 7));
  const { data, loading, error, reload } = useAsync(() => api.getMonthlyPlans(month, boss ? 'all' : 'mine'), [month, boss]);
  const [filter, setFilter] = useState({ person: '', status: '' });
  const [editing, setEditing] = useState(null); // plan being edited, or EMPTY for a new one
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const people = (lookups?.employees || []).filter((e) => e.role !== 'MANAGER');

  const rows = useMemo(() => (data || []).filter((p) => (!filter.person || p.assignedTo === filter.person) && (!filter.status || p.status === filter.status)), [data, filter]);

  const save = async () => {
    const errs = {};
    if (boss) {
      ['week', 'courseId', 'batchNo', 'plannedSessions', 'topics'].forEach((k) => !String(editing[k] ?? '').trim() && (errs[k] = 'Required'));
      if (editing.plannedSessions && !/^\d+$/.test(String(editing.plannedSessions))) errs.plannedSessions = 'Numbers only';
      if (!editing.id && !editing.assignees.length) errs.assignees = 'Choose at least one person';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (boss) {
        const { assignees, ...plan } = editing;
        await api.saveMonthlyPlan({ ...plan, month, plannedSessions: Number(plan.plannedSessions), ...(plan.id ? {} : { assignees }) });
        toast.success(plan.id ? 'Monthly plan updated.' : `Plan assigned to ${assignees.length} ${assignees.length === 1 ? 'person' : 'people'}.`);
      } else {
        await api.saveMonthlyPlan({ id: editing.id, status: editing.status, progressNote: editing.progressNote });
        toast.success('Plan status updated.');
      }
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan) => {
    if (!(await confirm({ title: 'Delete plan', message: `Delete the ${plan.week} plan for ${plan.courseId} (${plan.batchNo}) assigned to ${plan.assigneeName}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteMonthlyPlan(plan.id);
      toast.success('Plan deleted.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const f = (k) => ({ value: editing?.[k] ?? '', error: errors[k], required: true, onChange: (e) => (setEditing((p) => ({ ...p, [k]: e.target.value })), errors[k] && setErrors((x) => ({ ...x, [k]: undefined }))) });
  const totalSessions = rows.reduce((s, p) => s + (Number(p.plannedSessions) || 0), 0);
  const done = rows.filter((p) => p.status === 'Completed').length;
  const openNew = () => (setErrors({}), setEditing({ ...EMPTY }));

  const columns = [
    { key: 'week', header: 'Week', render: (r) => <span className="whitespace-nowrap">{r.week}</span> },
    ...(boss ? [{ key: 'assigneeName', header: 'Assigned to', render: (r) => <span><span className="font-medium text-ink-900">{r.assigneeName}</span> <span className="text-xs text-ink-400">{r.assigneeCode} · {r.assigneeRole}</span></span> }] : []),
    { key: 'courseId', header: 'Course ID', render: (r) => <span className="font-medium text-ink-900">{r.courseId}</span> },
    { key: 'batchNo', header: 'Batch No' },
    { key: 'plannedSessions', header: 'Sessions', align: 'right' },
    { key: 'topics', header: 'Topics / Chapters', render: (r) => <span className="line-clamp-2 max-w-xs">{r.topics}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'progressNote', header: 'Note', render: (r) => <span className="line-clamp-2 max-w-xs text-ink-500">{r.progressNote || '-'}</span> },
    ...(boss ? [] : [{ key: 'assignedBy', header: 'Assigned by' }]),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (r) => (
        <div className="flex justify-end gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" icon={Pencil} aria-label={boss ? 'Edit plan' : 'Update status'} onClick={() => (setErrors({}), setEditing({ ...r, assignees: [r.assignedTo] }))} />
          {boss && <Button variant="ghost" size="icon" className="size-8 hover:!bg-danger-50 hover:!text-danger-600" icon={Trash2} aria-label="Delete plan" onClick={() => remove(r)} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Monthly Plan"
        breadcrumb={[{ label: 'Faculty' }, { label: 'Monthly Plan' }]}
        description={boss ? 'Assign each batch and course plan, week by week, to employees and faculty.' : 'The plans assigned to you this month. Update the status as you complete each one.'}
        actions={boss && <Button icon={CalendarPlus} onClick={openNew}>Assign plan</Button>}
      />
      <Card className="mb-5">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          {boss && <Select searchable label="Person" placeholder="Everyone" options={people.map((p) => ({ value: p.userId, label: `${p.name} (${p.code})` }))} value={filter.person} onChange={(e) => setFilter({ ...filter, person: e.target.value })} />}
          <Select label="Status" placeholder="All" options={api.PLAN_STATUS} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} />
          <p className="pb-2 text-[13px] text-ink-500">
            {rows.length} plan(s) · {totalSessions} session(s) · {done} completed in {monthLabel(month)}
          </p>
        </div>
      </Card>
      <Card bodyClassName="p-0">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <DataTable
            loading={loading}
            rows={rows}
            columns={columns}
            empty={
              <EmptyState
                icon={CalendarPlus}
                title={`No plan for ${monthLabel(month)}`}
                message={boss ? 'Assign the sessions each person should take this month.' : 'No plan has been assigned to you for this month yet.'}
                action={boss && <Button size="sm" icon={CalendarPlus} onClick={openNew}>Assign plan</Button>}
              />
            }
          />
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size={boss && !editing?.id ? 'lg' : undefined}
        title={!boss ? 'Update plan status' : editing?.id ? 'Edit plan' : 'Assign plan'}
        description={editing?.id && editing.assigneeName ? `${monthLabel(month)} · ${editing.assigneeName}` : monthLabel(month)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {boss && !editing?.id ? 'Assign' : 'Save'}
            </Button>
          </>
        }
      >
        {editing && lookups && boss && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Week" options={WEEKS} {...f('week')} />
            <Select searchable label="Batch No" options={lookups.batches} {...f('batchNo')} />
            <Select searchable label="Course ID" options={lookups.courses.map((c) => ({ value: c.id, label: `${c.id} – ${c.name}`, alt: [c.name] }))} {...f('courseId')} />
            <Input label="Planned sessions" inputMode="numeric" {...f('plannedSessions')} />
            <Textarea label="Topics / Chapters" className="sm:col-span-2" maxLength={300} {...f('topics')} />
            {editing.id ? (
              <Select label="Status" options={api.PLAN_STATUS} placeholder={null} value={editing.status} onChange={(e) => setEditing((p) => ({ ...p, status: e.target.value }))} />
            ) : (
              <AssigneePicker people={people} value={editing.assignees} error={errors.assignees} onChange={(assignees) => (setEditing((p) => ({ ...p, assignees })), setErrors((x) => ({ ...x, assignees: undefined })))} />
            )}
          </div>
        )}
        {editing && !boss && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-ink-50 p-3 text-[13px]">
              <dt className="text-ink-500">Week</dt><dd>{editing.week}</dd>
              <dt className="text-ink-500">Course / Batch</dt><dd>{editing.courseId} · {editing.batchNo}</dd>
              <dt className="text-ink-500">Sessions</dt><dd>{editing.plannedSessions}</dd>
              <dt className="text-ink-500">Topics</dt><dd>{editing.topics}</dd>
            </dl>
            <Select label="Status" options={api.PLAN_STATUS} placeholder={null} value={editing.status} onChange={(e) => setEditing((p) => ({ ...p, status: e.target.value }))} />
            <Textarea label="Progress note" maxLength={500} value={editing.progressNote || ''} onChange={(e) => setEditing((p) => ({ ...p, progressNote: e.target.value }))} placeholder="e.g. 4 of 6 sessions taken; chapter 6 next week" />
          </div>
        )}
      </Modal>
    </>
  );
}
