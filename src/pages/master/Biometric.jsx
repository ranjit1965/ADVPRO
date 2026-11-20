import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Fingerprint, UserX, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FileSaveField from '../../components/ui/FileSaveField';
import MonthYearPicker, { draftMonth, monthName } from '../../components/biometric/MonthYearPicker';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { canManage } from '../../utils/permissions';
import { formatDateTime, monthLabel, toISODate } from '../../utils/format';

/**
 * Master › Biometric. Admin / Super Admin choose the device export file (.xlsx, .xls or .csv): "Employee Name"
 * and the days 1 to 31, without the month. After choosing the file they pick the month and year, then Save:
 * the backend keeps each person's first punch (Time In) and last punch (Time Out) per day, and the
 * "No.of Records" / "No of Holidays" of the last rows for that month. The monthly report uses those times.
 */
export default function Biometric() {
  const { user } = useAuth();
  const canEdit = canManage(user);
  const { lookups } = useLookups();
  const toast = useToast();
  const settings = useAsync(() => api.getBiometricSettings(), []);
  const [busy, setBusy] = useState('');
  const [linked, setLinked] = useState([]); // linked in this visit: shown as "Linked to ..." until dismissed
  const [fileMonth, setFileMonth] = useState({ month: '', year: '' });
  const monthsInfo = useAsync(() => api.getBiometricMonths(), []);
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(toISODate().slice(0, 7));
  const [person, setPerson] = useState('');
  const records = useAsync(() => api.getBiometricRecords(month, person || undefined), [month, person, summary]);
  const people = useMemo(() => (lookups?.employees || []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), [lookups]);

  useEffect(() => {
    if (settings.data) setSummary(settings.data.lastImport || null);
  }, [settings.data]);

  const upload = async (file) => {
    const ym = draftMonth(fileMonth);
    const s = await api.uploadBiometric(file, ym);
    setSummary(s);
    setMonth(ym); // the list below shows the month just saved
    monthsInfo.reload();
    toast.success(`Saved ${s.daysStored} day record(s) for ${s.people} people for ${monthName(ym)}.`);
  };
  const info = (monthsInfo.data || []).find((m) => m.month === month);

  const link = async (deviceKey, code) => {
    setBusy(`map-${deviceKey}`);
    try {
      const s = await api.saveBiometricMap(deviceKey, code);
      const u = summary?.unmatched?.find((x) => x.deviceKey === deviceKey);
      setLinked((l) => [...l.filter((x) => x.key !== deviceKey), { key: deviceKey, name: u?.name || deviceKey, to: people.find((p) => p.value === code)?.label || code }]);
      setSummary(s);
      toast.success('Linked; that person\'s days are saved.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const dismiss = async (deviceKey) => {
    setBusy(`dismiss-${deviceKey}`);
    try {
      setSummary(await api.dismissBiometricUser(deviceKey));
      toast.success('Removed from the list.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const columns = [
    { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{r.date}</span> },
    { key: 'name', header: 'Employee', render: (r) => <span><span className="font-medium text-ink-900">{r.name}</span> <span className="text-xs text-ink-400">{r.code}</span></span> },
    { key: 'timeIn', header: 'Time In' },
    { key: 'timeOut', header: 'Time Out', render: (r) => r.timeOut || <span className="text-warning-700">Missing</span> },
    { key: 'punches', header: 'Punches', align: 'right' },
    { key: 'files', header: 'File', render: (r) => <span className="text-xs text-ink-500">{(r.files || []).join(', ')}</span> },
  ];

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;

  return (
    <>
      <PageHeader
        title="Biometric"
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Biometric' }]}
        description="Upload the biometric device file. Time In / Time Out are compared with the daily entries in the monthly report."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Upload biometric file" description="Choose the device export (Excel) from this computer, then click Save.">
          {canEdit ? (
            <FileSaveField
              label="Biometric file"
              accept=".xlsx,.xls,.csv,.txt,.tsv,.dat"
              onSave={upload}
              saveLabel="Save records"
              disabled={!!busy}
              check={() => (draftMonth(fileMonth) ? '' : 'Choose the month and year of this file')}
              extra={
                <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                  <p className="mb-2 text-[13px] font-medium text-ink-800">Which month is this file? The file has only the days 1 to 31.</p>
                  <MonthYearPicker draft={fileMonth} setDraft={setFileMonth} />
                </div>
              }
            />
          ) : (
            <p className="text-[13px] text-ink-600">Only Admin and Super Admin can upload the biometric file.</p>
          )}
          <p className="mt-3 text-[12px] text-ink-500">
            First row: Employee Name, then the days 1, 2, 3 … 31 with the time in and time out under each day. Last rows: No.of Records and No of Holidays (saved for the month). People are matched by name, employee code or login ID; link anyone not matched below. Saving a month again replaces those days.
          </p>
        </Card>

        <Card className="lg:col-span-5" title="Last upload" description={summary ? formatDateTime(summary.at) : 'Not uploaded yet'}>
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-500">File</dt>
              <dd className="truncate font-medium">{(summary.files || []).join(', ')}</dd>
              {summary.month && (
                <>
                  <dt className="text-ink-500">Month</dt>
                  <dd className="font-medium">{monthName(summary.month)}</dd>
                  <dt className="text-ink-500">No of records</dt>
                  <dd className="font-medium">{summary.records ?? '—'}</dd>
                  <dt className="text-ink-500">No of holidays</dt>
                  <dd className="font-medium">{summary.holidays ?? '—'}</dd>
                </>
              )}
              <dt className="text-ink-500">Punch rows</dt>
              <dd className="font-medium">{summary.punchRows}</dd>
              <dt className="text-ink-500">Day records stored</dt>
              <dd className="font-medium">{summary.daysStored}</dd>
              <dt className="text-ink-500">People matched</dt>
              <dd className="font-medium">{summary.people}</dd>
              <dt className="text-ink-500">Rows skipped</dt>
              <dd className="font-medium">{summary.skippedRows}</dd>
              <dt className="text-ink-500">Not matched</dt>
              <dd className={summary.unmatched.length ? 'font-medium text-warning-700' : 'font-medium'}>{summary.unmatched.length}</dd>
              {summary.errors?.length > 0 && (
                <dd className="col-span-2 rounded-md bg-danger-50 px-2 py-1.5 text-[12px] text-danger-700">{summary.errors.join(' · ')}</dd>
              )}
            </dl>
          ) : (
            <EmptyState icon={Fingerprint} title="No upload yet" message="Choose the biometric file and click Save records." />
          )}
        </Card>
      </div>

      {linked.length > 0 && (
        <Card className="mt-5" title="Linked to an employee">
          <div className="divide-y divide-ink-100">
            {linked.map((l) => (
              <div key={l.key} className="flex items-center gap-3 py-2">
                <CheckCircle2 className="size-4 text-success-600" aria-hidden />
                <p className="flex-1 text-[13px] text-ink-800"><span className="font-medium">{l.name}</span> linked to {l.to}</p>
                <Button size="sm" variant="secondary" icon={X} onClick={() => setLinked((x) => x.filter((y) => y.key !== l.key))}>Dismiss</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary?.unmatched?.length > 0 && (
        <Card className="mt-5" title="Device users not matched" description="Link each one to an employee. The link is saved and their days are moved to that employee.">
          <div className="divide-y divide-ink-100">
            {summary.unmatched.map((u) => (
              <div key={u.deviceKey} className="flex flex-wrap items-end gap-3 py-2.5">
                <UserX className="mb-2.5 size-4 text-warning-600" aria-hidden />
                <div className="min-w-[200px] flex-1">
                  <p className="text-[13px] font-medium text-ink-900">{u.name || '(no name)'}</p>
                  <p className="text-xs text-ink-500">
                    Device ID {u.deviceId || '-'} · {u.days} day(s)
                  </p>
                </div>
                {canEdit && (
                  <Select
                    searchable
                    aria-label={`Employee for ${u.deviceKey}`}
                    className="w-full sm:w-72"
                    placeholder="Link to employee"
                    options={people}
                    value=""
                    disabled={busy.startsWith('map-')}
                    onChange={(e) => e.target.value && link(u.deviceKey, e.target.value)}
                  />
                )}
                {canEdit && (
                  <Button variant="secondary" icon={X} loading={busy === `dismiss-${u.deviceKey}`} disabled={!!busy} onClick={() => dismiss(u.deviceKey)} title="Not an employee: remove from this list">
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        className="mt-5"
        bodyClassName="p-0"
        title="Imported time in / out"
        description={`${monthLabel(month)}${info ? ` · No of records ${info.records ?? '—'} · No of holidays ${info.holidays ?? '—'}` : ''}`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <Input aria-label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Select searchable aria-label="Employee" className="w-64" placeholder="Everyone" options={people} value={person} onChange={(e) => setPerson(e.target.value)} />
          </div>
        }
      >
        {records.error ? (
          <ErrorState message={records.error} onRetry={records.reload} />
        ) : (
          <DataTable
            loading={records.loading}
            rows={(records.data || []).map((r) => ({ ...r, id: `${r.code}|${r.date}` }))}
            columns={columns}
            empty={<EmptyState icon={Fingerprint} title="No biometric records" message="Nothing imported for this month yet." />}
          />
        )}
      </Card>
    </>
  );
}
