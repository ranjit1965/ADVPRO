import { useRef, useState } from 'react';
import { FileSpreadsheet, FolderOpen, Save, X } from 'lucide-react';
import Button from './Button';

const sizeText = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Two steps: "Choose file" picks the Excel / CSV file from this computer, then "Save" sends it to
 * the backend, which reads it and updates the database. onSave(file) must return a promise.
 */
export default function FileSaveField({ label = 'File', accept = '.xlsx,.xls,.csv', onSave, saveLabel = 'Save', disabled }) {
  const ref = useRef(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!file) {
      setError('Choose a file first');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(file);
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-700">{label}</p>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={`Choose ${label}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // the same file can be picked again
          if (f) (setFile(f), setError(''));
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={FolderOpen} variant="secondary" disabled={disabled || saving} onClick={() => ref.current?.click()}>
          Choose file
        </Button>
        <div className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${file ? 'border-brand-200 bg-brand-50/50 text-ink-800' : 'border-dashed border-ink-200 text-ink-400'}`}>
          <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
          {file ? (
            <>
              <span className="truncate font-medium" data-testid="chosen-file">{file.name}</span>
              <span className="shrink-0 text-ink-500">{sizeText(file.size)}</span>
              <button type="button" aria-label="Remove file" className="ml-auto rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" disabled={saving} onClick={() => setFile(null)}>
                <X className="size-4" />
              </button>
            </>
          ) : (
            <span>No file chosen (.xlsx, .xls or .csv)</span>
          )}
        </div>
        <Button icon={Save} loading={saving} disabled={disabled || !file} onClick={save}>
          {saveLabel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
