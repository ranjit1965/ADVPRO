import { useEffect, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const GRADES = ['BA', 'A', 'AA', 'G', 'VG', 'E'];
const LEGEND = '(BA - Below Avg) (A - Avg) (AA - Above Avg) (G - Good) (VG - V.Good) (E - Excellent)';

const Row = ({ label, children }) => (
  <tr className="border border-danger-500/60">
    <th scope="row" className="border border-danger-500/60 px-3 py-2.5 text-left text-[13px] font-semibold text-brand-800">{label}</th>
    {children}
  </tr>
);

/** HR_Report › Your Info: PF / bank account, leave allotted, absent days and monthly ratings. */
export default function YourInfo() {
  const { user } = useAuth();
  const toast = useToast();
  const isHr = api.HR_ROLES.includes(user.role);
  const [userId, setUserId] = useState(user.userId);
  const [employees, setEmployees] = useState([]);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api.getEmployeeInfo(userId).then((data) => setState({ data, loading: false, error: null })).catch((e) => setState({ data: null, loading: false, error: e.message }));
  };
  useEffect(load, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isHr && user.role === 'MANAGER') api.getUsers().then(setEmployees).catch(() => {});
    else if (isHr) api.getLookups().then((l) => setEmployees(l.faculties.map((f) => ({ ...f, userId: null })))).catch(() => {});
  }, [isHr, user.role]);

  const d = state.data;
  const fy = d?.financialYear;
  const openEdit = () => {
    const current = d.ratings.find((r) => r.year === fy) || { year: fy };
    setForm({ pfAccNo: d.pfAccNo, bankAccNo: d.bankAccNo, elAllotted: String(d.elAllotted), clAllotted: String(d.clAllotted), absentDays: String(d.absentDays), rating: current });
  };
  const save = async () => {
    setSaving(true);
    try {
      const ratings = [...d.ratings.filter((r) => r.year !== fy), form.rating].sort((a, b) => a.year.localeCompare(b.year));
      await api.saveEmployeeInfo(d.user.userId, { pfAccNo: form.pfAccNo, bankAccNo: form.bankAccNo, elAllotted: Number(form.elAllotted) || 0, clAllotted: Number(form.clAllotted) || 0, absentDays: Number(form.absentDays) || 0, ratings });
      toast.success('Employee info saved.');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pickable = employees.filter((e) => e.userId);
  return (
    <>
      <PageHeader
        title="Your Info"
        breadcrumb={[{ label: 'HR' }, { label: 'Your Info' }]}
        description={d ? `${d.user.name} · ${d.user.designation} · Financial year ${fy}` : undefined}
        actions={isHr && d && <Button variant="secondary" icon={Pencil} onClick={openEdit}>Edit</Button>}
      />
      {isHr && pickable.length > 0 && (
        <Card className="mb-5">
          <Select searchable label="Employee" className="max-w-sm" placeholder="Select employee" options={pickable.map((e) => ({ value: e.userId, label: `${e.name} (${e.code})` }))} value={userId} onChange={(e) => setUserId(e.target.value)} />
        </Card>
      )}
      {state.loading ? (
        <PageLoader />
      ) : state.error ? (
        <Card><ErrorState message={state.error} onRetry={load} /></Card>
      ) : (
        <Card>
          <div className="space-y-8">
            <table className="border-collapse text-[13px]">
              <tbody>
                <Row label="PF Acc No"><td className="min-w-[220px] border border-danger-500/60 px-3 py-2.5 font-semibold text-brand-900">{d.pfAccNo || '-'}</td></Row>
                <Row label="BOB Acc No"><td className="border border-danger-500/60 px-3 py-2.5 font-semibold text-brand-900">{d.bankAccNo || '-'}</td></Row>
              </tbody>
            </table>

            <table className="border-collapse text-[13px]">
              <thead>
                <tr><th /><th className="w-20 pb-1 font-semibold">EL</th><th className="w-20 pb-1 font-semibold">CL</th></tr>
              </thead>
              <tbody>
                <Row label="No of Days Leave Allotted">
                  <td className="border border-danger-500/60 text-center font-bold text-success-700">{d.elAllotted}</td>
                  <td className="border border-danger-500/60 text-center font-bold text-success-700">{d.clAllotted}</td>
                </Row>
                <Row label="No of Days Absent"><td colSpan={2} className="border border-danger-500/60 text-center font-bold text-success-700">{d.absentDays}</td></Row>
              </tbody>
            </table>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-brand-700 text-danger-600">
                    <th className="border border-ink-300 px-2 py-1 text-left font-medium">Emp Name</th>
                    <th className="border border-ink-300 px-2 py-1 text-left font-medium">Year</th>
                    {MONTHS.map((m) => <th key={m} className="border border-ink-300 px-2 py-1 font-medium">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.ratings.length === 0 ? (
                    <tr><td colSpan={14} className="border border-ink-300 px-2 py-6 text-center text-ink-400">No ratings recorded yet</td></tr>
                  ) : (
                    d.ratings.map((r) => (
                      <tr key={r.year}>
                        <td className="border border-ink-300 px-2 py-1">{d.user.name}</td>
                        <td className="border border-ink-300 px-2 py-1">{r.year}</td>
                        {MONTHS.map((m) => <td key={m} className="border border-ink-300 px-2 py-1 text-center font-semibold">{r[m] || ''}</td>)}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] font-semibold text-danger-700">({LEGEND})</p>
          </div>
        </Card>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} size="lg" title={`Edit info: ${d?.user.name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button icon={Save} loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="PF Acc No" value={form.pfAccNo} onChange={(e) => setForm({ ...form, pfAccNo: e.target.value })} />
              <Input label="BOB Acc No" value={form.bankAccNo} onChange={(e) => setForm({ ...form, bankAccNo: e.target.value })} />
              <Input label="EL allotted this year" inputMode="numeric" value={form.elAllotted} onChange={(e) => setForm({ ...form, elAllotted: e.target.value.replace(/\D/g, '') })} />
              <Input label="CL allotted this year" inputMode="numeric" value={form.clAllotted} onChange={(e) => setForm({ ...form, clAllotted: e.target.value.replace(/\D/g, '') })} />
              <Input label="No of days absent" inputMode="numeric" value={form.absentDays} onChange={(e) => setForm({ ...form, absentDays: e.target.value.replace(/\D/g, '') })} />
            </div>
            <p className="text-[13px] font-medium text-ink-700">Monthly rating, {fy}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MONTHS.map((m) => (
                <Select key={m} label={m} placeholder="-" sort={false} options={GRADES} value={form.rating[m] || ''} onChange={(e) => setForm({ ...form, rating: { ...form.rating, [m]: e.target.value } })} />
              ))}
            </div>
            <p className="text-xs text-ink-500">{LEGEND}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
