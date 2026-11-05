import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, RefreshCw, Save, Fingerprint, UserX } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import UploadButton from '../../components/ui/UploadButton';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { canAccess, MASTER_ROLES } from '../../utils/permissions';
import { formatDateTime, monthLabel, toISODate } from '../../utils/format';

/**
 * Master › Biometric. Manager / Admin enter the folder where the biometric device saves its
 * export files (a folder the backend server can read). "Import now" reads every file there and
 * stores each person's first punch (Time In) and last punch (Time Out) per day. The monthly
 * report compares those times with the daily entries.
 */
export default function Biometric() {
  const { user } = useAuth();
  const canEdit = canAccess(user, MASTER_ROLES);
  const { lookups } = useLookups();
  const toast = useToast();
  const settings = useAsync(() => api.getBiometricSettings(), []);
  const [form, setForm] = useState({ folderPath: '', toleranceMinutes: 15 });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(toISODate().slice(0, 7));
  const [person, setPerson] = useState('');
  const records = useAsync(() => api.getBiometricRecords(month, person || undefined), [month, person, summary]);
  const people = useMemo(() => (lookups?.employees || []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), [lookups]);

  useEffect(() => {
    if (settings.data) {
      setForm({ folderPath: settings.data.folderPath || '', toleranceMinutes: settings.data.toleranceMinutes ?? 15 });
      setSummary(settings.data.lastImport || null);
    }
  }, [settings.data]);

  const save = async () => {
    const errs = {};
    if (!/^\d+$/.test(String(form.toleranceMinutes))) errs.toleranceMinutes = 'Minutes, numbers only';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy('save');
    try {
      await api.saveBiometricSettings({ folderPath: form.folderPath.trim(), toleranceMinutes: Number(form.toleranceMinutes) });
      toast.success('Biometric folder saved.');
      settings.reload();
    } catch (e) {
      setErrors({ folderPath: e.message });
    } finally {
      setBusy('');
    }
  };

  const runImport = async (file) => {
    setBusy(file ? 'upload' : 'import');
    try {
      const s = file ? await api.uploadBiometric(file) : await api.importBiometric();
      setSummary(s);
      toast.success(`Imported ${s.daysStored} day record(s) for ${s.people} people from ${s.files.length} file(s).`);
    } catch (e) {
      toast.error(e.message, 'Import failed');
    } finally {
      setBusy('');
    }
  };

  const link = async (deviceKey, code) => {
    setBusy(`map-${deviceKey}`);
    try {
      const s = await api.saveBiometricMap(deviceKey, code);
      setSummary(s);
      toast.success('Linked and re-imported.');
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
        description="Read Time In / Time Out from the biometric device files and compare them with the daily entries in the monthly report."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Device file folder" description="A folder on the server running the backend, where the device saves its CSV, TXT, DAT or XLSX exports.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Input
              label="Folder path"
              required
              className="sm:col-span-9"
              placeholder="e.g. D:\Biometric\Exports or /srv/biometric"
              value={form.folderPath}
              error={errors.folderPath}
              disabled={!canEdit || settings.loading}
              onChange={(e) => (setForm({ ...form, folderPath: e.target.value }), setErrors({}))}
            />
            <Input
              label="Tolerance (min)"
              className="sm:col-span-3"
              inputMode="numeric"
              value={form.toleranceMinutes}
              error={errors.toleranceMinutes}
              disabled={!canEdit || settings.loading}
              hint="Counted as matched"
              onChange={(e) => setForm({ ...form, toleranceMinutes: e.target.value })}
            />
          </div>
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={Save} variant="secondary" loading={busy === 'save'} onClick={save}>
                Save folder
              </Button>
              <Button icon={RefreshCw} loading={busy === 'import'} disabled={!settings.data?.folderPath || !!busy} onClick={() => runImport()}>
                Import now
              </Button>
              <UploadButton accept=".xlsx,.xls,.csv,.txt,.tsv,.dat" loading={busy === 'upload'} disabled={!!busy && busy !== 'upload'} onFile={runImport}>
                Upload file
              </UploadButton>
            </div>
          )}
          <p className="mt-3 text-[12px] text-ink-500">
            Use Upload file to pick the device export from this computer or the office share (needed when the backend runs on Vercel or another server outside the office). Each file needs an employee code or name column and a date with time, or In / Out time columns. People are matched by employee code, login ID or name; link anyone not matched below.
          </p>
        </Card>

        <Card className="lg:col-span-5" title="Last import" description={summary ? formatDateTime(summary.at) : 'Not imported yet'}>
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-500">Files read</dt>
              <dd className="font-medium">{summary.files.length}</dd>
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
              {summary.errors.length > 0 && (
                <dd className="col-span-2 rounded-md bg-danger-50 px-2 py-1.5 text-[12px] text-danger-700">{summary.errors.join(' · ')}</dd>
              )}
            </dl>
          ) : (
            <EmptyState icon={FolderOpen} title="No import yet" message="Save the folder, then click Import now." />
          )}
        </Card>
      </div>

      {summary?.unmatched?.length > 0 && (
        <Card className="mt-5" title="Device users not matched" description="Link each one to an employee. The link is saved and the files are imported again.">
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
