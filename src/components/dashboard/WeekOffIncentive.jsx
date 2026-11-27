import { useEffect, useState } from 'react';
import { BadgeIndianRupee, CalendarOff, Plus } from 'lucide-react';
import * as api from '../../services/api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../utils/format';

const INCENTIVE_TYPES = ['Class hours', 'Certification completed', 'Batch completion', 'Extra week off worked', 'Other'];
export const CLAIM_STATUS_TONE = {
  Pending: 'bg-warning-50 text-warning-700',
  Approved: 'bg-success-50 text-success-700',
  Rejected: 'bg-danger-50 text-danger-700',
  Paid: 'bg-brand-50 text-brand-700',
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Faculty dashboard (v61, screen only): Week off (taken this month from the Declare dropdown; the remaining
 * balance shows once the week off rule is added) and Incentive (claim form and the claims with their status:
 * Pending / Approved / Rejected / Paid). The week off balance and incentive calculations come in the next step.
 */
export default function WeekOffIncentive({ code, own }) {
  const [decl, setDecl] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [form, setForm] = useState({ month: thisMonth(), type: '', amount: '', details: '' });
  const month = thisMonth();

  useEffect(() => {
    let live = true;
    setDecl(null);
    api.getDeclarations(month, code).then((l) => live && setDecl(l)).catch(() => live && setDecl([]));
    return () => {
      live = false;
    };
  }, [code, month]);

  const weekOffs = (decl || []).filter((d) => d.kind === 'Week off');
  const absents = (decl || []).filter((d) => d.kind === 'Absent');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const stat = (label, value, note) => (
    <div className="rounded-lg border border-ink-200 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="text-xl font-bold text-ink-900 tabular-nums">{value}</p>
      {note && <p className="text-[11px] text-ink-500">{note}</p>}
    </div>
  );

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><CalendarOff className="size-5 text-brand-600" aria-hidden /> Week off</span>} description="This month. Declare a week off in the daily entry (Declare › Week off).">
        <div className="grid grid-cols-3 gap-3">
          {stat('Taken', decl ? weekOffs.length : '…', 'Week off declared')}
          {stat('Remaining', '–', 'Shown once the week off rule is set')}
          {stat('Absent', decl ? absents.length : '…', 'Declared absent')}
        </div>
        {weekOffs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
            {weekOffs.map((d) => <span key={d.date} className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-700">W · {formatDate(d.date)}</span>)}
          </div>
        )}
      </Card>

      <Card
        title={<span className="flex items-center gap-2"><BadgeIndianRupee className="size-5 text-brand-600" aria-hidden /> Incentive</span>}
        description="Claim an incentive and follow its status."
        actions={own && <Button size="sm" icon={Plus} onClick={() => setClaimOpen(true)}>Claim incentive</Button>}
      >
        <div className="mb-3 grid grid-cols-3 gap-3">
          {stat('Earned this month', '–', 'After the incentive rules')}
          {stat('Claimed', '0', 'Waiting for approval')}
          {stat('Approved', '0', 'This month')}
        </div>
        <div className="overflow-x-auto rounded-lg border border-ink-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-ink-50 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}><EmptyState title="No claims yet" message="Claims show here with their status: Pending, Approved, Rejected or Paid." /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        title="Claim incentive"
        description="The claim is sent to HR for approval."
        footer={
          <>
            <Button variant="secondary" onClick={() => setClaimOpen(false)}>Cancel</Button>
            <Button disabled title="Opens when the incentive rules are added">Submit claim</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Month" type="month" value={form.month} onChange={(e) => set('month', e.target.value)} />
          <Select label="Incentive type" sort={false} options={INCENTIVE_TYPES} value={form.type} onChange={(e) => set('type', e.target.value)} />
          <Input label="Amount (₹)" inputMode="numeric" placeholder="Worked out by the rules" value={form.amount} onChange={(e) => set('amount', e.target.value.replace(/\D/g, ''))} />
          <Textarea label="Details" className="sm:col-span-2" rows={3} maxLength={1000} value={form.details} onChange={(e) => set('details', e.target.value)} />
        </div>
        <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-[12px] text-warning-700">Screen preview: Submit opens once the incentive rules and approval steps are added.</p>
      </Modal>
    </div>
  );
}
