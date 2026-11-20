import { useState } from 'react';
import { Printer } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import { useAsync } from '../../hooks/useAsync';
import { cn } from '../../utils/cn';
import { CODE_TONE, Legend, MonthBar, SheetTable, monthTitle, thisMonth } from '../../components/attendance/AttendanceSheet';
import StaffOnly from './StaffOnly';

/** Attendance › Staff › Print: the saved sheet, the same look as the entry sheet, with a count of each code. */
export default function AttendancePrint() {
  return (
    <StaffOnly title="Attendance Print">
      <PrintPage />
    </StaffOnly>
  );
}

function PrintPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data, loading, error, reload } = useAsync(() => api.getStaffAttendance(month), [month]);
  const count = (code, mark) => Object.values(data?.marks?.[code] || {}).filter((v) => v === mark).length;
  const shown = (data?.codes || []).filter((c) => ['S', 'S(L)', '#', 'P', 'X', 'H'].includes(c.code));

  return (
    <>
      <div className="no-print">
        <PageHeader title="Attendance Print" breadcrumb={[{ label: 'Attendance' }, { label: 'Staff' }, { label: 'Print' }]} description="Choose the month and click Print. The sheet prints in landscape." />
      </div>
      <MonthBar month={month} setMonth={setMonth}>
        <Button className="ml-auto" icon={Printer} disabled={!data} onClick={() => window.print()}>Print</Button>
      </MonthBar>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <div className="report rounded-xl border border-ink-200 bg-white p-4 print-full">
          <h2 className="mb-1 text-[15px] font-bold tracking-wide text-ink-900">STAFF ATTENDANCE REPORT STATUS - {monthTitle(month)}</h2>
          <div className="mb-2"><Legend codes={data.codes} /></div>
          <SheetTable
            month={month}
            days={data.days}
            employees={data.employees}
            codes={data.codes}
            cell={(code, d) => {
              const v = data.marks[code]?.[String(d)] || '';
              return <span className={cn('block py-1 font-bold', CODE_TONE[v])}>{v}</span>;
            }}
            totals={{ head: shown.map((c) => c.code), row: (code) => shown.map((c) => count(code, c.code)) }}
          />
        </div>
      )}
    </>
  );
}
