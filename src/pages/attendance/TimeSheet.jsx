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
 * (morning) and the end time of the last entry of that day, from the daily entries. View and print.
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
    return [days.length, dur(days.reduce((t, d) => t + hm(d.end) - hm(d.start), 0))];
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
          <p className="mb-2 text-[11px] text-ink-600">Each day: first entry start (top) and last entry end (bottom), from the daily entries.</p>
          <SheetTable
            month={month}
            days={data.days}
            employees={employees}
            cell={(code, d) => {
              const t = byCode[code]?.[String(d)];
              return t ? (
                <span className="block px-0.5 py-0.5 leading-tight tabular-nums" title={`${t.entries} entr${t.entries === 1 ? 'y' : 'ies'}`}>
                  {t.start}
                  <br />
                  {t.end}
                </span>
              ) : null;
            }}
            totals={{ head: ['Days', 'Hours'], row: totals }}
          />
        </div>
      )}
    </>
  );
}
