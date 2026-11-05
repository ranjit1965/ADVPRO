import { useEffect, useMemo, useState } from 'react';
import { Save, Fingerprint, UserX } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FileSaveField from '../../components/ui/FileSaveField';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { canAccess, MASTER_ROLES } from '../../utils/permissions';
import { formatDateTime, monthLabel, toISODate } from '../../utils/format';

/**
 * Master › Biometric. Admin / Manager choose the device export file (.xlsx, .xls or .csv, any column
 * order) and click Save: the backend keeps each person's first punch (Time In) and last punch
 * (Time Out) per day. The monthly report compares those times with the daily entries.
 */
export default function Biometric() {
  const { user } = useAuth();
  const canEdit = canAccess(user, MASTER_ROLES);
  const { lookups } = useLookups();
  const toast = useToast();
  const settings = useAsync(() => api.getBiometricSettings(), []);
  const [tolerance, setTolerance] = useState('15');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(toISODate().slice(0, 7));
  const [person, setPerson] = useState('');
  const records = useAsync(() => api.getBiometricRecords(month, person || undefined), [month, person, summary]);
  const people = useMemo(() => (lookups?.employees || []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), [lookups]);

  useEffect(() => {
    if (settings.data) {
      setTolerance(String(settings.data.toleranceMinutes ?? 15));
      setSummary(settings.data.lastImport || null);
    }
  }, [settings.data]);

  const saveTolerance = async () => {
    if (!/^\d+$/.test(tolerance) || Number(tolerance) > 240) {
      setErrors({ toleranceMinutes: 'Minutes, 0 to 240' });
      return;
    }
    setErrors({});
    setBusy('save');
    try {
      await api.saveBiometricSettings({ toleranceMinutes: Number(tolerance) });
      toast.success('Tolerance saved.');
    } catch (e) {
      setErrors({ toleranceMinutes: e.message });
    } finally {
      setBusy('');
    }
  };

  const upload = async (file) => {
    const s = await api.uploadBiometric(file);
    setSummary(s);
    toast.success(`Saved ${s.daysStored} day record(s) for ${s.people} people.`);
  };

  const link = async (deviceKey, code) => {
    setBusy(`map-${deviceKey}`);
    try {
      const s = await api.saveBiometricMap(deviceKey, code);
      setSummary(s);
      toast.success('Linked; that person\'s days are saved.');
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
            <FileSaveField label="Biometric file" accept=".xlsx,.xls,.csv,.txt,.tsv,.dat" onSave={upload} saveLabel="Save records" disabled={!!busy} />
          ) : (
            <p className="text-[13px] text-ink-600">Only Admin and Manager can upload the biometric file.</p>
          )}
          <p className="mt-3 text-[12px] text-ink-500">
            Columns can be in any order: an employee code or name column and a date with time, or In / Out time columns. People are matched by employee code, login ID or name; link anyone not matched below. Saving a month again replaces those days.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-4">
            <Input
              label="Tolerance (min)"
              className="w-40"
              inputMode="numeric"
              value={tolerance}
              error={errors.toleranceMinutes}
              disabled={!canEdit || settings.loading}
              hint="Difference counted as matched"
              onChange={(e) => setTolerance(e.target.value)}
            />
            {canEdit && (
              <Button icon={Save} variant="secondary" loading={busy === 'save'} onClick={saveTolerance} className="mb-6">
                Save tolerance
              </Button>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-5" title="Last upload" description={summary ? formatDateTime(summary.at) : 'Not uploaded yet'}>
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-500">File</dt>
              <dd className="truncate font-medium">{(summary.files || []).join(', ')}</dd>
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
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        className="mt-5"
        bodyClassName="p-0"
        title="Imported time in / out"
        description={monthLabel(month)}
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
