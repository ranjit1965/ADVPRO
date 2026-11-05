import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, UserX, ArrowRight } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import EmptyState from '../../components/ui/EmptyState';
import FileSaveField from '../../components/ui/FileSaveField';
import ErrorState from '../../components/ui/ErrorState';
import { useLookups } from '../../context/LookupsContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDateTime } from '../../utils/format';

const STATUS_ORDER = ['Running', 'Planned', 'Break', 'Completed'];

/**
 * Master › Batch Import. Admin / Manager choose the BatchMaster Excel file (.xlsx, .xls or .csv,
 * any column order) and click Save: the backend reads it and saves each batch in Master › Batch,
 * assigned to the employee whose code matches the faculty short name (FacultyAlloted). Short names
 * that match nobody are listed so they can be linked once; the link is remembered.
 */
export default function BatchImport() {
  const { lookups, reload: reloadLookups } = useLookups();
  const toast = useToast();
  const settings = useAsync(() => api.getBatchImportSettings(), []);
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const people = useMemo(() => (lookups?.employees || []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), [lookups]);

  useEffect(() => {
    if (settings.data) setSummary(settings.data.lastImport || null);
  }, [settings.data]);

  const done = (s, message) => {
    setSummary(s);
    reloadLookups?.();
    toast.success(message);
  };

  const upload = async (file) => {
    const s = await api.uploadBatches(file);
    done(s, `Saved ${s.batches} batches: ${s.created} new, ${s.updated} updated, ${s.assigned} assigned to an employee.`);
  };

  const link = async (shortName, code) => {
    setBusy(`map-${shortName}`);
    try {
      done(await api.saveBatchFacultyMap(shortName, code), `${shortName} linked and its batches assigned.`);
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
        description="Upload the BatchMaster Excel file and assign each batch to its faculty by short name."
        actions={
          <Link to="/master/batches" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
            Open Batch master <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Upload BatchMaster file" description="Choose the Excel file from this computer, then click Save. The batches are read and saved for each faculty.">
          <FileSaveField label="BatchMaster file" onSave={upload} saveLabel="Save batches" disabled={!!busy} />
          <p className="mt-4 text-[12px] text-ink-500">
            Columns can be in any order. Used: BatchNo, FacultyAlloted (short name), Course, BatchStartDate, BatchEndDate, ActualEndDate, BatchTimeIn, BatchTimeOut, ClassType, TotalHrs, CourseType and Status. Saving a new file updates the same batches; nothing is deleted. Faculty see their batches in the Class tab of the entry screen.
          </p>
        </Card>

        <Card className="lg:col-span-5" title="Last upload" description={summary ? `${summary.file} · ${formatDateTime(summary.at)}${summary.by ? ` · ${summary.by}` : ''}` : 'Not uploaded yet'}>
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
            <EmptyState icon={Database} title="No upload yet" message="Choose the BatchMaster file and click Save batches." />
          )}
        </Card>
      </div>

      {summary?.unmatched?.length > 0 && (
        <Card
          className="mt-5"
          title="Faculty short names not matched"
          description="No employee has this code. Link each short name to an employee once; the link is saved and those batches are assigned."
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
