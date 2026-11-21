import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import FileSaveField from '../../components/ui/FileSaveField';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import HolidayBar from '../../components/attendance/HolidayBar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../utils/format';
import { HR_ROLES } from '../../services/api';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Admin › Yearly Holidays (v59): import the year's holidays from an Excel / CSV file with two columns,
 * Date (DD/MM/YYYY) and Festival name. Each date is a holiday (H) for every employee in Daily Entry Submission,
 * its Print, the Time Sheet and the monthly report, month by month. HR / Admin add or revoke single dates here too.
 */
export default function YearlyHolidays() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [result, setResult] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.getYearHolidays(year), [year]);
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 1 + i).map((y) => ({ value: String(y), label: String(y) }));

  if (!HR_ROLES.includes(user.role)) {
    return (
      <>
        <PageHeader title="Yearly Holidays" />
        <Card><p className="text-sm text-ink-600">Only HR, Admin and the Super Admin manage the holidays.</p></Card>
      </>
    );
  }

  const upload = async (file) => {
    const r = await api.importHolidays(file);
    setResult(r);
    toast.success(`${r.read} holiday(s) read: ${r.added} added, ${r.updated} updated.`);
    if (r.years?.length && !r.years.includes(String(year))) setYear(Number(r.years[0]));
    else reload();
  };

  const remove = async (h) => {
    if (!(await confirm({ title: 'Revoke holiday', message: `Revoke H on ${formatDate(h.date)} (${h.name}) for all employees?`, confirmLabel: 'OK, revoke', tone: 'danger' }))) return;
    try {
      await api.removeHoliday(h.date);
      toast.success('Holiday revoked.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Yearly Holidays"
        breadcrumb={[{ label: 'Admin' }, { label: 'Yearly Holidays' }]}
        description="Import the holidays of the year from an Excel file. Every date becomes H (holiday) for all employees in Daily Entry Submission, its Print and the Time Sheet."
      />
      <Card className="mb-5" title="Import from Excel" description="The file needs two columns: 1. Date (DD/MM/YYYY) and 2. Festival name. Any number of rows; a date already saved gets the new name.">
        <FileSaveField label="Holidays file" accept=".xlsx,.xls,.csv" onSave={upload} saveLabel="Import" />
        {result && (
          <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] text-ink-700" role="status">
            Read {result.read} holiday(s): {result.added} added, {result.updated} updated{result.years?.length ? ` (year ${result.years.join(', ')})` : ''}.
            {result.skipped?.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-danger-700">
                {result.skipped.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>
      <HolidayBar month={`${year}-01`} holidays={[]} onChanged={reload} />
      <Card
        bodyClassName="p-0"
        title={`Holidays in ${year}`}
        actions={<Select aria-label="Year" className="w-28" sort={false} placeholder="" options={years} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} />}
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : !data?.length ? (
          <EmptyState icon={CalendarDays} title="No holidays" message={`No holidays saved for ${year}. Import the Excel file above.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-ink-50 text-[11px] font-semibold tracking-wide text-ink-600 uppercase">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Day</th>
                  <th className="px-4 py-2">Festival name</th>
                  <th className="px-4 py-2">Added by</th>
                  <th className="px-4 py-2"><span className="sr-only">Revoke</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h.date} className="border-t border-ink-100">
                    <td className="px-4 py-2 font-medium text-success-700 tabular-nums">{formatDate(h.date)}</td>
                    <td className="px-4 py-2">{WEEKDAY[new Date(`${h.date}T00:00:00`).getDay()]}</td>
                    <td className="px-4 py-2">{h.name}</td>
                    <td className="px-4 py-2 text-ink-500">{h.by || '–'}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-danger-600 hover:bg-danger-50" onClick={() => remove(h)} aria-label={`Revoke holiday ${h.date}`}>
                        <X className="size-3.5" aria-hidden /> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
