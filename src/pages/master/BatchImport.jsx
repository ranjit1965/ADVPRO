import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, RefreshCw, Save, UserX, ArrowRight, CalendarClock, FileCheck2, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDateTime } from '../../utils/format';

const STATUS_ORDER = ['Running', 'Planned', 'Break', 'Completed'];

/**
 * Master › Batch Import. The BatchMaster table is read from BATCH_IMPORT_PATH in backend/.env (a folder
 * such as the shared network folder, or one .accdb / .mdb / .xlsx / .csv file); without it, from the path
 * saved here. The backend imports it by itself once a month, and "Import batches" imports it now. Each batch is saved in Master › Batch,
 * assigned to the employee whose code matches the faculty short name (FacultyAlloted). Short names
 * that match nobody are listed so they can be linked once; the link is remembered.
 */
export default function BatchImport() {
  const { lookups, reload: reloadLookups } = useLookups();
  const toast = useToast();
  const settings = useAsync(() => api.getBatchImportSettings(), []);
  const [form, setForm] = useState({ filePath: '', tableName: 'BatchMaster' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const people = useMemo(() => (lookups?.employees || []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), [lookups]);
  const fromEnv = !!settings.data?.fromEnv;
  const isAccess = !/\.(xlsx|csv|txt)$/i.test(form.filePath.trim());
  const data = settings.data;

  useEffect(() => {
    if (settings.data) {
      setForm({ filePath: settings.data.filePath || '', tableName: settings.data.tableName || 'BatchMaster' });
      setSummary(settings.data.lastImport || null);
    }
  }, [settings.data]);

  const save = async () => {
    const errs = {};
    if (!form.filePath.trim()) errs.filePath = 'Enter the folder or file path';
    if (isAccess && !/^[A-Za-z0-9_ ]{1,64}$/.test(form.tableName.trim())) errs.tableName = 'Letters, numbers, spaces and _ only';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy('save');
    try {
      await api.saveBatchImportSettings({ filePath: form.filePath.trim().replace(/"/g, ''), tableName: form.tableName.trim() || 'BatchMaster' });
      toast.success('Batch folder / file saved.');
      settings.reload();
    } catch (e) {
      setErrors({ filePath: e.message });
    } finally {
      setBusy('');
    }
  };

  const done = (s, message) => {
    setSummary(s);
    reloadLookups?.();
    toast.success(message);
  };

  const runImport = async () => {
    setBusy('import');
    try {
      const s = await api.importBatches();
      done(s, `Imported ${s.batches} batches: ${s.created} new, ${s.updated} updated, ${s.assigned} assigned to an employee.`);
      settings.reload();
    } catch (e) {
      toast.error(e.message, 'Import failed');
    } finally {
      setBusy('');
    }
  };

  const link = async (shortName, code) => {
    setBusy(`map-${shortName}`);
    try {
      done(await api.saveBatchFacultyMap(shortName, code), `${shortName} linked and batches imported again.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;

  return (
    <>
      <PageHeader
        title="Batch Import"
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Batch Import' }]}
        description="Read the batches from the Access BatchMaster table and assign each batch to its faculty by short name."
        actions={
          <Link to="/master/batches" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
            Open Batch master <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Batch file" description="Folder or file on the network / computer running the backend. For a folder, the newest file named BatchMaster is read.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Input
              label="Folder or file path"
              required
              className="sm:col-span-8"
              placeholder="e.g. \\192.168.0.129\Test\DAILY_REPORT_SOFTWARE_2026"
              value={form.filePath}
              error={errors.filePath}
              disabled={settings.loading || fromEnv}
              hint={fromEnv ? 'Set in backend/.env (BATCH_IMPORT_PATH). Change it there and restart the backend.' : undefined}
              onChange={(e) => (setForm({ ...form, filePath: e.target.value }), setErrors({}))}
            />
            <Input
              label="Table name"
              className="sm:col-span-4"
              value={form.tableName}
              error={errors.tableName}
              disabled={settings.loading || fromEnv || !isAccess}
              hint="Table inside the Access file"
              onChange={(e) => setForm({ ...form, tableName: e.target.value })}
            />
          </div>
          {data && (data.file || data.fileError) && (
            <p className={`mt-3 flex items-start gap-1.5 text-[12px] ${data.file ? 'text-ink-600' : 'text-danger-700'}`}>
              {data.file ? <FileCheck2 className="mt-px size-3.5 shrink-0 text-success-600" aria-hidden /> : <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />}
              <span className="break-all">{data.file ? `File found: ${data.file}` : data.fileError}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!fromEnv && (
              <Button icon={Save} variant="secondary" loading={busy === 'save'} onClick={save}>
                Save path
              </Button>
            )}
            <Button icon={RefreshCw} loading={busy === 'import'} disabled={!data?.filePath || !!busy} onClick={runImport}>
              Import batches now
            </Button>
          </div>
          {data && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-[12px] text-ink-600">
              <CalendarClock className="mt-px size-4 shrink-0 text-brand-600" aria-hidden />
              <div>
                {data.autoDay ? (
                  <p>
                    <span className="font-medium text-ink-800">Automatic import every month</span> on day {data.autoDay} after {String(data.autoHour).padStart(2, '0')}:00
                    {data.lastAutoMonth ? ` · done for ${data.lastAutoMonth}` : ' · not run yet'}
                  </p>
                ) : (
                  <p>Automatic monthly import is off (BATCH_IMPORT_DAY=0).</p>
                )}
                {data.lastAutoError && <p className="mt-1 text-danger-700">Last automatic import failed: {data.lastAutoError}</p>}
              </div>
            </div>
          )}
          <p className="mt-3 text-[12px] text-ink-500">
            Columns used: BatchNo, FacultyAlloted (short name), Course, BatchStartDate, BatchEndDate, ActualEndDate, BatchTimeIn, BatchTimeOut, ClassType, TotalHrs, CourseType and Status. Importing again updates the same batches; nothing is deleted. Reading an .accdb / .mdb file needs the Microsoft Access Database Engine on the backend computer.
          </p>
        </Card>

        <Card className="lg:col-span-5" title="Last import" description={summary ? `${summary.file} · ${formatDateTime(summary.at)}${summary.trigger ? ` · ${summary.trigger}` : ''}` : 'Not imported yet'}>
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-500">Rows read</dt>
              <dd className="font-medium">{summary.rowsRead}</dd>
              <dt className="text-ink-500">Batches saved</dt>
              <dd className="font-medium">
                {summary.batches} <span className="font-normal text-ink-500">({summary.created} new, {summary.updated} updated)</span>
              </dd>
              <dt className="text-ink-500">Assigned to an employee</dt>
              <dd className="font-medium">
                {summary.assigned} <span className="font-normal text-ink-500">({summary.faculty} faculty)</span>
              </dd>
              <dt className="text-ink-500">Status</dt>
              <dd className="font-medium">
                {STATUS_ORDER.filter((s) => summary.status?.[s]).map((s) => `${s} ${summary.status[s]}`).join(' · ') || '-'}
              </dd>
              <dt className="text-ink-500">Short names not matched</dt>
              <dd className={summary.unmatched.length ? 'font-medium text-warning-700' : 'font-medium'}>{summary.unmatched.length}</dd>
              {summary.skippedRows > 0 && (
                <>
                  <dt className="text-ink-500">Rows skipped (no Batch No)</dt>
                  <dd className="font-medium">{summary.skippedRows}</dd>
                </>
              )}
            </dl>
          ) : (
            <EmptyState icon={Database} title="No import yet" message="Click Import batches now, or wait for the monthly automatic import." />
          )}
        </Card>
      </div>

      {summary?.unmatched?.length > 0 && (
        <Card
          className="mt-5"
          title="Faculty short names not matched"
          description="No employee has this code. Link each short name to an employee once; the link is saved and the batches are imported again."
        >
          <div className="divide-y divide-ink-100">
            {summary.unmatched.map((u) => (
              <div key={u.shortName} className="flex flex-wrap items-end gap-3 py-2.5">
                <UserX className="mb-2.5 size-4 text-warning-600" aria-hidden />
                <div className="min-w-[200px] flex-1">
                  <p className="text-[13px] font-medium text-ink-900">
                    {u.shortName}
                    {u.name && <span className="font-normal text-ink-500"> · {u.name}</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {u.batches} batch(es) · latest {u.lastBatch}
                    {u.lastStart && `, started ${formatDate(u.lastStart)}`}
                  </p>
                </div>
                <Select
                  searchable
                  aria-label={`Employee for ${u.shortName}`}
                  className="w-full sm:w-72"
                  placeholder="Link to employee"
                  options={people}
                  value=""
                  disabled={!!busy}
                  onChange={(e) => e.target.value && link(u.shortName, e.target.value)}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary && (summary.renamed?.length > 0 || summary.missingCourses?.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {summary.renamed?.length > 0 && (
            <Card title="Batch numbers used twice" description="The file has two different batches with the same number, so the second one was saved with -2.">
              <ul className="space-y-1 text-[13px]">
                {summary.renamed.map((r) => (
                  <li key={r.to}>
                    <span className="font-medium text-ink-900">{r.to}</span> <span className="text-ink-500">· {[r.course, r.faculty].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {summary.missingCourses?.length > 0 && (
            <Card title="Course codes not in the course list" description="These batches are saved with the code as it is. Add the courses in Master › Course if they are still taught.">
              <p className="text-[13px] leading-6 text-ink-700">{summary.missingCourses.join(', ')}</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
