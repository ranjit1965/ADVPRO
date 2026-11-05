import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import * as api from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { uploadDue, uploadWindowStart } from '../utils/uploadReminder';

/** Month-end reminder for Admin / Manager to upload the Batch Master and Biometric files. */
export default function UploadReminder() {
  const inWindow = !!uploadWindowStart();
  const { data } = useAsync(
    () => (inWindow ? Promise.all([api.getBatchImportSettings().catch(() => null), api.getBiometricSettings().catch(() => null)]) : Promise.resolve(null)),
    [inWindow],
  );
  if (!data) return null;
  const [batch, bio] = data;
  const due = [batch && uploadDue(batch.lastImport?.at) && 'Batch Master', bio && uploadDue(bio.lastImport?.at) && 'Biometric'].filter(Boolean);
  if (!due.length) return null;
  return (
    <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Month-end upload due: <span className="font-semibold">{due.join(' and ')}</span>.
      </p>
      <Link to="/admin/data-upload" className="inline-flex items-center gap-1 font-medium text-amber-900 underline-offset-2 hover:underline">
        Open Data Upload <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
