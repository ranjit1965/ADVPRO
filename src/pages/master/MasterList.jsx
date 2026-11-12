import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Download, Pencil, Plus, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DatePicker from '../../components/ui/DatePicker';
import TimePicker from '../../components/ui/TimePicker';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { masterByKey } from '../../config/masterMenu';
import { lookupLabel, lookupOptions } from '../../components/master/lookupOptions';
import { formatDate, formatTime } from '../../utils/format';
import { downloadCsv } from '../../utils/export';

const display = (f, v, lookups) => {
  if (v === undefined || v === null || v === '') return '';
  if (f.type === 'date') return formatDate(v);
  if (f.type === 'time') return formatTime(v);
  if (f.type === 'lookup') return lookupLabel(f.source, v, lookups);
  if (f.type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
};

function FieldInput({ f, value, error, onChange, lookups }) {
  const common = { label: f.label, required: f.required, hint: f.hint, error, value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (f.type) {
    case 'select':
      return <Select {...common} options={f.options} />;
    case 'lookup':
      return <Select {...common} searchable options={lookupOptions(f.source, lookups)} />;
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
  const { lookups, reload: reloadLookups } = useLookups();
  const toast = useToast();
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
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, f.default ?? ''])));
  };
  const validate = () => {
    const errs = {};
    def.fields.forEach((f) => {
      const v = form[f.key];
      if (f.required && (v === '' || v === undefined || v === null)) errs[f.key] = 'Required';
      else if (v !== '' && v !== undefined) {
        if (f.type === 'number' && Number.isNaN(Number(v))) errs[f.key] = 'Enter a number';
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[f.key] = 'Enter a valid email';
        if (f.type === 'phone' && !/^[0-9+\- ]{6,15}$/.test(v)) errs[f.key] = 'Enter a valid number';
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
        if (f.type === 'number' && rec[f.key] !== '') rec[f.key] = Number(rec[f.key]);
      });
      await api.saveMasterRecord(key, rec);
      toast.success(form.id ? `${def.label} updated.` : `${def.label} added.`);
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

  const columns = [
    {
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
    ...def.fields.filter((f) => !f.hideInTable).map((f) => ({ key: f.key, header: f.label, align: f.type === 'number' ? 'right' : undefined, render: (r) => <span className={f.key === def.titleField ? 'font-medium text-ink-900' : ''}>{display(f, r[f.key], lookups)}</span> })),
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => { setErrors({}); setForm({ ...Object.fromEntries(def.fields.map((f) => [f.key, ''])), ...r }); }} />
          <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => remove(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={def.label}
        description={def.description}
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: def.label }]}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export</Button>
            <Button icon={Plus} onClick={openNew}>Add {def.label}</Button>
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <Input label="Search" className="w-full max-w-xs" placeholder={`Search ${def.label.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          {pickedIds.length > 0 && (
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
          {pickedIds.length === 0 && rows.length > 0 && (
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

      <Modal open={!!form} onClose={() => setForm(null)} size="lg" title={form?.id ? `Edit ${def.label}` : `Add ${def.label}`}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {def.fields.map((f) => (
              <FieldInput key={f.key} f={f} value={form[f.key]} error={errors[f.key]} lookups={lookups} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
