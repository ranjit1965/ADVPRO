import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ListChecks, Mail, Pencil, Save, Send } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import ErrorState from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';

/**
 * HR › Halfyearly Program Report › Mail to faculty (v60). The certification status itself is recorded in the
 * Halfyearly Program Report rows. Here HR sends, with a button (never automatically):
 *   * the Deferred Report and Certification Completed emails (Check completed / not completed first), and
 *   * HR's own Performance mail (HR and the Super Admin only), to the faculty's official and personal email.
 */
export default function CertificationStatus() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHr = api.HALFYEARLY_ROLES.includes(user.role);
  const canPerf = ['HR', 'MANAGER'].includes(user.role);
  const { data, reload } = useAsync(() => (isHr ? api.getHalfyearly({}) : Promise.resolve([])), []);

  if (!isHr) {
    return (
      <>
        <PageHeader title="Mail to faculty" />
        <Card><p className="text-sm text-ink-600">Only HR, Admin and the Super Admin can send these emails.</p></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Mail to faculty"
        breadcrumb={[{ label: 'HR' }, { label: 'Halfyearly Program Report', to: '/hr-report/halfyearly' }, { label: 'Mail to faculty' }]}
        description="Deferred Report, Certification Completed and Performance emails. Record the certification status in Halfyearly Program Report."
        actions={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/hr-report/halfyearly')}>Halfyearly Program Report</Button>}
      />
      <FollowupCard onRun={reload} refreshKey={data} />
      {canPerf && <PerformanceCard rows={data || []} />}
    </>
  );
}

/** v60: HR's own Performance mail template (kept per HR user) and Send for one faculty's half-year row. */
function PerformanceCard({ rows }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: loaded, error, reload } = useAsync(() => api.getPerformanceTemplate(), []);
  const [tpl, setData] = useState(null);
  useEffect(() => setData(loaded), [loaded]);
  const [form, setForm] = useState({ subject: '', body: '' });
  const [rowId, setRowId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (tpl) setForm({ subject: tpl.subject, body: tpl.body });
  }, [tpl]);
  const options = useMemo(() => rows.map((r) => ({ value: r.id, label: `${r.employeeName} (${r.employeeCode}) · ${r.quarter || ''} ${r.startDate || r.startMonth || ''}` })), [rows]);

  const save = async () => {
    setBusy('save');
    try {
      setData(await api.savePerformanceTemplate(form.subject, form.body));
      toast.success('Your performance mail template is saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const send = async () => {
    const r = rows.find((x) => x.id === rowId);
    if (!r) return toast.error('Choose the faculty and half-year first.');
    if (!(await confirm({ title: 'Send performance mail', message: `Send this email to ${r.employeeName} (official and personal email)?`, confirmLabel: 'Send' }))) return;
    setBusy('send');
    try {
      const res = await api.sendPerformanceMail({ rowId, subject: form.subject, body: form.body, note });
      toast.success(`Sent to ${res.to.join(', ')}.`);
      setNote('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!tpl) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><Mail className="size-5 text-brand-600" aria-hidden /> Performance mail</span>} description="Your own template (only you see it). Sent from your HR mail to the faculty's official and personal email in Employees.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Select label="Faculty and half-year" searchable sort={false} placeholder="Choose" options={options} value={rowId} onChange={(e) => setRowId(e.target.value)} />
        <Input label="Note ({note})" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional line for this faculty" />
        <Input label="Subject" className="md:col-span-2" maxLength={300} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        <Textarea label="Email text" className="md:col-span-2" rows={10} maxLength={10000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="text-ink-500">Insert:</span>
        {tpl.placeholders.map((k) => (
          <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, body: `${f.body}${k}` }))} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">{k}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Save} loading={busy === 'save'} onClick={save}>Save my template</Button>
        <Button size="sm" icon={Send} loading={busy === 'send'} disabled={!rowId} onClick={send}>Send</Button>
      </div>
    </Card>
  );
}

/** HR mail and Super Admin mail (CC), taken from the employee records, then the two emails HR sends with a button: Deferred Report and Certification Completed. */
function FollowupCard({ onRun, refreshKey }) {
  const toast = useToast();
  const { data, error, reload, setData } = useFollowup(refreshKey);
  const [checking, setChecking] = useState(false);
  // Check: who completed (Certification Completed card) and who did not (Deferred Report card), freshly from the records.
  const check = async () => {
    setChecking(true);
    try {
      const d = await api.getCertFollowup();
      setData(d);
      onRun?.();
      const done = d.pending.completed.length;
      const notDone = d.pending.deferred.length + (d.running || []).length;
      toast.success(`Checked: ${done} completed (waiting for the email), ${notDone} not completed.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const who = (u, email) => (email ? <><span className="font-medium text-ink-900">{email}</span>{u?.name && <span className="text-ink-500"> ({u.name})</span>}</> : <span className="font-medium text-red-600">Not found</span>);

  return (
    <>
      <Card
        className="mb-5"
        title={<span className="flex items-center gap-2"><Mail className="size-5 text-brand-600" aria-hidden /> Certification emails</span>}
        description="Emails go only when HR clicks Send, to each employee's email in Employees. Unfinished certifications move to the next quarter automatically when a quarter ends."
        actions={<Button size="sm" variant="secondary" icon={ListChecks} loading={checking} onClick={check}>Check completed / not completed</Button>}
      >
        <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">From: HR mail</dt>
            <dd className="mt-1">{who(data.hrUser, data.hrEmail)}</dd>
            <dd className="mt-0.5 text-xs text-ink-500">The email of the HR user in Employees (the HR who clicks Send). Replies come here.</dd>
          </div>
          <div className="rounded-xl border border-ink-200 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">CC: Super Admin mail</dt>
            <dd className="mt-1">{who(data.superAdminUser, data.ccEmail)}</dd>
            <dd className="mt-0.5 text-xs text-ink-500">The Super Admin's email in their record. Gets a copy of every email.</dd>
          </div>
        </dl>
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
        <p className="mb-3 text-[13px] text-ink-500">{kind === 'deferred' ? 'No ended quarter has certifications waiting for this email.' : 'No completed certification is waiting for this email.'}</p>
      )}
      {kind === 'deferred' && data.running?.length > 0 && (
        <div className="mb-3 rounded-lg border border-warning-600/25 bg-warning-50 p-2.5">
          <p className="mb-1 text-[12px] font-semibold text-warning-700">Not completed yet, quarter still running ({data.running.length}). The Deferred Report can be sent after the quarter ends.</p>
          <ul className="max-h-40 space-y-1 overflow-auto text-[13px]">
            {data.running.map((p) => (
              <li key={p.id} className="border-b border-warning-600/15 pb-1 last:border-0">
                <span className="font-medium text-ink-900">{p.name}</span> <span className="text-xs text-ink-500">({p.employeeCode}) · {p.quarter} · ends {p.endLabel}</span>
                <span className="block text-xs text-ink-600">{p.courses.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
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
