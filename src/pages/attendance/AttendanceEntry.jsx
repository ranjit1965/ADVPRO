import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ErrorState from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';
import { Legend, MonthBar, SheetTable, monthTitle, thisMonth } from '../../components/attendance/AttendanceSheet';
import StaffOnly from './StaffOnly';
import HolidayBar from '../../components/attendance/HolidayBar';

/**
 * Attendance › Staff › Daily Entry Submission (was Attendance Entry). HR, Admin and the Super Admin see the
 * month's sheet: a row per employee, the days 1 … 31 across. It fills itself (H from "Add H" and the biometric
 * file, C from the biometric file, S / S(L) from the daily entries, # when there is a Time In but no entry); Each cell takes one key (S, L for S(L), N for #, P, X, W, H) or a pick from its
 * dropdown; arrows move, Backspace clears. Save stores only the changed cells.
 */
export default function AttendanceEntry() {
  return (
    <StaffOnly title="Daily Entry Submission">
      <EntryPage />
    </StaffOnly>
  );
}

function EntryPage() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const { data, loading, error, reload } = useAsync(() => api.getStaffAttendance(month), [month]);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => setMarks(data?.marks || {}), [data]);

  const changes = useMemo(() => {
    const out = [];
    if (!data) return out;
    for (const p of data.employees) {
      for (let d = 1; d <= data.days; d += 1) {
        const now = marks[p.code]?.[String(d)] || '';
        const was = data.marks[p.code]?.[String(d)] || '';
        if (now !== was) out.push({ code: p.code, day: d, mark: now });
      }
    }
    return out;
  }, [marks, data]);

  const setMark = (code, day, mark) => setMarks((m) => ({ ...m, [code]: { ...(m[code] || {}), [String(day)]: mark } }));
  const employees = useMemo(() => (data?.employees || []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())), [data, search]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveStaffAttendance(month, changes);
      toast.success(`Attendance saved: ${changes.length} day(s) changed.`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Daily Entry Submission"
        breadcrumb={[{ label: 'Attendance' }, { label: 'Staff' }, { label: 'Daily Entry Submission' }]}
        description="Filled automatically from holidays, the biometric file (H / C) and the daily entries (light italic). To change a day, click it and press a key (S, L, N, P, X, W, H, C) or pick from the dropdown; arrows move, Backspace takes back your change. Then Save."
      />
      <HolidayBar month={month} holidays={data?.holidays} onChanged={reload} />
      <MonthBar month={month} setMonth={(m) => (changes.length && !window.confirm('Changes are not saved. Change the month anyway?') ? null : setMonth(m))}>
        <Input label="Employee" className="w-56" placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" icon={RotateCcw} disabled={!changes.length || saving} onClick={() => setMarks(data?.marks || {})}>Undo changes</Button>
          <Button icon={Save} loading={saving} disabled={!changes.length} onClick={save}>Save{changes.length ? ` (${changes.length})` : ''}</Button>
        </div>
      </MonthBar>
      <Card
        bodyClassName="p-3"
        title={`DAILY ENTRY SUBMISSION - ${monthTitle(month)}`}
        description={data?.updatedAt ? `Last saved ${formatDateTime(data.updatedAt)}` : 'Not saved yet for this month'}
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <>
            <div className="mb-2"><Legend codes={data.codes} /></div>
            <SheetTable month={month} days={data.days} employees={employees} codes={data.codes} value={marks} auto={data.auto} onChange={setMark} editable />
          </>
        )}
      </Card>
    </>
  );
}
