import { useEffect, useState } from 'react';
import { CornerDownRight, Pencil, Save, Trash2 } from 'lucide-react';
import * as api from '../../services/api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import { rowDates } from '../../utils/halfyearly';

const YES_NO = ['Yes', 'No'];
const CLEARED = ['Cleared', 'Not cleared'];
export const monthLabel = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '');

/** Table head shared by HR › Halfyearly Program Report and HR › Certification Status. */
export function ReportHead({ actions }) {
  return (
    <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
      <tr>
        <th className="px-3 py-2.5">Employee</th>
        <th className="px-3 py-2.5">Quarter</th>
        <th className="px-3 py-2.5">Target Certification</th>
        <th className="px-3 py-2.5">Completed?</th>
        <th className="px-3 py-2.5">Required</th>
        <th className="px-3 py-2.5">Date of Completion</th>
        <th className="px-3 py-2.5">Certification Code</th>
        <th className="px-3 py-2.5">Delivery Ready Course</th>
        <th className="px-3 py-2.5">Delivery Ready?</th>
        {actions && <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>}
      </tr>
    </thead>
  );
}

const statusOf = (row) => ({
  targets: row.targets.map((t) => ({ achieved: t.achieved || '', completionDate: t.completionDate || '', certificationCode: t.certificationCode || '', cleared: t.cleared || '' })),
  deliveries: row.deliveries.map((d) => ({ ready: d.ready || '' })),
});

/**
 * One employee's quarter: a line per certification (targets on the left, deliveries on the right), with the
 * employee, quarter and actions spanning the lines. `editStatus` (Certification Status page): HR records
 * Completed Yes / date / code and Delivery ready in place. Otherwise the status is read-only.
 * `onEdit` / `onDelete` add the Edit and Delete buttons (Delete: Super Admin only).
 */
