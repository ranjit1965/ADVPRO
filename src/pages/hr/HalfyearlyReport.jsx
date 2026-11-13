import { useEffect, useMemo, useState } from 'react';
import { Award, Download, Mail, Pencil, Save, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchableSelect from '../../components/ui/SearchableSelect';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import RequestCourseModal from '../../components/entry/RequestCourseModal';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/export';
import { periodDates } from '../../utils/halfyearly';

const YES_NO = ['Yes', 'No'];
const COUNTS = ['1', '2', '3'];
export const QUARTERS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
const blankCert = () => ({ courseId: '', name: '' });
const EMPTY_FORM = { employeeCode: '', quarter: '', startMonth: '', endMonth: '', targets: [blankCert()], deliveries: [blankCert()] };

const monthLabel = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '');
const resize = (list, n) => Array.from({ length: n }, (_, i) => list[i] || blankCert());

/**
 * HR › Halfyearly Program Report.
 * HR, Manager and Admin pick an employee and assign, for a quarter (H1 to H6) with its starting and ending month,
 * 1 to 3 target certifications and 1 to 3 delivery ready courses from the course list. Only they update the status;
 * the employee sees their own rows read-only (and on the dashboard).
 */
export default function HalfyearlyReport() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const isHr = api.HR_ROLES.includes(user.role);
  const [filter, setFilter] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.getHalfyearly({ employeeCode: filter }), [filter]);
  const [requestOpen, setRequestOpen] = useState(false);

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
  const setCount = (list, n) => setForm((f) => ({ ...f, [list]: resize(f[list], Number(n)) }));
  const setCert = (list, i, courseId) => setForm((f) => ({ ...f, [list]: f[list].map((c, j) => (j === i ? { courseId, name: courseName[courseId] || '' } : c)) }));
  const [startDate, endDate] = periodDates(form.startMonth, form.endMonth);

  const reset = () => {
    setEditingId(null);
    setErrors({});
    setForm((f) => ({ ...EMPTY_FORM, quarter: f.quarter, startMonth: f.startMonth, endMonth: f.endMonth }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.employeeCode) errs.employeeCode = 'Choose the employee';
    if (!form.quarter) errs.quarter = 'Choose H1 to H6';
    if (!form.startMonth) errs.startMonth = 'Choose the starting month';
    if (!form.endMonth) errs.endMonth = 'Choose the ending month';
    else if (form.startMonth && form.endMonth < form.startMonth) errs.endMonth = 'Must be on or after the starting month';
    form.targets.forEach((c, i) => !c.name && (errs[`targets${i}`] = 'Choose a course'));
    form.deliveries.forEach((c, i) => !c.name && (errs[`deliveries${i}`] = 'Choose a course'));
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error('Please fill the highlighted fields.');
    const body = { employeeCode: form.employeeCode, quarter: form.quarter, startMonth: form.startMonth, endMonth: form.endMonth, targets: form.targets, deliveries: form.deliveries };
    setSaving(true);
    try {
      if (editingId) await api.updateHalfyearly(editingId, body);
      else await api.assignHalfyearly(body);
      toast.success(editingId ? 'Certifications updated.' : 'Certifications assigned.');
      reset();
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
    const pick = (list) => (list?.length ? list.map((c) => ({ courseId: c.courseId || '', name: c.name })) : [blankCert()]);
    setForm({ employeeCode: r.employeeCode, quarter: r.quarter || '', startMonth: r.startMonth, endMonth: r.endMonth, targets: pick(r.targets), deliveries: pick(r.deliveries) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete row', message: `Delete the ${r.quarter || ''} certifications of ${r.employeeName}?`, confirmLabel: 'OK, delete', tone: 'danger' }))) return;
    try {
      await api.deleteHalfyearly(r.id);
      toast.success('Row deleted.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportCsv = () => {
    const lines = (data || []).flatMap((r) =>
      Array.from({ length: Math.max(r.targets.length, r.deliveries.length, 1) }, (_, i) => ({ r, t: r.targets[i] || {}, d: r.deliveries[i] || {} })),
    );
    downloadCsv('halfyearly-program-report.csv', [
      { header: 'Employee', value: (x) => `${x.r.employeeName} (${x.r.employeeCode})` },
      { header: 'Quarter', value: (x) => x.r.quarter || '' },
      { header: 'Starting Month', value: (x) => monthLabel(x.r.startMonth) },
      { header: 'Ending Month', value: (x) => monthLabel(x.r.endMonth) },
      { header: 'Target Certification', value: (x) => x.t.name || '' },
      { header: 'Achieved', value: (x) => x.t.achieved || '' },
      { header: 'Date of Completion', value: (x) => (x.t.completionDate ? formatDate(x.t.completionDate) : '') },
      { header: 'Certification Code', value: (x) => x.t.certificationCode || '' },
      { header: 'Delivery Ready Course', value: (x) => x.d.name || '' },
      { header: 'Delivery Ready', value: (x) => x.d.ready || '' },
    ], lines);
  };

  const certFields = (list, label) => (
    <div className="grid grid-cols-1 gap-4 md:col-span-12 md:grid-cols-12">
      <Select label={`No of ${label}s`} required sort={false} placeholder="" className="md:col-span-2" options={COUNTS} value={String(form[list].length)} onChange={(e) => setCount(list, e.target.value)} />
      {form[list].map((c, i) => (
        <div key={i} className={i ? 'md:col-span-10 md:col-start-3' : 'md:col-span-10'}>
          <SearchableSelect
            label={`${label} name ${i + 1}`}
            required
            options={courses}
            placeholder={c.name && !c.courseId ? c.name : 'Search course'}
            value={c.courseId}
            onChange={(v) => setCert(list, i, v)}
            error={errors[`${list}${i}`]}
            aside={
              i === 0 && (
                <button type="button" onClick={() => setRequestOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline">
                  <Mail className="size-3.5" aria-hidden /> Request new course
                </button>
              )
            }
          />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Halfyearly Program Report"
        breadcrumb={[{ label: 'HR' }, { label: 'Halfyearly Program Report' }]}
        description={isHr ? 'Assign each employee their target certifications and delivery ready courses for the quarter, then record the status.' : 'Your target certifications and delivery ready courses. HR records the status.'}
        actions={<Button variant="secondary" icon={Download} disabled={!data?.length} onClick={exportCsv}>Export</Button>}
      />

      {isHr && (
        <Card className="mb-5" title={editingId ? 'Edit certifications' : 'Assign certifications'}>
          <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <SearchableSelect label="Employee / Faculty" required className="md:col-span-6" options={people} placeholder="Search employee" value={form.employeeCode} onChange={(v) => setF('employeeCode', v)} error={errors.employeeCode} />
            <Select label="Quarter" required sort={false} className="md:col-span-2" options={QUARTERS} placeholder="Select" value={form.quarter} onChange={(e) => setF('quarter', e.target.value)} error={errors.quarter} />
            <Input label="Starting Month" type="month" required className="md:col-span-2" value={form.startMonth} onChange={(e) => setF('startMonth', e.target.value)} error={errors.startMonth} hint={startDate && `Start date ${formatDate(startDate)}`} />
            <Input label="Ending Month" type="month" required className="md:col-span-2" value={form.endMonth} min={form.startMonth || undefined} onChange={(e) => setF('endMonth', e.target.value)} error={errors.endMonth} hint={endDate && `End date ${formatDate(endDate)}`} />
            <fieldset className="rounded-xl border border-ink-200 p-4 md:col-span-12">
              <legend className="px-1 text-[13px] font-semibold text-ink-700">Target Certification</legend>
              {certFields('targets', 'Target Certification')}
            </fieldset>
            <fieldset className="rounded-xl border border-ink-200 p-4 md:col-span-12">
              <legend className="px-1 text-[13px] font-semibold text-ink-700">Delivery Ready Courses</legend>
              {certFields('deliveries', 'Delivery Ready Course')}
            </fieldset>
            <div className="flex items-end justify-end gap-2 md:col-span-12">
              {editingId && (
                <Button variant="secondary" icon={X} onClick={reset}>
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
        description={isHr ? 'Target certifications and delivery ready courses. Record the status on each line and click Save.' : 'Read-only: HR records the status.'}
        actions={isHr && <Select aria-label="Filter by employee" searchable className="w-64" placeholder="All employees" options={people} value={filter} onChange={(e) => setFilter(e.target.value)} />}
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !data?.length ? (
          <EmptyState icon={Award} title="No certifications assigned" message={isHr ? 'Assign certifications above.' : 'HR has not assigned a certification to you yet.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-[13px]">
              <caption className="sr-only">Halfyearly program report</caption>
              <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Quarter</th>
                  <th className="px-3 py-2.5">Target Certification</th>
                  <th className="px-3 py-2.5">Achieved?</th>
                  <th className="px-3 py-2.5">Date of Completion</th>
                  <th className="px-3 py-2.5">Certification Code</th>
                  <th className="px-3 py-2.5">Delivery Ready Course</th>
                  <th className="px-3 py-2.5">Delivery Ready?</th>
                  {isHr && <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <ReportRows key={r.id} row={r} isHr={isHr} onSaved={reload} onEdit={() => startEdit(r)} onDelete={() => remove(r)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <RequestCourseModal open={requestOpen} onClose={() => setRequestOpen(false)} />
    </>
  );
}

const statusOf = (row) => ({
  targets: row.targets.map((t) => ({ achieved: t.achieved || '', completionDate: t.completionDate || '', certificationCode: t.certificationCode || '' })),
  deliveries: row.deliveries.map((d) => ({ ready: d.ready || '' })),
});

/**
 * One employee's quarter: a line per certification (targets on the left, deliveries on the right), with the
 * employee, quarter and actions spanning the lines. HR edits the status in place; everyone else reads it.
 */
function ReportRows({ row, isHr, onSaved, onEdit, onDelete }) {
  const toast = useToast();
  const [v, setV] = useState(() => statusOf(row));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(statusOf(row)), [row]);
  const dirty = JSON.stringify(v) !== JSON.stringify(statusOf(row));
  const n = Math.max(row.targets.length, row.deliveries.length, 1);
  const setT = (i, k, val) => setV((s) => ({ ...s, targets: s.targets.map((t, j) => (j === i ? { ...t, [k]: val } : t)) }));
  const setD = (i, val) => setV((s) => ({ ...s, deliveries: s.deliveries.map((d, j) => (j === i ? { ready: val } : d)) }));

  const save = async () => {
    const e = {};
    v.targets.forEach((t, i) => {
      if (t.achieved === 'Yes' && !t.completionDate) e[`date${i}`] = 'Required';
      if (t.achieved === 'Yes' && !t.certificationCode.trim()) e[`code${i}`] = 'Required';
    });
    setErr(e);
    if (Object.keys(e).length) return toast.error('Enter the date of completion and the certification code.');
    setSaving(true);
    try {
      await api.updateHalfyearlyStatus(row.id, {
        targets: v.targets.map((t) => (t.achieved === 'Yes' ? { ...t, certificationCode: t.certificationCode.trim() } : { achieved: t.achieved, completionDate: '', certificationCode: '' })),
        deliveries: v.deliveries,
      });
      toast.success('Saved.');
      onSaved();
    } catch (ex) {
      toast.error(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const [from, to] = periodDates(row.startMonth, row.endMonth);
  const dash = <span className="text-ink-400">–</span>;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = row.targets[i];
        const tv = v.targets[i];
        const d = row.deliveries[i];
        const yes = tv?.achieved === 'Yes';
        return (
          <tr key={i} className={i === 0 ? 'border-t border-ink-200 align-top' : 'align-top'}>
            {i === 0 && (
              <>
                <td rowSpan={n} className="px-3 py-2.5">
                  <div className="font-medium text-ink-900">{row.employeeName}</div>
                  <div className="text-xs text-ink-500">{row.employeeCode}</div>
                </td>
                <td rowSpan={n} className="whitespace-nowrap px-3 py-2.5">
                  {row.quarter && <div className="font-semibold text-ink-900">{row.quarter}</div>}
                  <div className="tabular-nums">{monthLabel(row.startMonth)} – {monthLabel(row.endMonth)}</div>
                  <div className="text-xs text-ink-500">{formatDate(from)} to {formatDate(to)}</div>
                </td>
              </>
            )}
            <td className="px-3 py-2">
              {t ? (
                <>
                  <div className="text-ink-900">{i + 1}. {t.name}</div>
                  {t.courseId && <div className="text-xs text-ink-500">Course {t.courseId}</div>}
                </>
              ) : dash}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (
                <Select aria-label={`Certification ${i + 1} achieved`} sort={false} className="w-24" options={YES_NO} placeholder="Select" value={tv.achieved} onChange={(e) => setT(i, 'achieved', e.target.value)} />
              ) : (t.achieved || <span className="text-ink-400">Pending</span>)}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (yes ? <Input aria-label={`Certification ${i + 1} date of completion`} type="date" className="w-40" max={new Date().toISOString().slice(0, 10)} value={tv.completionDate} onChange={(e) => setT(i, 'completionDate', e.target.value)} error={err[`date${i}`]} /> : dash) : t.completionDate ? formatDate(t.completionDate) : dash}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (yes ? <Input aria-label={`Certification ${i + 1} code`} className="w-40" maxLength={80} value={tv.certificationCode} onChange={(e) => setT(i, 'certificationCode', e.target.value)} error={err[`code${i}`]} /> : dash) : t.certificationCode || dash}
            </td>
            <td className="px-3 py-2">
              {d ? (
                <>
                  <div className="text-ink-900">{i + 1}. {d.name}</div>
                  {d.courseId && <div className="text-xs text-ink-500">Course {d.courseId}</div>}
                </>
              ) : dash}
            </td>
            <td className="px-3 py-2">
              {!d ? dash : isHr ? (
                <Select aria-label={`Delivery ready course ${i + 1} ready`} sort={false} className="w-24" options={YES_NO} placeholder="Select" value={v.deliveries[i].ready} onChange={(e) => setD(i, e.target.value)} />
              ) : (d.ready || <span className="text-ink-400">Pending</span>)}
            </td>
            {isHr && i === 0 && (
              <td rowSpan={n} className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit} aria-label="Edit assignment" />
                  <Button size="sm" variant="danger-outline" icon={Trash2} onClick={onDelete} aria-label="Delete row" />
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}
