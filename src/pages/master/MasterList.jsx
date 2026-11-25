import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Award, Download, FileBarChart, FolderOpen, Gift, Hash, Pencil, Plus, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DatePicker from '../../components/ui/DatePicker';
import TimePicker from '../../components/ui/TimePicker';
import TimeField from '../../components/ui/TimeField';
import RadioGroup from '../../components/ui/RadioGroup';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { isSuperAdmin } from '../../utils/permissions';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { masterByKey } from '../../config/masterMenu';
import { lookupLabel, lookupOptions } from '../../components/master/lookupOptions';
import { formatDate, formatDateTime, formatTime } from '../../utils/format';
import { downloadCsv } from '../../utils/export';
import ExternalFacultyDetails from '../../components/master/ExternalFacultyDetails';

const display = (f, v, lookups) => {
  if (v === undefined || v === null || v === '') return '';
  if (f.type === 'date') return formatDate(v);
  if (f.type === 'time') return formatTime(v);
  if (f.type === 'lookup') return lookupLabel(f.source, v, lookups);
  if (f.type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
};

/** Timing stored as "HH:MM to HH:MM" (also the BatchMaster file format). */
const splitRange = (v) => {
  const m = /^(\d{1,2}[:.]\d{2})\s*(?:to|-|–)\s*(\d{1,2}[:.]\d{2})$/i.exec(String(v || '').trim());
  const norm = (t) => (t ? t.replace('.', ':').padStart(5, '0') : '');
  return m ? [norm(m[1]), norm(m[2])] : ['', ''];
};
const joinRange = (a, b) => (a || b ? `${a || ''} to ${b || ''}` : '');
const rangeError = (v) => {
  const [a, b] = splitRange(v);
  if (!a || !b) return 'Choose the From and To time';
  if (b <= a) return 'To must be after From';
  return '';
};
/** A field with `showIf` is shown (and required) only while another field has that value. */
const shown = (f, form) => !f.hidden && (!f.showIf || Object.entries(f.showIf).every(([k, val]) => form[k] === val));

function FieldInput({ f, value, error, onChange, lookups, onAddNew }) {
  if (f.type === 'timerange') {
    // While choosing, one side may still be empty ("10:00 to "), so split loosely and keep both sides.
    const [a, b] = splitRange(value).every(Boolean) ? splitRange(value) : String(value || '').split(' to ').concat(['', '']).slice(0, 2);
    const pick = (v) => (v?.target ? v.target.value : v) || '';
    return (
      <div className="grid grid-cols-2 gap-3">
        <TimeField label={`${f.label} From`} required={f.required} value={a} error={error} onChange={(v) => onChange(joinRange(pick(v), b))} />
        <TimeField label={`${f.label} To`} required={f.required} value={b} onChange={(v) => onChange(joinRange(a, pick(v)))} />
      </div>
    );
  }
  if (f.type === 'toggle') {
    return <RadioGroup label={f.label} required={f.required} name={f.key} options={f.options} value={value || ''} error={error} onChange={(v) => onChange(v?.target ? v.target.value : v)} />;
  }
  const common = { label: f.label, required: f.required, hint: f.hint, error, value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (f.type) {
    case 'select':
      return <Select {...common} options={f.options} />;
    case 'lookup':
      return (
        <Select
          {...common}
          searchable
          options={lookupOptions(f.source, lookups)}
          aside={f.addNew && onAddNew && (
            <button type="button" onClick={onAddNew} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline">
              <Plus className="size-3.5" aria-hidden /> {f.addNewLabel || 'Add new'}
            </button>
          )}
        />
      );
    case 'date':
      return <DatePicker {...common} />;
    case 'time':
      return <TimePicker {...common} />;
    case 'textarea':
      return <Textarea {...common} rows={3} maxLength={500} className="sm:col-span-2" />;
    case 'number':
      return <Input {...common} inputMode="decimal" />;
    case 'email':
      return <Input {...common} type="email" />;
    case 'phone':
      return <Input {...common} inputMode="tel" maxLength={15} />;
    default:
      return <Input {...common} />;
  }
}

/** Generic Master screen: list, search, add, edit, delete and export for one master collection. */
export default function MasterList() {
  const { key } = useParams();
  const def = masterByKey(key);
  const { user } = useAuth();
  const isExt = key === 'externalFaculty';
  // Only the Super Admin deletes records; v60: Admin also deletes External Faculty. Admin / HR view, add and edit.
  const canDelete = isSuperAdmin(user) || (isExt && user.role === 'ADMIN');
  const [opened, setOpened] = useState(null); // External Faculty › Open
  const { lookups, reload: reloadLookups } = useLookups();
  const toast = useToast();
  // v59: External Faculty: "Send wishes" on the birthday / anniversary itself (WhatsApp template).
  const [wishes, setWishes] = useState([]);
  const [sending, setSending] = useState('');
  useEffect(() => {
    if (key !== 'externalFaculty' || !api.HR_ROLES.includes(user.role)) return setWishes([]);
    api.getCelebrationsToday().then(setWishes).catch(() => setWishes([]));
  }, [key, user.role]);
  const sendWishes = async (w) => {
    setSending(w.key);
    try {
      await api.sendCelebrationWishes(w.kind, w.facultyId);
      toast.success(`${w.label} wishes sent to ${w.name} on WhatsApp.`);
      setWishes((l) => l.map((x) => (x.key === w.key ? { ...x, sent: true } : x)));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending('');
    }
  };
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(() => (def ? api.getMasterRecords(key) : Promise.resolve([])), [key]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState(() => new Set()); // ids of the ticked rows
  const [deleting, setDeleting] = useState(false);
  // Batch page: Batch No requests sent by faculty from the Class entry, turned into batches here.
  const isBatch = key === 'batches';
  const requests = useAsync(() => (isBatch ? api.getBatchRequests().catch(() => []) : Promise.resolve([])), [key]);
  const [fromRequest, setFromRequest] = useState(null);
  const [addNew, setAddNew] = useState(null); // { field, def, form, errors } : "+ Add external faculty" inside the form

  useEffect(() => setPicked(new Set()), [key]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = data || [];
    if (!s || !def) return list;
    return list.filter((r) => def.fields.some((f) => display(f, r[f.key], lookups).toLowerCase().includes(s)));
  }, [data, q, def, lookups]);

  // Ticked rows that still exist (a reload or search may have removed some).
  const pickedIds = useMemo(() => (data || []).filter((r) => picked.has(r.id)).map((r) => r.id), [data, picked]);

  if (!def) return <Navigate to="/master" replace />;

  const openNew = () => {
    setErrors({});
    setFromRequest(null);
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, f.default ?? ''])));
  };
  const validate = () => {
    const errs = {};
    def.fields.forEach((f) => {
      const v = form[f.key];
      if (!shown(f, form)) return;
      if (f.required && (v === '' || v === undefined || v === null)) errs[f.key] = 'Required';
      else if (f.type === 'timerange' && rangeError(v)) errs[f.key] = rangeError(v);
      else if (v !== '' && v !== undefined) {
        if (f.type === 'number' && Number.isNaN(Number(v))) errs[f.key] = 'Enter a number';
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[f.key] = 'Enter a valid email';
        if (f.type === 'phone' && !/^[0-9+\- ]{6,15}$/.test(v)) errs[f.key] = 'Enter a valid number';
        if (f.pattern && !new RegExp(f.pattern).test(String(v))) errs[f.key] = 'Not valid';
      }
    });
    setErrors(errs);
    return !Object.keys(errs).length;
  };
  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const rec = { ...form };
      def.fields.forEach((f) => {
        if (!f.hidden && !shown(f, form)) rec[f.key] = ''; // hidden fields (from the Excel import) keep their value
        if (f.type === 'timerange' && rec[f.key]) rec[f.key] = joinRange(...splitRange(rec[f.key]));
        if (f.type === 'number' && rec[f.key] !== '') rec[f.key] = Number(rec[f.key]);
      });
      await api.saveMasterRecord(key, rec);
      toast.success(form.id ? `${def.label} updated.` : `${def.label} added.`);
      if (fromRequest) {
        await api.setBatchRequestStatus(fromRequest, 'Done').catch(() => {});
        setFromRequest(null);
        requests.reload();
      }
      setForm(null);
      reload();
      reloadLookups();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (r) => {
    const name = r[def.titleField] ? display(def.fields.find((f) => f.key === def.titleField), r[def.titleField], lookups) : r.id;
    if (!(await confirm({ title: `Delete ${def.label}`, message: `Delete ${name}? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteMasterRecord(key, r.id);
      toast.success('Deleted.');
      reload();
      reloadLookups();
    } catch (e) {
      toast.error(e.message);
    }
  };
  // "Create batch" on a request: the Add Batch form filled with the course, start date, time and faculty asked for.
  const createFromRequest = (r) => {
    setErrors({});
    setFromRequest(r.id);
    setForm({
      ...Object.fromEntries(def.fields.map((f) => [f.key, f.default ?? ''])),
      courseId: r.courseId || '',
      startDate: r.startDate || '',
      timing: r.batchTime || '',
      facultyCode: r.requestedByCode || '',
      otherFaculty: '',
    });
  };
  const dismissRequest = async (r) => {
    if (!(await confirm({ title: 'Dismiss request', message: `Dismiss the Batch No request of ${r.requestedByName} for ${r.courseId}?`, confirmLabel: 'Dismiss' }))) return;
    try {
      await api.setBatchRequestStatus(r.id, 'Dismissed');
      requests.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const closeForm = () => {
    setForm(null);
    setFromRequest(null);
  };
  const openAddNew = (f) => {
    const d = masterByKey(f.addNew);
    if (d) setAddNew({ field: f.key, def: d, form: Object.fromEntries(d.fields.map((x) => [x.key, x.default ?? ''])), errors: {}, saving: false });
  };
  const saveAddNew = async () => {
    const { def: d, form: rec } = addNew;
    const errs = {};
    d.fields.forEach((x) => {
      const v = rec[x.key];
      if (x.required && (v === '' || v == null)) errs[x.key] = 'Required';
      else if (x.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[x.key] = 'Enter a valid email';
      else if (x.type === 'phone' && v && !/^[0-9+\- ]{6,15}$/.test(v)) errs[x.key] = 'Enter a valid number';
    });
    if (Object.keys(errs).length) return setAddNew((a) => ({ ...a, errors: errs }));
    setAddNew((a) => ({ ...a, saving: true }));
    try {
      const saved = await api.saveMasterRecord(d.key, rec);
      await reloadLookups();
      setForm((s) => ({ ...s, [addNew.field]: saved.id }));
      toast.success(`${d.label} ${saved[d.titleField] || ''} added and selected.`);
      setAddNew(null);
    } catch (e) {
      toast.error(e.message);
      setAddNew((a) => a && { ...a, saving: false });
    }
  };
  const editRow = (r) => {
    setErrors({});
    setFromRequest(null);
    const rec = { ...Object.fromEntries(def.fields.map((f) => [f.key, ''])), ...r };
    // Batches saved before the Internal / External choice: an employee in Other Faculty means Internal.
    // Batches saved before Faculty Type: a batch with an external faculty is External, every other one Internal.
    if (def.fields.some((f) => f.key === 'facultyType') && !rec.facultyType) rec.facultyType = rec.externalFacultyId ? 'External' : 'Internal';
    setForm(rec);
  };
  const toggle = (ids, on) =>
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const removeSelected = async () => {
    const n = pickedIds.length;
    if (!n) return;
    const ok = await confirm({
      title: `Delete ${n} ${def.label.toLowerCase()} record${n > 1 ? 's' : ''}`,
      message: `Delete the ${n} selected ${def.label.toLowerCase()} record${n > 1 ? 's' : ''} from the database? This cannot be undone.`,
      confirmLabel: 'OK, delete',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const { deleted } = await api.deleteMasterRecords(key, pickedIds);
      toast.success(`Deleted ${deleted} ${def.label.toLowerCase()} record${deleted === 1 ? '' : 's'}.`);
      setPicked(new Set());
      reload();
      reloadLookups();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };
  const exportCsv = () => downloadCsv(`${def.label.toLowerCase().replace(/\s+/g, '-')}.csv`, def.fields.map((f) => ({ header: f.label, value: (r) => display(f, r[f.key], lookups) })), rows);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((r) => r.id);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const pageSome = pageIds.some((id) => picked.has(id));
  const allMatching = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const box = 'size-4 cursor-pointer rounded border-ink-300 accent-brand-600';

  const actionsCol = {
      key: 'actions',
      header: <span className={isExt ? '' : 'sr-only'}>{canDelete ? 'Edit / Delete' : 'Edit'}</span>,
      headerClassName: isExt ? 'text-right' : undefined,
      render: (r) => (
        <div className={`flex gap-1 whitespace-nowrap${isExt ? ' justify-end' : ''}`}>
          <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit ${r[def.titleField] || r.id}`} title="Edit" onClick={() => editRow(r)}>Edit</Button>
          {canDelete && <Button size="sm" variant="ghost" className="hover:!bg-danger-50 hover:!text-danger-600" icon={Trash2} aria-label={`Delete ${r[def.titleField] || r.id}`} title="Delete" onClick={() => remove(r)}>Delete</Button>}
          {wishes.filter((w) => w.facultyId === r.id).map((w) => (
            <Button key={w.key} size="sm" icon={Gift} loading={sending === w.key} disabled={w.sent} title={w.sent ? 'Already sent today' : `Send ${w.label.toLowerCase()} wishes on WhatsApp`} onClick={() => sendWishes(w)}>
              {w.sent ? `${w.label} wishes sent` : `Send ${w.label.toLowerCase()} wishes`}
            </Button>
          ))}
        </div>
      ),
  };
  const columns = [
    canDelete && {
      key: 'select',
      header: (
        <input
          type="checkbox"
          className={box}
          aria-label="Select all rows on this page"
          checked={pageAll}
          ref={(el) => el && (el.indeterminate = !pageAll && pageSome)}
          onChange={(e) => toggle(pageIds, e.target.checked)}
        />
      ),
      headerClassName: 'w-10',
      className: 'w-10',
      render: (r) => <input type="checkbox" className={box} aria-label={`Select ${r[def.titleField] || r.id}`} checked={picked.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} />,
    },
    !isExt && actionsCol,
    ...def.fields.filter((f) => !f.hideInTable && !f.hidden).map((f) => ({
      key: f.key,
      header: f.label,
      align: f.type === 'number' ? 'right' : undefined,
      render: (r) => {
        // tableMerge: an empty value shows the other field instead (Faculty: internal, or the external faculty).
        const m = f.tableMerge && !r[f.key] && r[f.tableMerge.key] ? display({ type: 'lookup', source: f.tableMerge.source }, r[f.tableMerge.key], lookups) : null;
        if (isExt && f.key === def.titleField) {
          return (
            <span className="flex items-center gap-3">
              <span className="font-medium text-ink-900">{display(f, r[f.key], lookups)}</span>
              <Button size="sm" variant="secondary" icon={FolderOpen} onClick={() => setOpened(r)} aria-label={`Open ${r[f.key]}`}>Open</Button>
            </span>
          );
        }
        return <span className={f.key === def.titleField ? 'font-medium text-ink-900' : ''}>{m ?? display(f, r[f.key], lookups)}</span>;
      },
    })),
    isExt && actionsCol,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={def.label}
        description={def.description}
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: def.label }]}
        actions={
          <>
            {isExt && (
              <>
                <Link to="/master/external-certifications">
                  <Button variant="secondary" icon={Award}>External certifications</Button>
                </Link>
                <Link to="/master/external-faculty-report">
                  <Button variant="secondary" icon={FileBarChart}>Monthly report</Button>
                </Link>
              </>
            )}
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export</Button>
            <Button icon={Plus} onClick={openNew}>Add {def.label}</Button>
          </>
        }
      />
      {isBatch && requests.data?.length > 0 && (
        <Card className="mb-5" title={`Batch No requests (${requests.data.length})`} description="Sent by faculty with Request Batch No in the Class entry. Create batch opens Add Batch filled in from the request; saving it marks the request Done.">
          <ul className="divide-y divide-ink-100">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Hash className="size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] font-medium text-ink-900">
                    {r.courseId}{r.courseName ? ` – ${r.courseName}` : ''}
                    {[r.startDate && `start ${formatDate(r.startDate)}`, r.batchTime, r.students != null && `${r.students} students`].filter(Boolean).map((t) => <span key={t} className="text-xs text-ink-500"> · {t}</span>)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {r.requestedByName} ({r.requestedByCode}) · {formatDateTime(r.createdAt)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <Button size="sm" icon={Plus} onClick={() => createFromRequest(r)}>Create batch</Button>
                <Button size="sm" variant="secondary" onClick={() => dismissRequest(r)}>Dismiss</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <Input label="Search" className="w-full max-w-xs" placeholder={`Search ${def.label.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          {canDelete && pickedIds.length > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-1.5 text-[13px]">
              <span className="font-medium text-ink-800">{pickedIds.length} selected</span>
              {!allMatching && rows.length > pageIds.length && (
                <Button size="sm" variant="ghost" onClick={() => toggle(rows.map((r) => r.id), true)}>
                  Select all {rows.length}{q.trim() ? ' matching' : ''}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={X} onClick={() => setPicked(new Set())}>
                Clear
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} loading={deleting} onClick={removeSelected}>
                Delete selected
              </Button>
            </div>
          )}
          {canDelete && pickedIds.length === 0 && rows.length > 0 && (
            <Button variant="ghost" size="sm" className="mb-1" onClick={() => toggle(rows.map((r) => r.id), true)}>
              Select all {rows.length}{q.trim() ? ' matching' : ''}
            </Button>
          )}
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <DataTable dense columns={columns} rows={paged} loading={loading} caption={def.label} minWidth="min-w-[800px]" empty={<EmptyState title={`No ${def.label.toLowerCase()} records yet`} message={`Use "Add ${def.label}" to create the first one.`} />} />
            {rows.length > 10 && <Pagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />}
          </>
        )}
      </Card>

      <Modal open={!!form} onClose={closeForm} size="lg" title={form?.id ? `Edit ${def.label}` : fromRequest ? `Add ${def.label} from request` : `Add ${def.label}`}
        footer={<><Button variant="secondary" onClick={closeForm}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {def.fields.filter((f) => shown(f, form)).map((f) => (
              <FieldInput key={f.key} f={f} value={form[f.key]} error={errors[f.key]} lookups={lookups} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} onAddNew={f.addNew ? () => openAddNew(f) : undefined} />
            ))}
          </div>
        )}
      </Modal>

      {isExt && (
        <ExternalFacultyDetails
          record={opened && (data || []).find((r) => r.id === opened.id)}
          fields={def.fields}
          display={(f, v) => display(f, v, lookups)}
          onClose={() => setOpened(null)}
          onEdit={() => { const r = opened; setOpened(null); editRow(r); }}
          wishes={opened ? wishes.filter((w) => w.facultyId === opened.id) : []}
          sending={sending}
          onWish={sendWishes}
        />
      )}

      <Modal open={!!addNew} onClose={() => setAddNew(null)} title={addNew ? `Add ${addNew.def.label}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAddNew(null)}>Cancel</Button><Button loading={addNew?.saving} onClick={saveAddNew}>Save</Button></>}>
        {addNew && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {addNew.def.fields.map((x) => (
              <FieldInput key={x.key} f={x} value={addNew.form[x.key]} error={addNew.errors[x.key]} lookups={lookups} onChange={(v) => setAddNew((a) => ({ ...a, form: { ...a.form, [x.key]: v }, errors: { ...a.errors, [x.key]: undefined } }))} />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
