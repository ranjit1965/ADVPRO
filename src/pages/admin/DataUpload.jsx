import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, FileSpreadsheet, Fingerprint, Database } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import UploadButton from '../../components/ui/UploadButton';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { canAccess, MASTER_ROLES } from '../../utils/permissions';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';
import { uploadDue } from '../../utils/uploadReminder';

const ACCEPT = '.xlsx,.xls,.csv';

export const UPLOAD_TYPES = {
  batch: {
    label: 'Batch Master',
    icon: Database,
    to: '/master/batch-import',
    page: 'Master › Batch Import',
    help: 'The BatchMaster sheet, in any column order. Batches are saved for each employee by name and short name (FacultyAlloted). Uploading again updates the same batches.',
    load: () => api.getBatchImportSettings(),
    upload: (file) => api.uploadBatches(file),
    done: (s) => `Imported ${s.batches} batches: ${s.created} new, ${s.updated} updated, ${s.assigned} assigned to an employee.`,
    result: (s) => [
      ['File', s.file],
      ['Batches', s.batches],
      ['New / updated', `${s.created} / ${s.updated}`],
      ['Assigned to an employee', s.assigned],
      ['Short names not matched', s.unmatched?.length || 0],
    ],
  },
  biometric: {
    label: 'Biometric',
    icon: Fingerprint,
    to: '/master/biometric',
    page: 'Master › Biometric',
    help: 'The biometric device export, in any column order: an employee code or name column and a date with time, or In / Out time columns. Time In and Time Out are saved per employee per day and compared with the entries in the monthly report. Uploading a month again replaces those days.',
    load: () => api.getBiometricSettings(),
    upload: (file) => api.uploadBiometric(file),
    done: (s) => `Imported ${s.daysStored} day record(s) for ${s.people} people.`,
    result: (s) => [
      ['File', (s.files || []).join(', ')],
      ['Punch rows', s.punchRows],
      ['Day records saved', s.daysStored],
      ['Employees', s.people],
      ['People not matched', s.unmatched?.length || 0],
    ],
  },
};

/**
 * Admin › Data Upload. Admin / Manager pick Batch Master or Biometric and upload the Excel file
 * (.xlsx, .xls or .csv). The same uploads stay on Master › Batch Import and Master › Biometric.
 */
export default function DataUpload() {
  const { user } = useAuth();
  if (!canAccess(user, MASTER_ROLES)) {
    return (
      <>
        <PageHeader title="Data Upload" />
        <Card><p className="text-sm text-ink-600">Access restricted. Only Admin and Manager can upload data.</p></Card>
      </>
    );
  }
  return <DataUploadPage />;
}

function DataUploadPage() {
  const toast = useToast();
  const { reload: reloadLookups } = useLookups();
  const [type, setType] = useState('batch');
  const [busy, setBusy] = useState(false);
  const batch = useAsync(() => UPLOAD_TYPES.batch.load(), []);
  const bio = useAsync(() => UPLOAD_TYPES.biometric.load(), []);
  const last = { batch: batch.data?.lastImport, biometric: bio.data?.lastImport };
  const t = UPLOAD_TYPES[type];
  const due = Object.keys(UPLOAD_TYPES).filter((k) => (k === 'batch' ? batch.data : bio.data) && uploadDue(last[k]?.at));

  const upload = async (file) => {
    setBusy(true);
    try {
      const s = await t.upload(file);
      toast.success(t.done(s), `${t.label} uploaded`);
      (type === 'batch' ? batch : bio).reload();
      if (type === 'batch') reloadLookups?.();
    } catch (e) {
      toast.error(e.message, 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Data Upload" description="Upload the monthly Batch Master and Biometric Excel files." />
      {due.length > 0 && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Month-end upload due: <span className="font-semibold">{due.map((k) => UPLOAD_TYPES[k].label).join(' and ')}</span>. Upload the file on the last day of the month or the day before.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Upload file" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Upload type" value={type} onChange={(e) => setType(e.target.value || 'batch')} options={Object.entries(UPLOAD_TYPES).map(([value, x]) => ({ value, label: x.label }))} />
            <div className="flex items-end">
              <UploadButton accept={ACCEPT} loading={busy} onFile={upload} className="w-full sm:w-auto">
                {`Upload ${t.label} file`}
              </UploadButton>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-600">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden /> {t.help} Files: .xlsx, .xls or .csv.
          </p>
          <p className="mt-3 text-[13px] text-ink-500">
            Settings and people not matched are on{' '}
            <Link to={t.to} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              {t.page} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </Card>

        <Card title="Last uploads">
          <ul className="space-y-4">
            {Object.entries(UPLOAD_TYPES).map(([k, x]) => {
              const s = last[k];
              const Icon = x.icon;
              return (
                <li key={k} className="text-[13px]">
                  <p className="flex items-center gap-2 font-semibold text-ink-800">
                    <Icon className="size-4 text-ink-400" aria-hidden /> {x.label}
                    {due.includes(k) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Due</span>}
                  </p>
                  {s ? (
                    <>
                      <p className="mt-1 flex items-center gap-1.5 text-ink-500">
                        <CalendarClock className="size-3.5" aria-hidden /> {formatDateTime(s.at)}
                      </p>
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-600">
                        {x.result(s).map(([label, v]) => (
                          <div key={label} className="contents">
                            <dt className="text-ink-500">{label}</dt>
                            <dd className="truncate font-medium">{v ?? '—'}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : (
                    <p className="mt-1 text-ink-500">Not uploaded yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
