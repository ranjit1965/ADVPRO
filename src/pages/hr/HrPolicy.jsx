import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileUp, Pencil, Save, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';

const PdfPages = lazy(() => import('../../components/hr/PdfPages'));
const PDF_UPLOAD_ROLES = ['HR', 'ADMIN', 'MANAGER'];

function PolicyText({ content }) {
  const blocks = [];
  content.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('# ')) blocks.push({ h: t.slice(2) });
    else if (t.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last?.ul) last.ul.push(t.slice(2));
      else blocks.push({ ul: [t.slice(2)] });
    } else blocks.push({ p: t });
  });
  return (
    <div className="space-y-3 text-sm text-ink-700">
      {blocks.map((b, i) =>
        b.h ? <h2 key={i} className="pt-2 text-base font-semibold text-ink-900">{b.h}</h2> : b.ul ? <ul key={i} className="list-disc space-y-1 pl-5">{b.ul.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b.p}</p>,
      )}
    </div>
  );
}

/**
 * HR › HR Policy. v63: HR / Admin / Super Admin upload the policy PDF (kept in the database); everyone sees it
 * here page by page, top to bottom, exactly as in the file. Without a PDF the typed policy text shows (Edit).
 */
export default function HrPolicy() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync(() => api.getHrPolicy(), []);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = api.HR_ROLES.includes(user.role);
  const canUpload = PDF_UPLOAD_ROLES.includes(user.role);
  const pdf = data?.pdf;
  const [bytes, setBytes] = useState(null);
  const [progress, setProgress] = useState('');
  const [pdfError, setPdfError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let live = true;
    setBytes(null);
    setPdfError('');
    if (!pdf) return undefined;
    api.downloadPolicyPdf(pdf, (n) => live && setProgress(`Loading the policy… ${Math.round((n / pdf.parts) * 100)}%`))
      .then((b) => live && setBytes(b))
      .catch((e) => live && setPdfError(e.message))
      .finally(() => live && setProgress(''));
    return () => {
      live = false;
    };
  }, [pdf]);
  const onPdfError = useCallback((m) => setPdfError(m), []);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveHrPolicy(draft);
      setDraft(null);
      toast.success('HR policy saved.');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) return toast.error('Choose a PDF file.');
    try {
      await api.uploadPolicyPdf(file, (n, total) => setProgress(`Uploading… ${Math.round((n / total) * 100)}%`));
      toast.success('Policy PDF uploaded. Everyone sees it in HR Policy.');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removePdf = async () => {
    if (!(await confirm({ title: 'Remove policy PDF', message: 'Remove the uploaded policy PDF? The typed policy text shows again.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    try {
      await api.removePolicyPdf();
      toast.success('Policy PDF removed.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = pdf.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <PageHeader
        title="HR Policy"
        breadcrumb={[{ label: 'HR' }, { label: 'HR Policy' }]}
        description={pdf ? `${pdf.name} · uploaded ${formatDateTime(pdf.uploadedAt)} by ${pdf.uploadedBy}` : data?.updatedAt ? `Last updated ${formatDateTime(data.updatedAt)} by ${data.updatedBy}` : 'Company HR policy'}
        actions={
          <div className="flex flex-wrap gap-2">
            {pdf && bytes && <Button variant="secondary" icon={Download} onClick={download}>Download PDF</Button>}
            {canUpload && (
              <>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                <Button variant="secondary" icon={FileUp} loading={!!progress && progress.startsWith('Uploading')} onClick={() => fileRef.current?.click()}>{pdf ? 'Upload new PDF' : 'Upload policy PDF'}</Button>
              </>
            )}
            {canUpload && pdf && <Button variant="ghost" icon={Trash2} onClick={removePdf}>Remove PDF</Button>}
            {canEdit && !pdf && !draft && data && <Button variant="secondary" icon={Pencil} onClick={() => setDraft(data.content)}>Edit text</Button>}
          </div>
        }
      />
      {progress && <p className="mb-3 text-[13px] text-brand-700" role="status">{progress}</p>}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : pdf ? (
        pdfError ? (
          <ErrorState message={pdfError} onRetry={reload} />
        ) : bytes ? (
          <Suspense fallback={<PageLoader />}>
            <PdfPages data={bytes} onError={onPdfError} />
          </Suspense>
        ) : (
          <PageLoader />
        )
      ) : (
        <Card>
          {draft !== null ? (
            <div className="space-y-3">
              <Textarea label="Policy text" hint='Start a line with "# " for a heading and "- " for a bullet.' rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" icon={X} onClick={() => setDraft(null)}>Cancel</Button>
                <Button icon={Save} loading={saving} onClick={save}>Save</Button>
              </div>
            </div>
          ) : (
            <PolicyText content={data.content} />
          )}
        </Card>
      )}
    </>
  );
}
