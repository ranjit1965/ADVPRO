import { useMemo, useState } from 'react';
import { Award, Pencil, Plus, Trash2 } from 'lucide-react';
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
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../utils/format';

const STATUS = ['Current', 'Non-current'];
const BLANK = { facultyId: '', certificationId: '', name: '', provider: '', status: '', issueDate: '', expiryDate: '', notes: '' };

/**
 * External Faculty › External Certifications (v60): certifications of each external faculty, Current or
 * Non-current (left empty: Current until the expiry date passes). Every field but the faculty is optional.
 * HR, MIS, Admin and the Super Admin add and edit; Admin and the Super Admin delete.
 */
export default function ExternalCertifications() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const canDelete = ['ADMIN', 'MANAGER'].includes(user.role);
  const [facultyId, setFacultyId] = useState('');
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.getExternalCerts(facultyId), [facultyId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const faculties = useMemo(() => (lookups?.externalFaculties || []).map((f) => ({ value: f.value, label: `${f.label} (${f.value})` })), [lookups]);
  const rows = (data || []).filter((c) => !status || c.status === status);

  const save = async () => {
    if (!form.facultyId) return toast.error('Choose the external faculty.');
    if (form.issueDate && form.expiryDate && form.expiryDate < form.issueDate) return toast.error('Expiry date must be after the issue date.');
    setSaving(true);
    try {
      await api.saveExternalCert({ ...form, issueDate: form.issueDate || null, expiryDate: form.expiryDate || null });
      toast.success(form.id ? 'Certification updated.' : 'Certification added.');
      setForm(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: 'Delete certification', message: `Delete ${c.name || c.certificationId || c.id} of ${c.facultyName}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteExternalCert(c.id);
      toast.success('Deleted.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        title="External Certifications"
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'External Faculty', to: '/master/externalFaculty' }, { label: 'External Certifications' }]}
        description="Certifications of the external faculty, current or non-current. They show in Open and in the monthly report (whole record)."
        actions={<Button icon={Plus} onClick={() => setForm({ ...BLANK, facultyId })}>Add certification</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <Select label="External faculty" searchable className="w-72" placeholder="All" options={faculties} value={facultyId} onChange={(e) => setFacultyId(e.target.value)} />
          <Select label="Status" sort={false} className="w-44" placeholder="All" options={STATUS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !rows.length ? (
          <EmptyState icon={Award} title="No certifications" message="Use Add certification to record one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2.5">External faculty</th>
                  <th className="px-3 py-2.5">Certification</th>
                  <th className="px-3 py-2.5">Certification ID</th>
                  <th className="px-3 py-2.5">Issued</th>
                  <th className="px-3 py-2.5">Expiry</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Edit / Delete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-ink-100">
                    <td className="px-3 py-2 font-medium text-ink-900">{c.facultyName}</td>
                    <td className="px-3 py-2">{c.name || '–'}{c.provider && <div className="text-xs text-ink-500">{c.provider}</div>}</td>
                    <td className="px-3 py-2">{c.certificationId || '–'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.issueDate ? formatDate(c.issueDate) : '–'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.expiryDate ? formatDate(c.expiryDate) : '–'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === 'Current' ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600'}`}>{c.status}</span>
                      {c.statusAuto && <div className="text-[11px] text-ink-400">by expiry date</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm({ ...BLANK, ...c, status: c.statusAuto ? '' : c.status })}>Edit</Button>
                        {canDelete && <Button size="sm" variant="ghost" icon={Trash2} className="hover:!bg-danger-50 hover:!text-danger-600" onClick={() => remove(c)}>Delete</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} size="lg" title={form?.id ? 'Edit certification' : 'Add certification'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="External faculty" required searchable options={faculties} value={form.facultyId} onChange={(e) => set('facultyId', e.target.value)} />
            <Input label="Certification name" maxLength={200} value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Input label="Certification ID" maxLength={80} value={form.certificationId} onChange={(e) => set('certificationId', e.target.value)} />
            <Input label="Provider" maxLength={120} value={form.provider} onChange={(e) => set('provider', e.target.value)} />
            <DatePicker label="Issue date" value={form.issueDate || ''} onChange={(e) => set('issueDate', e.target.value)} />
            <DatePicker label="Expiry date" value={form.expiryDate || ''} min={form.issueDate || undefined} onChange={(e) => set('expiryDate', e.target.value)} />
            <Select label="Status" sort={false} placeholder="By expiry date" options={STATUS} value={form.status} onChange={(e) => set('status', e.target.value)} hint="Empty: Current until the expiry date" />
            <Textarea label="Notes" className="sm:col-span-2" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        )}
      </Modal>
    </>
  );
}
