import { useEffect, useMemo, useState } from 'react';
import { Award, Download, Pencil, Save, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchableSelect from '../../components/ui/SearchableSelect';
import RadioGroup from '../../components/ui/RadioGroup';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/export';

const YES_NO = ['Yes', 'No'];
const SOURCES = [
  { value: 'course', label: 'From course list' },
  { value: 'manual', label: 'Type manually' },
];
const EMPTY_FORM = { employeeCode: '', startMonth: '', endMonth: '', source: 'course', courseId: '', targetCertification: '' };

const monthLabel = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '');

/**
 * HR › Halfyearly Program Report.
 * HR, Manager and Admin assign the target certification with its starting and ending month.
 * Each employee fills in, on the same row, whether it was achieved (date and code) and whether course delivery is ready.
 */
export default function HalfyearlyReport() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const isHr = api.HR_ROLES.includes(user.role);
  const [filter, setFilter] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.getHalfyearly({ employeeCode: filter }), [filter]);

  const people = useMemo(() => {
    const seen = new Map();
    for (const p of [...(lookups?.employees || []), ...(lookups?.faculties || [])]) if (!seen.has(p.code)) seen.set(p.code, p);
    return [...seen.values()].map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }));
  }, [lookups]);
  const courses = useMemo(() => (lookups?.courses || []).map((c) => ({ value: c.id, label: `${c.id} – ${c.name}` })), [lookups]);
  const courseName = useMemo(() => Object.fromEntries((lookups?.courses || []).map((c) => [c.id, c.name])), [lookups]);

  /* ---------- HR assignment form ---------- */
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const target = form.source === 'course' ? courseName[form.courseId] || '' : form.targetCertification.trim();
    const errs = {};
    if (!form.employeeCode) errs.employeeCode = 'Choose the employee';
    if (!form.startMonth) errs.startMonth = 'Choose the starting month';
    if (!form.endMonth) errs.endMonth = 'Choose the ending month';
    else if (form.startMonth && form.endMonth < form.startMonth) errs.endMonth = 'Must be on or after the starting month';
    if (!target) errs.target = form.source === 'course' ? 'Choose a course' : 'Type the certification name';
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error('Please fill the highlighted fields.');
    const body = { employeeCode: form.employeeCode, startMonth: form.startMonth, endMonth: form.endMonth, targetCertification: target, courseId: form.source === 'course' ? form.courseId : '' };
    setSaving(true);
    try {
      if (editingId) await api.updateHalfyearly(editingId, body);
      else await api.assignHalfyearly(body);
      toast.success(editingId ? 'Certification updated.' : 'Certification assigned.');
      setForm((f) => ({ ...EMPTY_FORM, startMonth: f.startMonth, endMonth: f.endMonth }));
      setEditingId(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setErrors({});
    setForm({ employeeCode: r.employeeCode, startMonth: r.startMonth, endMonth: r.endMonth, source: r.courseId ? 'course' : 'manual', courseId: r.courseId || '', targetCertification: r.courseId ? '' : r.targetCertification });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete row', message: `Delete "${r.targetCertification}" for ${r.employeeName}?`, confirmLabel: 'OK, delete', tone: 'danger' }))) return;
    try {
      await api.deleteHalfyearly(r.id);
      toast.success('Row deleted.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportCsv = () =>
    downloadCsv('halfyearly-program-report.csv', [
      { header: 'Employee', value: (r) => `${r.employeeName} (${r.employeeCode})` },
      { header: 'Starting Month', value: (r) => monthLabel(r.startMonth) },
      { header: 'Ending Month', value: (r) => monthLabel(r.endMonth) },
      { header: 'Target Certification', value: (r) => r.targetCertification },
      { header: 'Certification Achieved', value: (r) => r.achieved || '' },
      { header: 'Date of Completion', value: (r) => (r.completionDate ? formatDate(r.completionDate) : '') },
      { header: 'Certification Code', value: (r) => r.certificationCode || '' },
      { header: 'Course Delivery Ready', value: (r) => r.deliveryReady || '' },
    ], data || []);

  return (
    <>
      <PageHeader
        title="Halfyearly Program Report"
        breadcrumb={[{ label: 'HR' }, { label: 'Halfyearly Program Report' }]}
        description={isHr ? 'Assign each employee a target certification for the period. They record the result on the same row.' : 'Your target certifications. Record whether each was achieved and whether the course delivery is ready.'}
        actions={<Button variant="secondary" icon={Download} disabled={!data?.length} onClick={exportCsv}>Export</Button>}
      />

      {isHr && (
        <Card className="mb-5" title={editingId ? 'Edit target certification' : 'Assign target certification'}>
          <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <SearchableSelect label="Employee / Faculty" required className="md:col-span-4" options={people} placeholder="Search employee" value={form.employeeCode} onChange={(v) => setF('employeeCode', v)} error={errors.employeeCode} />
            <Input label="Starting Month" type="month" required className="md:col-span-2" value={form.startMonth} onChange={(e) => setF('startMonth', e.target.value)} error={errors.startMonth} />
            <Input label="Ending Month" type="month" required className="md:col-span-2" value={form.endMonth} min={form.startMonth || undefined} onChange={(e) => setF('endMonth', e.target.value)} error={errors.endMonth} />
            <RadioGroup className="md:col-span-4" label="Target Certification" name="hySource" options={SOURCES} value={form.source} onChange={(v) => setF('source', v)} />
            {form.source === 'course' ? (
              <SearchableSelect label="Course" required className="md:col-span-8" options={courses} placeholder="Search course" value={form.courseId} onChange={(v) => setF('courseId', v)} error={errors.target} />
            ) : (
              <Input label="Certification name" required className="md:col-span-8" maxLength={200} placeholder="e.g. AWS Certified Solutions Architect" value={form.targetCertification} onChange={(e) => setF('targetCertification', e.target.value)} error={errors.target} />
            )}
            <div className="flex items-end justify-end gap-2 md:col-span-4">
              {editingId && (
                <Button variant="secondary" icon={X} onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setErrors({}); }}>
                  Cancel
                </Button>
              )}
              <Button type="submit" icon={Award} loading={saving}>
                {editingId ? 'Update' : 'Assign'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        bodyClassName="p-0"
        title="HALFYEARLY PROGRAM REPORT"
        description="Target certification, certification achieved and course delivery readiness"
        actions={isHr && <Select aria-label="Filter by employee" searchable className="w-64" placeholder="All employees" options={people} value={filter} onChange={(e) => setFilter(e.target.value)} />}
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !data?.length ? (
          <EmptyState icon={Award} title="No certifications assigned" message={isHr ? 'Assign a target certification above.' : 'HR or your manager has not assigned a target certification to you yet.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <caption className="sr-only">Halfyearly program report</caption>
              <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Target Certification</th>
                  <th className="px-3 py-2.5">Achieved?</th>
                  <th className="px-3 py-2.5">Date of Completion</th>
                  <th className="px-3 py-2.5">Certification Code</th>
                  <th className="px-3 py-2.5">Course Delivery Ready?</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.map((r) => (
                  <ReportRow key={r.id} row={r} canEdit={isHr || r.employeeCode === user.code} isHr={isHr} onSaved={reload} onEdit={() => startEdit(r)} onDelete={() => remove(r)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** One row: the assignment (read-only) and the employee's own answers, saved with the row's Save button. */
function ReportRow({ row, canEdit, isHr, onSaved, onEdit, onDelete }) {
  const toast = useToast();
  const initial = () => ({ achieved: row.achieved || '', completionDate: row.completionDate || '', certificationCode: row.certificationCode || '', deliveryReady: row.deliveryReady || '' });
  const [v, setV] = useState(initial);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(initial()), [row]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial());
  const yes = v.achieved === 'Yes';

  const save = async () => {
    const e = {};
    if (yes && !v.completionDate) e.completionDate = 'Required';
    if (yes && !v.certificationCode.trim()) e.certificationCode = 'Required';
    setErr(e);
    if (Object.keys(e).length) return toast.error('Enter the date of completion and the certification code.');
    setSaving(true);
    try {
      await api.updateHalfyearlyStatus(row.id, { ...v, completionDate: yes ? v.completionDate : '', certificationCode: yes ? v.certificationCode.trim() : '' });
      toast.success('Saved.');
      onSaved();
    } catch (ex) {
      toast.error(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-3 py-2.5">
        <div className="font-medium text-ink-900">{row.employeeName}</div>
        <div className="text-xs text-ink-500">{row.employeeCode}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
        {monthLabel(row.startMonth)} – {monthLabel(row.endMonth)}
      </td>
      <td className="px-3 py-2.5">
        <div className="text-ink-900">{row.targetCertification}</div>
        {row.courseId && <div className="text-xs text-ink-500">Course {row.courseId}</div>}
      </td>
      <td className="px-3 py-2">
        <Select aria-label="Certification achieved" sort={false} className="w-24" options={YES_NO} placeholder="Select" disabled={!canEdit} value={v.achieved} onChange={(e) => set('achieved', e.target.value)} />
      </td>
      <td className="px-3 py-2">
        {yes ? <Input aria-label="Date of completion" type="date" className="w-40" max={new Date().toISOString().slice(0, 10)} disabled={!canEdit} value={v.completionDate} onChange={(e) => set('completionDate', e.target.value)} error={err.completionDate} /> : <span className="text-ink-400">–</span>}
      </td>
      <td className="px-3 py-2">
        {yes ? <Input aria-label="Certification code" className="w-40" maxLength={80} disabled={!canEdit} value={v.certificationCode} onChange={(e) => set('certificationCode', e.target.value)} error={err.certificationCode} /> : <span className="text-ink-400">–</span>}
      </td>
      <td className="px-3 py-2">
        <Select aria-label="Course delivery ready" sort={false} className="w-24" options={YES_NO} placeholder="Select" disabled={!canEdit} value={v.deliveryReady} onChange={(e) => set('deliveryReady', e.target.value)} />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1.5">
          {canEdit && (
            <Button size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
              Save
            </Button>
          )}
          {isHr && <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit} aria-label="Edit assignment" />}
          {isHr && <Button size="sm" variant="danger-outline" icon={Trash2} onClick={onDelete} aria-label="Delete row" />}
        </div>
      </td>
    </tr>
  );
}
