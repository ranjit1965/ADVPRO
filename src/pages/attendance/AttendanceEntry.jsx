import { useEffect, useMemo, useState } from 'react';
import { Download, Save } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import ErrorState from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';
import { Legend, MonthBar, SheetTable, holidaySet, monthTitle, thisMonth } from '../../components/attendance/AttendanceSheet';
import { downloadAttendanceExcel } from '../../utils/attendanceExcel';
import StaffOnly from './StaffOnly';
import HolidayBar from '../../components/attendance/HolidayBar';

/**
 * Attendance › Staff › Daily Entry Submission (was Attendance Entry). HR, Admin and the Super Admin see the
 * month's sheet: a row per employee, the days 1 … 31 across. It fills itself (H from "Add H" and the biometric
 * file, X from the biometric letters C / E / A, W, S / S(L) from the daily entries, # on a past working day with
 * no entry). Each cell takes one key (S, L for S(L), N for #, P, X, W, H) or a pick from its dropdown; arrows
 * move, Backspace clears. Save stores only the changed cells. v59: no Undo button, Excel download, a Roles
 * filter, and the holidays in green.
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
  const [role, setRole] = useState('');
  const [exporting, setExporting] = useState(false);
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
  const employees = useMemo(
    () => (data?.employees || []).filter((p) => (!search || p.name.toLowerCase().includes(search.toLowerCase())) && (!role || p.role === role)),
    [data, search, role],
  );
  const holidayDays = useMemo(() => holidaySet(data?.holidays), [data]);
  const roleName = useMemo(() => Object.fromEntries((data?.roles || []).map((r) => [r.value, r.label])), [data]);

  const download = async () => {
    setExporting(true);
    try {
      await downloadAttendanceExcel({ month, days: data.days, employees, codes: data.codes, marks, auto: data.auto, holidays: holidayDays, roleLabel: (r) => roleName[r] || r || '' });
    } catch (e) {
      toast.error(`Could not make the Excel file: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

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
        description="Filled automatically (light italic): H from holidays, X from the biometric letters C / E / A, W, S from the daily entries and # for a working day with no entry. To change a day, click it and press a key (S, L, N, P, X, W, H, C) or pick from the dropdown; arrows move, Backspace clears. Then Save."
      />
      <HolidayBar month={month} holidays={data?.holidays} onChanged={reload} />
      <MonthBar month={month} setMonth={(m) => (changes.length && !window.confirm('Changes are not saved. Change the month anyway?') ? null : setMonth(m))}>
        <Input label="Employee" className="w-56" placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Roles" className="w-48" sort={false} placeholder="All roles" options={data?.roles || []} value={role} onChange={(e) => setRole(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" icon={Download} loading={exporting} disabled={!data || !employees.length} onClick={download}>Download Excel</Button>
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
            <SheetTable month={month} days={data.days} employees={employees} codes={data.codes} value={marks} auto={data.auto} onChange={setMark} editable holidayDays={holidayDays} />
          </>
        )}
      </Card>
    </>
  );
}
