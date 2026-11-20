import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAsync } from '../../hooks/useAsync';
import { MonthBar, SheetTable, monthTitle, thisMonth } from '../../components/attendance/AttendanceSheet';
import StaffOnly from './StaffOnly';

const hm = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const dur = (mins) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

/**
 * Attendance › Staff › Time Sheet: for each employee and day, the start time of the first daily entry
 * (morning) and the end time of the last entry of that day, from the daily entries, and next to it the biometric
 * punch Time In / Time Out (or H / C) from the uploaded file. View and print.
 */
export default function TimeSheet() {
  return (
    <StaffOnly title="Time Sheet">
      <TimeSheetPage />
    </StaffOnly>
  );
}

function TimeSheetPage() {
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.getTimeSheet(month), [month]);
  const employees = useMemo(() => (data?.employees || []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const byCode = useMemo(() => Object.fromEntries((data?.employees || []).map((p) => [p.code, p.days])), [data]);
  const totals = (code) => {
    const days = Object.values(byCode[code] || {});
    const worked = days.filter((d) => d.start && d.end);
    const punched = days.filter((d) => d.punchIn && d.punchOut);
    return [
      worked.length,
      dur(worked.reduce((t, d) => t + hm(d.end) - hm(d.start), 0)),
      dur(punched.reduce((t, d) => t + hm(d.punchOut) - hm(d.punchIn), 0)),
    ];
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Time Sheet"
          breadcrumb={[{ label: 'Attendance' }, { label: 'Staff' }, { label: 'Time Sheet' }]}
          description="From the daily entries: the start time of the first entry of the day and the end time of the last entry of that day."
        />
      </div>
      <MonthBar month={month} setMonth={setMonth}>
        <Input label="Employee" className="w-56" placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button className="ml-auto" icon={Printer} disabled={!employees.length} onClick={() => window.print()}>Print</Button>
      </MonthBar>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : !employees.length ? (
        <EmptyState title="No entries" message={`No daily entries for ${monthTitle(month).toLowerCase()}.`} />
      ) : (
        <div className="report rounded-xl border border-ink-200 bg-white p-4 print-full">
          <h2 className="mb-1 text-[15px] font-bold tracking-wide text-ink-900">STAFF TIME SHEET - {monthTitle(month)}</h2>
          <p className="mb-2 text-[11px] text-ink-600">
            Each day, side by side: <span className="font-semibold text-ink-900">Entry</span> = first entry start (top) and last entry end (bottom) from the daily entries;{' '}
            <span className="font-semibold text-brand-700">Punch</span> = Time In (top) and Time Out (bottom) from the biometric file.
          </p>
          <SheetTable
            month={month}
            days={data.days}
            employees={employees}
            cell={(code, d) => {
              const t = byCode[code]?.[String(d)];
              if (!t) return null;
              return (
                <span className="flex justify-center gap-1 px-0.5 py-0.5 leading-tight tabular-nums whitespace-nowrap">
                  <span title={`Entries: ${t.entries}`}>
                    {t.start || '–'}
                    <br />
                    {t.end || '–'}
                  </span>
                  <span className="border-l border-ink-200 pl-1 text-brand-700" title="Biometric punch">
                    {t.mark ? <b>{t.mark}</b> : <>{t.punchIn || '–'}<br />{t.punchOut || '–'}</>}
                  </span>
                </span>
              );
            }}
            totals={{ head: ['Days', 'Entry hrs', 'Punch hrs'], row: totals }}
          />
        </div>
      )}
    </>
  );
}
