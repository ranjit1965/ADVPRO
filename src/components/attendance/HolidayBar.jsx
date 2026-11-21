import { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import * as api from '../../services/api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatDate } from '../../utils/format';

/**
 * "Add H": choose a date and it becomes H (Official Holiday) for every employee, in Daily Entry Submission,
 * its Print, the Time Sheet and the monthly report. v59: when someone already has daily entries (S) that day,
 * HR / Admin are warned with their names before it is added. The month's holidays are listed in green with a
 * close button to revoke one (HR, Admin, Super Admin).
 */
export default function HolidayBar({ month, holidays, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (!date) return setError('Choose the date');
    setError('');
    setBusy(true);
    try {
      try {
        await api.addHoliday(date, name);
      } catch (e) {
        if (e.status !== 409) throw e;
        const names = e.data?.detail?.names || [];
        const ok = await confirm({
          title: 'Daily entries on this date',
          message: `${names.length} employee(s) have daily entries (S) on ${formatDate(date)}: ${names.slice(0, 12).join(', ')}${names.length > 12 ? ' …' : ''}. Check them first. Make it H for everyone anyway?`,
          confirmLabel: 'Yes, make it H',
          tone: 'danger',
        });
        if (!ok) return;
        await api.addHoliday(date, name, true);
      }
      toast.success(`${formatDate(date)} is now H for all employees.`);
      setDate('');
      setName('');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h) => {
    if (!(await confirm({ title: 'Revoke holiday', message: `Revoke H on ${formatDate(h.date)}${h.name ? ` (${h.name})` : ''} for all employees?`, confirmLabel: 'OK, revoke', tone: 'danger' }))) return;
    try {
      await api.removeHoliday(h.date);
      toast.success('Holiday revoked.');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="no-print mb-4 rounded-xl border border-ink-200 bg-white p-3">
      <div className="flex flex-wrap items-start gap-3">
        <DatePicker label="Holiday date" className="w-44" value={date} min={`${month}-01`} onChange={(e) => setDate(e.target.value)} error={error} />
        <Input label="Name (optional)" className="w-56" maxLength={100} placeholder="e.g. Diwali" value={name} onChange={(e) => setName(e.target.value)} />
        <Button className="mt-6" icon={CalendarPlus} loading={busy} onClick={add}>Add H for all</Button>
      </div>
      {holidays?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <span className="py-1 text-ink-500">Holidays this month:</span>
          {holidays.map((h) => (
            <span key={h.date} className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 font-medium text-success-700">
              H · {formatDate(h.date)} {h.name && `· ${h.name}`}
              <button type="button" aria-label={`Revoke holiday ${h.date}`} title="Revoke this holiday" className="rounded-full p-0.5 hover:bg-success-100" onClick={() => remove(h)}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
