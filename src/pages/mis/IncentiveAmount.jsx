import { useEffect, useMemo, useState } from 'react';
import { BadgeIndianRupee, Leaf, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Modal from '../../components/ui/Modal';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { personLabel } from '../../utils/format';

const ROLES = ['MIS', 'HR', 'ADMIN', 'MANAGER'];
const LAB_SUPPORT = /lab\s*_?support/i;
const isIncentivePerson = (p) => p.role === 'FACULTY' || LAB_SUPPORT.test(p.role || '') || LAB_SUPPORT.test(p.roleLabel || '');
const NUMBER_FIELDS = [
  ['students', 'No of students'],
  ['referrals', 'No of referrals'],
  ['nextCertifications', 'No of goto next certifications'],
  ['examBefore45', 'Exam completed before 45 days'],
];
const thisMonth = () => new Date().toISOString().slice(0, 7);
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const greenOpen = (f) => Number(f.students) > 0 && Number(f.students) === Number(f.examBefore45);
const blank = (month, green) => ({ month, facultyCode: '', students: '', referrals: '', nextCertifications: '', examBefore45: '', amount: '', greenBatch: '', _green: green });

/**
 * MIS › Incentive › Incentive Amount (v62): one row a month for each faculty / lab support person with No of
 * students, referrals, goto next certifications and exams completed before 45 days, the Amount, and Green Batch.
 * Green Batch opens only when No of students = Exam completed before 45 days (it starts at the fixed Green Batch
 * value); otherwise only the Amount can be changed.
 */
export default function IncentiveAmount() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const { data, loading, error, reload } = useAsync(() => api.getIncentives(month), [month]);
  const cfg = useAsync(() => api.getIncentiveSettings(), []);
  const [fixed, setFixed] = useState('');
  useEffect(() => cfg.data && setFixed(String(cfg.data.greenBatchValue ?? 0)), [cfg.data]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const people = useMemo(() => (lookups?.employees || []).filter((p) => p.active !== false && isIncentivePerson(p)).map((p) => ({ value: p.code, label: personLabel(p) })), [lookups]);
  const canSetFixed = ['MIS', 'ADMIN', 'MANAGER'].includes(user.role);

  if (!ROLES.includes(user.role)) {
    return (
      <>
        <PageHeader title="Incentive Amount" />
        <Card><p className="text-sm text-ink-600">Only MIS, HR, Admin and the Super Admin open this page.</p></Card>
      </>
    );
  }

  const set = (k, v) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      const open = greenOpen(next);
      if (!open) next.greenBatch = ''; // closed: Green Batch is cleared, only the Amount can be changed
      else if (!greenOpen(f) && next.greenBatch === '') next.greenBatch = String(cfg.data?.greenBatchValue ?? ''); // just opened: the fixed value
      return next;
    });
  const num = (v) => (v === '' || v == null ? 0 : Number(v));

  const save = async () => {
    const e = {};
    if (!form.facultyCode) e.facultyCode = 'Choose the faculty';
    if (num(form.examBefore45) > num(form.students)) e.examBefore45 = 'More than No of students';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { month: form.month, facultyCode: form.facultyCode, amount: num(form.amount), greenBatch: greenOpen(form) ? num(form.greenBatch) : 0 };
      NUMBER_FIELDS.forEach(([k]) => (body[k] = num(form[k])));
      await api.saveIncentive(form.id, body);
      toast.success(form.id ? 'Incentive updated.' : 'Incentive added.');
      setForm(null);
      if (body.month !== month) setMonth(body.month);
      else reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete incentive', message: `Delete the incentive row of ${r.facultyName}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.deleteIncentive(r.id);
      toast.success('Deleted.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const saveFixed = async () => {
    try {
      await api.saveIncentiveSettings(Number(fixed || 0));
      toast.success('Green Batch value saved.');
      cfg.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const open = (r) => {
    setErrors({});
    setForm(r ? { ...r, ...Object.fromEntries([...NUMBER_FIELDS.map(([k]) => k), 'amount', 'greenBatch'].map((k) => [k, String(r[k] ?? '')])) } : blank(month));
  };

  const rows = data || [];
  const total = rows.reduce((s, r) => s + (r.total || 0), 0);
  return (
    <>
      <PageHeader
        title="Incentive Amount"
        breadcrumb={[{ label: 'MIS' }, { label: 'Incentive' }, { label: 'Incentive Amount' }]}
        description="Incentive of each faculty and lab support person for the month. Green Batch opens only when No of students = Exam completed before 45 days."
        actions={<Button icon={Plus} onClick={() => open(null)}>Add incentive</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <Input label="Month" type="month" className="w-48" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <div className="flex items-end gap-2">
            <Input label="Green Batch fixed value (₹)" className="w-52" inputMode="numeric" disabled={!canSetFixed} value={fixed} onChange={(e) => setFixed(e.target.value.replace(/\D/g, ''))} hint="Filled in when Green Batch opens" />
            {canSetFixed && <Button variant="secondary" icon={Save} className="mb-5" disabled={String(cfg.data?.greenBatchValue ?? '') === fixed} onClick={saveFixed}>Save</Button>}
          </div>
          <p className="ml-auto pb-5 text-[13px] text-ink-600">{rows.length} row(s) · Total <b className="text-ink-900">{rupees(total)}</b></p>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !rows.length ? (
          <EmptyState icon={BadgeIndianRupee} title="No incentives this month" message="Use Add incentive to enter the first one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead className="bg-ink-50 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-3 py-2.5">Faculty name</th>
                  {NUMBER_FIELDS.map(([k, l]) => <th key={k} className="px-3 py-2.5 text-right">{l}</th>)}
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-right">Green Batch</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">Edit / Delete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100">
                    <td className="px-3 py-2 font-medium text-ink-900">{r.facultyName}<div className="text-xs font-normal text-ink-500">{r.facultyCode}</div></td>
                    {NUMBER_FIELDS.map(([k]) => <td key={k} className="px-3 py-2 text-right tabular-nums">{r[k]}</td>)}
                    <td className="px-3 py-2 text-right tabular-nums">{rupees(r.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.greenOpen ? <span className="font-medium text-success-700">{rupees(r.greenBatch)}</span> : <span className="text-ink-400">–</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupees(r.total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button>
                        {user.role !== 'HR' && <Button size="sm" variant="ghost" icon={Trash2} className="hover:!bg-danger-50 hover:!text-danger-600" onClick={() => remove(r)}>Delete</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} size="lg" title={form?.id ? 'Edit incentive' : 'Add incentive'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SearchableSelect label="Faculty name" required match="contains" options={people} placeholder="Search faculty / lab support" value={form.facultyCode} onChange={(v) => set('facultyCode', v)} error={errors.facultyCode} />
            <Input label="Month" type="month" value={form.month} onChange={(e) => e.target.value && set('month', e.target.value)} />
            {NUMBER_FIELDS.map(([k, l]) => (
              <Input key={k} label={l} inputMode="numeric" maxLength={6} placeholder="0" value={form[k]} error={errors[k]} onChange={(e) => set(k, e.target.value.replace(/\D/g, ''))} />
            ))}
            <Input label="Amount (₹)" inputMode="numeric" maxLength={8} placeholder="0" value={form.amount} onChange={(e) => set('amount', e.target.value.replace(/\D/g, ''))} hint="Can be changed at any time" />
            <div>
              <Input
                label={<span className="inline-flex items-center gap-1"><Leaf className="size-3.5 text-success-600" aria-hidden /> Green Batch (₹)</span>}
                inputMode="numeric"
                maxLength={8}
                disabled={!greenOpen(form)}
                placeholder={greenOpen(form) ? '0' : 'Closed'}
                value={form.greenBatch}
                onChange={(e) => set('greenBatch', e.target.value.replace(/\D/g, ''))}
                hint={greenOpen(form) ? 'Open: No of students = Exam completed before 45 days' : 'Opens only when No of students = Exam completed before 45 days'}
              />
            </div>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700 sm:col-span-2">Total: <b>{rupees(num(form.amount) + (greenOpen(form) ? num(form.greenBatch) : 0))}</b></p>
          </div>
        )}
      </Modal>
    </>
  );
}
