import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Download, Mail, X } from 'lucide-react';
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
import { isSuperAdmin } from '../../utils/permissions';
import ReportRows, { monthLabel, ReportHead } from '../../components/hr/CertificationRows';

const COUNTS = ['1', '2', '3'];
export const QUARTERS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
const blankCert = () => ({ courseId: '', name: '' });
const EMPTY_FORM = { employeeCode: '', quarter: '', startMonth: '', endMonth: '', targets: [blankCert()], deliveries: [blankCert()] };

const resize = (list, n) => Array.from({ length: n }, (_, i) => list[i] || blankCert());

/**
 * HR › Halfyearly Program Report.
 * HR, Super Admin and Admin pick an employee and assign, for a quarter (H1 to H6) with its starting and ending month,
 * 1 to 3 target certifications and 1 to 3 delivery ready courses from the course list. The saved rows show below
 * the form (for the employee picked in the form). The status (Completed Yes / date / code) is recorded in
 * HR › Certification Status. The employee sees their own rows read-only (and on the dashboard).
 */
export default function HalfyearlyReport() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const isHr = api.HR_ROLES.includes(user.role);
  const [filter, setFilter] = useState('');
  const [lastSaved, setLastSaved] = useState('');
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
  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'employeeCode' && v) setFilter(v); // the list below shows that person's saved rows
  };
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
      const saved = editingId ? await api.updateHalfyearly(editingId, body) : await api.assignHalfyearly(body);
      toast.success(editingId ? 'Certifications updated. The saved row is shown below.' : 'Certifications assigned. The saved row is shown below.');
      setLastSaved(saved?.id || '');
      reset();
      if (filter === body.employeeCode) reload();
      else setFilter(body.employeeCode);
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
      { header: 'Completed', value: (x) => x.t.achieved || '' },
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
        description={isHr ? 'Assign each employee their target certifications and delivery ready courses for the quarter. Record the completion in Certification Status.' : 'Your target certifications and delivery ready courses. HR records the status.'}
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
        title={filter && isHr ? `Saved certifications of ${people.find((p) => p.value === filter)?.label || filter}` : 'HALFYEARLY PROGRAM REPORT'}
        description={isHr ? (
          <>Saved rows. Record Completed Yes and the date in <Link to="/hr-report/certification-status" className="font-medium text-brand-700 hover:underline">Certification Status</Link>.</>
        ) : 'Read-only: HR records the status.'}
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
            <table className="w-full min-w-[1150px] text-left text-[13px]">
              <caption className="sr-only">Halfyearly program report</caption>
              <ReportHead actions={isHr} />
              <tbody>
                {data.map((r) => (
                  <ReportRows key={r.id} row={r} highlight={r.id === lastSaved} onEdit={isHr ? () => startEdit(r) : undefined} onDelete={isSuperAdmin(user) ? () => remove(r) : undefined} />
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