export default function ReportRows({ row, editStatus = false, onSaved, onEdit, onDelete, highlight = false, draft = false }) {
  const isHr = editStatus;
  const toast = useToast();
  const [v, setV] = useState(() => statusOf(row));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(statusOf(row)), [row]);
  const dirty = JSON.stringify(v) !== JSON.stringify(statusOf(row));
  const n = Math.max(row.targets.length, row.deliveries.length, 1);
  const setT = (i, k, val) => setV((s) => ({ ...s, targets: s.targets.map((t, j) => (j === i ? { ...t, [k]: val } : t)) }));
  const setD = (i, val) => setV((s) => ({ ...s, deliveries: s.deliveries.map((d, j) => (j === i ? { ready: val } : d)) }));

  const save = async () => {
    const e = {};
    v.targets.forEach((t, i) => {
      if (t.achieved === 'Yes' && !t.completionDate) e[`date${i}`] = 'Required';
      if (t.achieved === 'Yes' && !t.certificationCode.trim()) e[`code${i}`] = 'Required';
    });
    setErr(e);
    if (Object.keys(e).length) return toast.error('Enter the date of completion and the certification code.');
    setSaving(true);
    try {
      await api.updateHalfyearlyStatus(row.id, {
        targets: v.targets.map((t) => (t.achieved === 'Yes' ? { ...t, certificationCode: t.certificationCode.trim() } : { achieved: t.achieved, completionDate: '', certificationCode: '', cleared: t.cleared })),
        deliveries: v.deliveries,
      });
      toast.success('Saved.');
      onSaved();
    } catch (ex) {
      toast.error(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const [from, to] = rowDates(row);
  const dash = <span className="text-ink-400">–</span>;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = row.targets[i];
        const tv = v.targets[i];
        const d = row.deliveries[i];
        const yes = tv?.achieved === 'Yes';
        return (
          <tr key={i} className={`${i === 0 ? 'border-t border-ink-200 align-top' : 'align-top'}${draft ? ' bg-amber-50/70' : highlight ? ' bg-brand-50/60' : ''}`}>
            {i === 0 && (
              <>
                <td rowSpan={n} className="px-3 py-2.5">
                  <div className="font-medium text-ink-900">{row.employeeName}</div>
                  <div className="text-xs text-ink-500">{row.employeeCode}</div>
                </td>
                <td rowSpan={n} className="whitespace-nowrap px-3 py-2.5">
                  {draft && <div className="mb-0.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Not saved yet</div>}
                  {row.quarter && <div className="font-semibold text-ink-900">{row.quarter}</div>}
                  {row.carriedForward && <div className="text-[11px] font-semibold text-accent-600">Carried forward</div>}
                  {row.startMonth && <div className="tabular-nums">{monthLabel(row.startMonth)} – {monthLabel(row.endMonth)}</div>}
                  {from && <div className="text-xs text-ink-500">{formatDate(from)} to {to ? formatDate(to) : '…'}</div>}
                </td>
              </>
            )}
            <td className="px-3 py-2">
              {t ? (
                <>
                  <div className="text-ink-900">{i + 1}. {t.name}</div>
                  {t.courseId && <div className="text-xs text-ink-500">Course {t.courseId}</div>}
                  {t.carriedForward && <div className="mt-0.5 inline-flex rounded-full bg-accent-50 px-1.5 py-0.5 text-[11px] font-semibold text-accent-600">Carried forward{t.carriedFromQuarter ? ` from ${t.carriedFromQuarter}` : ''}</div>}
                  {t.carriedTo && t.achieved !== 'Yes' && <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink-500"><CornerDownRight className="size-3" aria-hidden />Moved to next quarter</div>}
                </>
              ) : dash}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (
                <Select aria-label={`Certification ${i + 1} completed`} sort={false} className="w-24" options={YES_NO} placeholder="Select" value={tv.achieved} onChange={(e) => setT(i, 'achieved', e.target.value)} />
              ) : (t.achieved || <span className="text-ink-400">Pending</span>)}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (
                <Select aria-label={`Certification ${i + 1} required: cleared`} sort={false} className="w-32" options={CLEARED} placeholder="Select" value={tv.cleared} onChange={(e) => setT(i, 'cleared', e.target.value)} />
              ) : t.cleared ? (
                <span className={t.cleared === 'Cleared' ? 'font-medium text-success-700' : 'font-medium text-danger-700'}>{t.cleared}</span>
              ) : dash}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (yes ? <DatePicker aria-label={`Certification ${i + 1} date of completion`} className="w-40" max={new Date().toISOString().slice(0, 10)} value={tv.completionDate} onChange={(e) => setT(i, 'completionDate', e.target.value)} error={err[`date${i}`]} /> : dash) : t.completionDate ? formatDate(t.completionDate) : dash}
            </td>
            <td className="px-3 py-2">
              {!t ? dash : isHr ? (yes ? <Input aria-label={`Certification ${i + 1} code`} className="w-40" maxLength={80} value={tv.certificationCode} onChange={(e) => setT(i, 'certificationCode', e.target.value)} error={err[`code${i}`]} /> : dash) : t.certificationCode || dash}
            </td>
            <td className="px-3 py-2">
              {d ? (
                <>
                  <div className="text-ink-900">{i + 1}. {d.name}</div>
                  {d.courseId && <div className="text-xs text-ink-500">Course {d.courseId}</div>}
                </>
              ) : dash}
            </td>
            <td className="px-3 py-2">
              {!d ? dash : isHr ? (
                <Select aria-label={`Delivery ready course ${i + 1} ready`} sort={false} className="w-24" options={YES_NO} placeholder="Select" value={v.deliveries[i].ready} onChange={(e) => setD(i, e.target.value)} />
              ) : (d.ready || <span className="text-ink-400">Pending</span>)}
            </td>
            {(isHr || onEdit || onDelete) && i === 0 && (
              <td rowSpan={n} className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  {isHr && (
                    <Button size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
                      Save
                    </Button>
                  )}
                  {onEdit && <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit} aria-label="Edit assignment" title="Edit" />}
                  {onDelete && <Button size="sm" variant="danger-outline" icon={Trash2} onClick={onDelete} aria-label="Delete row" title="Delete" />}
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}
