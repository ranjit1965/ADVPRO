import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DatePicker from '../../components/ui/DatePicker';
import Modal from '../../components/ui/Modal';
import ErrorState from '../../components/ui/ErrorState';
import AssigneePicker from '../../components/master/AssigneePicker';
import WorkTable, { WORK_STATUS } from '../../components/master/WorkTable';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { toISODate } from '../../utils/format';

const EMPTY = { title: '', description: '', priority: 'Medium', startDate: toISODate(), dueDate: '', assignees: [] };

/** Master › Shedulling: Admin and Manager assign work to employees and faculty. */
export default function Scheduling() {
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(() => api.getWorkAssignments('all'), []);
  const [filter, setFilter] = useState({ person: '', status: '' });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const people = (lookups?.employees || []).filter((e) => e.role !== 'MANAGER');

  const rows = useMemo(() => (data || []).filter((w) => (!filter.person || w.assignedTo === filter.person) && (!filter.status || w.status === filter.status)), [data, filter]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Required';
    if (!form.id && !form.assignees.length) errs.assignees = 'Choose at least one person';
    if (form.dueDate && form.startDate && form.dueDate < form.startDate) errs.dueDate = 'Must be on or after the start date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const { id, assignees, ...work } = form;
      if (id) await api.updateWorkAssignment(id, { title: work.title.trim(), description: work.description, priority: work.priority, startDate: work.startDate, dueDate: work.dueDate, status: work.status });
      else await api.createWorkAssignments({ ...work, title: work.title.trim(), assignees });
      toast.success(id ? 'Work updated.' : `Work assigned to ${assignees.length} ${assignees.length === 1 ? 'person' : 'people'}.`);
      setForm(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (w) => {
    if (!(await confirm({ title: 'Delete work', message: `Delete "${w.title}" assigned to ${w.assigneeName}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    await api.deleteWorkAssignment(w.id);
    toast.success('Work deleted.');
    reload();
  };

  return (
    <>
      <PageHeader title="Shedulling" description="Assign work to employees and faculty. Each person sees their work under My Work and updates its progress." breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Shedulling' }]}
        actions={<Button icon={Plus} onClick={() => { setErrors({}); setForm({ ...EMPTY, startDate: toISODate() }); }}>Assign work</Button>} />
      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select searchable label="Person" placeholder="Everyone" options={people.map((p) => ({ value: p.userId, label: `${p.name} (${p.code})` }))} value={filter.person} onChange={(e) => setFilter({ ...filter, person: e.target.value })} />
          <Select label="Status" placeholder="All" options={WORK_STATUS} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} />
        </div>
      </Card>
      <Card bodyClassName="p-0">
        {error ? <ErrorState message={error} onRetry={reload} /> : <WorkTable rows={rows} loading={loading} showAssignee onEdit={(w) => { setErrors({}); setForm({ ...w, assignees: [w.assignedTo] }); }} onDelete={remove} />}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} size="lg" title={form?.id ? 'Edit work' : 'Assign work'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={save}>{form?.id ? 'Save' : 'Assign'}</Button></>}>
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Work" required className="sm:col-span-2" value={form.title} error={errors.title} onChange={set('title')} placeholder="e.g. Prepare RHCSA Chapter 5 lab manual" />
            <Textarea label="Details" className="sm:col-span-2" rows={3} maxLength={1000} value={form.description} onChange={set('description')} />
            <Select label="Priority" sort={false} options={['High', 'Medium', 'Low']} value={form.priority} onChange={set('priority')} placeholder={null} />
            {form.id ? <Select label="Status" options={WORK_STATUS} value={form.status} onChange={set('status')} placeholder={null} /> : <div />}
            <DatePicker label="Start date" value={form.startDate} onChange={set('startDate')} />
            <DatePicker label="Due date" value={form.dueDate} min={form.startDate} error={errors.dueDate} onChange={set('dueDate')} />
            {!form.id && <AssigneePicker people={people} value={form.assignees} error={errors.assignees} onChange={(assignees) => setForm((f) => ({ ...f, assignees }))} />}
          </div>
        )}
      </Modal>
    </>
  );
}
