import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Mail, Play, Save } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import ReportRows, { ReportHead } from '../../components/hr/CertificationRows';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';
import { isCurrent } from '../../utils/halfyearly';
import { isSuperAdmin } from '../../utils/permissions';

const SHOW = [
  { value: 'pending', label: 'Not completed' },
  { value: 'current', label: 'Current quarter' },
  { value: 'carried', label: 'Carried forward' },
  { value: 'completed', label: 'All completed' },
  { value: 'all', label: 'All rows' },
];
const done = (r) => r.targets.length > 0 && r.targets.every((t) => t.achieved === 'Yes');
const FILTERS = {
  pending: (r) => r.targets.some((t) => t.achieved !== 'Yes' && !t.carriedTo),
  current: (r) => isCurrent(r),
  carried: (r) => r.carriedForward || r.targets.some((t) => t.carriedForward),
  completed: done,
  all: () => true,
};

/**
 * HR › Certification Status (HR, Admin, Super Admin): record Completed Yes with the date of completion and the
 * certification code, and Delivery ready, for each assigned certification. When a quarter ends, unfinished
 * certifications move to the next quarter (Carried forward) and the employee gets the Deferred Report email
 * from the HR mail. The Super Admin sets the HR mail id here.
 */
export default function CertificationStatus() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const isHr = api.HR_ROLES.includes(user.role);
  const [employee, setEmployee] = useState('');
  const [show, setShow] = useState('pending');
  const { data, loading, error, reload } = useAsync(() => (isHr ? api.getHalfyearly({ employeeCode: employee }) : Promise.resolve([])), [employee]);
  const people = useMemo(() => {
    const seen = new Map();
    for (const p of [...(lookups?.employees || []), ...(lookups?.faculties || [])]) if (!seen.has(p.code)) seen.set(p.code, p);
    return [...seen.values()].map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }));
  }, [lookups]);
  const rows = (data || []).filter(FILTERS[show]);

  if (!isHr) {
    return (
      <>
        <PageHeader title="Certification Status" />
        <Card><p className="text-sm text-ink-600">Only HR, Admin and the Super Admin can update the certification status.</p></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Certification Status"
        breadcrumb={[{ label: 'HR' }, { label: 'Certification Status' }]}
        description="Record Completed Yes with the date of completion for each assigned certification. Unfinished ones move to the next quarter when the quarter ends."
      />
      <FollowupCard onRun={reload} />
      <Card
        bodyClassName="p-0"
        title="Assigned certifications"
        description="Choose Completed Yes, enter the date of completion and the certification code, then click Save on that row."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Filter by employee" searchable className="w-64" placeholder="All employees" options={people} value={employee} onChange={(e) => setEmployee(e.target.value)} />
            <Select aria-label="Show" sort={false} className="w-44" placeholder="" options={SHOW} value={show} onChange={(e) => setShow(e.target.value)} />
          </div>
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !rows.length ? (
          <EmptyState icon={BadgeCheck} title="Nothing to show" message={data?.length ? 'No row matches this filter.' : 'Assign certifications in Halfyearly Program Report first.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-[13px]">
              <caption className="sr-only">Certification status</caption>
              <ReportHead actions />
              <tbody>
                {rows.map((r) => (
                  <ReportRows key={r.id} row={r} editStatus onSaved={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** HR mail id (Super Admin sets it), last automatic run, "Run now", and the Deferred Report email template. */
function FollowupCard({ onRun }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const superAdmin = isSuperAdmin(user);
  const { data, error, reload } = useAsync(() => api.getCertFollowup(), []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [showTemplate, setShowTemplate] = useState(false);
  useEffect(() => setEmail(data?.hrEmail || ''), [data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const save = async (e) => {
    e.preventDefault();
    setBusy('save');
    try {
      await api.saveCertFollowup(email.trim());
      toast.success(email.trim() ? 'HR mail id saved.' : 'HR mail id removed.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const run = async () => {
    if (!(await confirm({ title: 'Run now', message: 'Move unfinished certifications of ended quarters to the next quarter and email the Deferred Report to each employee not emailed yet?', confirmLabel: 'Run now' }))) return;
    setBusy('run');
    try {
      const r = await api.runCertFollowup();
      if (r.error) toast.error(r.error);
      toast.success(`${r.carried.length} row(s) carried forward, ${r.sent.length} email(s) sent${r.skipped.length ? `, ${r.skipped.length} without email` : ''}${r.failed.length ? `, ${r.failed.length} failed` : ''}.`);
      reload();
      onRun();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const last = data.lastRun;
  return (
    <Card
      className="mb-5"
      title={<span className="flex items-center gap-2"><Mail className="size-5 text-brand-600" aria-hidden /> Deferred Report email</span>}
      description={`When a quarter ends, each employee with unfinished certifications gets one email from the HR mail at their email in Employees.${data.enabled ? ` Checked daily at ${data.time}.` : ' The daily check is off on the server.'}`}
      actions={superAdmin && <Button size="sm" variant="secondary" icon={Play} loading={busy === 'run'} onClick={run}>Run now</Button>}
    >
      {superAdmin ? (
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <Input label="HR mail id" type="email" className="w-full sm:w-80" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@example.com" hint="Reply-To of the email, and gets a copy" />
          <Button type="submit" icon={Save} loading={busy === 'save'} disabled={email.trim() === (data.hrEmail || '')}>Save</Button>
        </form>
      ) : (
        <p className="text-[13px] text-ink-700">HR mail id: <b>{data.hrEmail || 'not set'}</b> <span className="text-ink-500">(set by the Super Admin)</span></p>
      )}
      <p className="mt-3 text-xs text-ink-500">
        {last ? `Last run ${formatDateTime(last.at)} by ${last.by}: ${last.carried} carried forward, ${last.sent} sent${last.skipped ? `, ${last.skipped} without email` : ''}${last.failed ? `, ${last.failed} failed` : ''}.${last.error ? ` ${last.error}` : ''}` : 'Not run yet.'}
        {' '}
        <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setShowTemplate((v) => !v)}>{showTemplate ? 'Hide' : 'View'} email template</button>
      </p>
      {showTemplate && (
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-[13px]">
          <p className="mb-2"><span className="text-ink-500">Subject:</span> <b>{data.template.subject}</b></p>
          <pre className="whitespace-pre-wrap font-sans text-ink-800">{data.template.text}</pre>
        </div>
      )}
    </Card>
  );
}
