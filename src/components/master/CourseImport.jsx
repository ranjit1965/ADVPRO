import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileUp, Plus, SkipForward, X } from 'lucide-react';
import * as api from '../../services/api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import FileSaveField from '../ui/FileSaveField';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';

const STATUS = {
  new: ['New course', 'bg-success-50 text-success-700'],
  newChapters: [null, 'bg-info-50 text-info-700'],
  exists: ['Already added', 'bg-ink-100 text-ink-600'],
};

/**
 * Course import from Excel (Master › Course): choose the file and Read it, check the courses found,
 * then Add or Skip each one (or Add all). Nothing is saved until Add.
 */
export default function CourseImport({ onAdded }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null); // preview from the server
  const [done, setDone] = useState({}); // id -> 'added' | 'skipped'
  const [busy, setBusy] = useState(''); // id being added, or 'all'
  const [expanded, setExpanded] = useState(null);

  const read = async (file) => {
    const r = await api.previewCourseImport(file);
    setResult(r);
    setDone({});
    setExpanded(null);
  };
  const pending = (result?.courses || []).filter((c) => !done[c.id] && c.status !== 'exists');
  const add = async (list, key) => {
    setBusy(key);
    try {
      const r = await api.addImportedCourses(list.map(({ id, name, chapters }) => ({ id, name, chapters })));
      setDone((d) => ({ ...d, ...Object.fromEntries(list.map((c) => [c.id, 'added'])) }));
      toast.success(`Added ${r.coursesAdded} course(s) and ${r.chaptersAdded} chapter(s).`);
      onAdded?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };
  const close = () => {
    setOpen(false);
    setResult(null);
    setDone({});
  };

  if (!open) {
    return (
      <Button variant="secondary" icon={FileUp} onClick={() => setOpen(true)}>
        Import from Excel
      </Button>
    );
  }

  return (
    <Card
      className="w-full"
      title="Import courses from Excel"
      description="Columns in any order: Course ID (or Course Code) and Course Name, and if you have them Chapter No and Chapter Name (one row per chapter). Nothing is saved until you press Add."
      actions={<Button size="sm" variant="ghost" icon={X} onClick={close}>Close</Button>}
    >
      <FileSaveField label="Course file (.xlsx, .xls or .csv)" onSave={read} saveLabel="Read file" disabled={!!busy} />
      {result && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 text-[13px] text-ink-600">
              <b className="text-ink-900">{result.file}</b>: {result.courses.length} course(s), {result.newCourses} new, {result.chapters} chapter(s).
              {result.skippedRows > 0 && ` ${result.skippedRows} row(s) without a Course ID were skipped.`}
            </p>
            <Button size="sm" icon={Plus} disabled={!pending.length || !!busy} loading={busy === 'all'} onClick={() => add(pending, 'all')}>
              Add all ({pending.length})
            </Button>
          </div>
          {result.errors?.length > 0 && <p className="mb-2 text-xs text-warning-700">{result.errors.join(' · ')}</p>}
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
            {result.courses.map((c) => {
              const state = done[c.id];
              const [label, tone] = STATUS[c.status];
              const isOpen = expanded === c.id;
              return (
                <li key={c.id} className={cn('px-3 py-2.5', state === 'skipped' && 'opacity-50')}>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="flex min-w-[220px] flex-1 items-start gap-2 text-left" onClick={() => setExpanded(isOpen ? null : c.id)} aria-expanded={isOpen} disabled={!c.chapters.length}>
                      {c.chapters.length ? (isOpen ? <ChevronDown className="mt-0.5 size-4 text-ink-400" /> : <ChevronRight className="mt-0.5 size-4 text-ink-400" />) : <span className="w-4" />}
                      <span>
                        <span className="text-[13px] font-semibold text-ink-900">{c.id}</span>
                        <span className="text-[13px] text-ink-700"> – {c.name}</span>
                        <span className="block text-xs text-ink-500">
                          {c.chapters.length} chapter(s)
                          {c.status !== 'new' && c.existingName && c.existingName !== c.name ? ` · saved as "${c.existingName}" (name kept)` : ''}
                        </span>
                      </span>
                    </button>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>{label || `${c.newChapters} new chapter(s)`}</span>
                    {state === 'added' ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success-700"><Check className="size-4" /> Added</span>
                    ) : state === 'skipped' ? (
                      <Button size="sm" variant="ghost" onClick={() => setDone((d) => ({ ...d, [c.id]: undefined }))}>Undo skip</Button>
                    ) : c.status === 'exists' ? (
                      <span className="text-xs text-ink-500">Nothing to add</span>
                    ) : (
                      <>
                        <Button size="sm" icon={Plus} loading={busy === c.id} disabled={!!busy} onClick={() => add([c], c.id)}>Add</Button>
                        <Button size="sm" variant="secondary" icon={SkipForward} disabled={!!busy} onClick={() => setDone((d) => ({ ...d, [c.id]: 'skipped' }))}>Skip</Button>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <ol className="mt-2 ml-6 grid gap-x-6 gap-y-0.5 text-xs text-ink-600 sm:grid-cols-2">
                      {c.chapters.map((ch) => <li key={ch.no}><b className="tabular-nums">{ch.no}</b> · {ch.name}</li>)}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
