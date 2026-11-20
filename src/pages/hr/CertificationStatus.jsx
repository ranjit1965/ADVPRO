import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Mail, Pencil, Save, Send } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
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
 * certifications move to the next quarter (Carried forward). HR sends the Deferred Report and the Certification
 * Completed emails with a button (never automatically) and can edit both texts here. The Super Admin sets the HR mail id.
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
      <FollowupCard onRun={reload} refreshKey={data} />
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

/** HR mail id (the Super Admin sets it), then the two emails HR sends with a button: Deferred Report and Certification Completed. */
function FollowupCard({ onRun, refreshKey }) {
  const { user } = useAuth();
  const toast = useToast();
  const superAdmin = isSuperAdmin(user);
  const { data, error, reload, setData } = useFollowup(refreshKey);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setEmail(data?.hrEmail || ''), [data?.hrEmail]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await api.saveCertFollowup(email.trim()));
      toast.success(email.trim() ? 'HR mail id saved.' : 'HR mail id removed.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        className="mb-5"
        title={<span className="flex items-center gap-2"><Mail className="size-5 text-brand-600" aria-hidden /> Certification emails</span>}
        description="Emails go only when HR clicks Send, to each employee's email in Employees. Unfinished certifications move to the next quarter automatically when a quarter ends."
      >
        {superAdmin ? (
          <form onSubmit={save} className="flex flex-wrap items-end gap-3">
            <Input label="HR mail id" type="email" className="w-full sm:w-80" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@example.com" hint="Reply-To of the emails, and gets a copy" />
            <Button type="submit" icon={Save} loading={busy} disabled={email.trim() === (data.hrEmail || '')}>Save</Button>
          </form>
        ) : (
          <p className="text-[13px] text-ink-700">HR mail id: <b>{data.hrEmail || 'not set'}</b> <span className="text-ink-500">(set by the Super Admin)</span></p>
        )}
      </Card>
      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <MailCard kind="deferred" title="Deferred Report email" note="For certifications not completed when the quarter ended. One email per employee and quarter." data={data} setData={setData} onSent={onRun} />
        <MailCard kind="completed" title="Certification Completed email" note="For certifications marked Completed Yes. Each completed certification is emailed once." data={data} setData={setData} onSent={onRun} />
      </div>
    </>
  );
}

/** Loaded again whenever the certification list reloads (a status saved as Completed Yes shows up at once). */
function useFollowup(refreshKey) {
  const { data, error, reload } = useAsync(() => api.getCertFollowup(), [refreshKey]);
  const [local, setLocal] = useState(null);
  useEffect(() => setLocal(data), [data]);
  return { data: local, error, reload, setData: setLocal };
}

/** One email: who is waiting for it, Send, and the editable subject and text ({name}, {courses} ... filled in). */
function MailCard({ kind, title, note, data, setData, onSent }) {
  const toast = useToast();
  const confirm = useConfirm();
  const tpl = data.templates[kind];
  const pending = data.pending[kind] || [];
  const last = data.lastSend?.[kind];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ subject: tpl.subject, body: tpl.body });
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(false);
  useEffect(() => setForm({ subject: tpl.subject, body: tpl.body }), [tpl.subject, tpl.body]);

  const saveTemplate = async () => {
    setBusy('save');
    try {
      setData(await api.saveCertTemplate(kind, form.subject, form.body));
      toast.success('Email template saved.');
      setEditing(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const resetTemplate = async () => {
    if (!(await confirm({ title: 'Default text', message: 'Put back the default subject and text of this email?', confirmLabel: 'Use default' }))) return;
    setBusy('save');
    try {
      setData(await api.saveCertTemplate(kind, '', ''));
      toast.success('Default email text restored.');
      setEditing(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const send = async () => {
    const withMail = pending.filter((p) => p.email).length;
    if (!(await confirm({ title: `Send ${title}`, message: `Send this email to ${withMail} employee(s) now?${withMail < pending.length ? ` ${pending.length - withMail} have no email in Employees and are skipped.` : ''}`, confirmLabel: 'Send' }))) return;
    setBusy('send');
    try {
      const r = await api.sendCertMails(kind);
      if (r.error) toast.error(r.error);
      else toast.success(`${r.sent.length} email(s) sent${r.skipped.length ? `, ${r.skipped.length} without email` : ''}${r.failed.length ? `, ${r.failed.length} failed` : ''}.`);
      setData(r.followup);
      onSent?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const insert = (key) => setForm((f) => ({ ...f, body: `${f.body}{${key}}` }));

  return (
    <Card
      title={title}
      description={note}
      actions={<Button size="sm" icon={Send} loading={busy === 'send'} disabled={!pending.length} onClick={send}>Send ({pending.length})</Button>}
    >
      {pending.length ? (
        <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-[13px]">
          {pending.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-ink-100 pb-1">
              <span className="font-medium text-ink-900">{p.name} <span className="text-xs text-ink-500">({p.employeeCode}) · {p.quarter}</span></span>
              <span className={p.email ? 'text-ink-600' : 'text-danger-700'}>{p.email || 'No email in Employees'}</span>
              <span className="w-full text-xs text-ink-500">{p.courses.join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[13px] text-ink-500">Nobody is waiting for this email.</p>
      )}
      <p className="text-xs text-ink-500">
        {last ? `Last sent ${formatDateTime(last.at)} by ${last.by}: ${last.sent} sent${last.skipped ? `, ${last.skipped} without email` : ''}${last.failed ? `, ${last.failed} failed` : ''}.` : 'Not sent yet.'}
        {tpl.updatedAt && ` Text changed ${formatDateTime(tpl.updatedAt)} by ${tpl.updatedBy}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing((v) => !v)}>{editing ? 'Close editor' : 'Edit email text'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setPreview((v) => !v)}>{preview ? 'Hide sample' : 'View sample'}</Button>
      </div>
      {preview && !editing && (
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-[13px]">
          <p className="mb-2"><span className="text-ink-500">Subject:</span> <b>{data.samples[kind].subject}</b></p>
          <pre className="whitespace-pre-wrap font-sans text-ink-800">{data.samples[kind].text}</pre>
        </div>
      )}
      {editing && (
        <div className="mt-3 space-y-3">
          <Input label="Subject" maxLength={300} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <Textarea label="Email text" rows={12} maxLength={10000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="text-ink-500">Insert:</span>
            {Object.entries(data.placeholders).filter(([k]) => kind === 'deferred' || !k.startsWith('next')).map(([k, label]) => (
              <button key={k} type="button" title={label} onClick={() => insert(k)} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">{`{${k}}`}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Save} loading={busy === 'save'} onClick={saveTemplate}>Save text</Button>
            <Button size="sm" variant="secondary" onClick={resetTemplate}>Use default text</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
