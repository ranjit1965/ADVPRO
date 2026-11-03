import { useState } from 'react';
import { MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Modal from '../ui/Modal';
import DataTable from '../ui/DataTable';
import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';
import { formatDate, toISODate } from '../../utils/format';
import { cn } from '../../utils/cn';

export const WORK_STATUS = ['Assigned', 'In Progress', 'Done'];
const PRIORITY_TONE = { High: 'text-danger-700 font-semibold', Medium: 'text-warning-700', Low: 'text-ink-500' };

/** Work assignment list. Managers get edit/delete; assignees update status and a progress note. */
export default function WorkTable({ rows, loading, showAssignee, onEdit, onDelete, onProgress }) {
  const [note, setNote] = useState(null);
  const today = toISODate();
  const columns = [
    ...(showAssignee ? [{ key: 'assigneeName', header: 'Assigned to', render: (w) => <span className="font-medium text-ink-900">{`${w.assigneeName} (${w.assigneeCode})`}</span> }] : []),
    { key: 'title', header: 'Work', render: (w) => (<div><p className="font-medium text-ink-900">{w.title}</p>{w.description && <p className="line-clamp-2 max-w-md text-xs text-ink-500">{w.description}</p>}</div>) },
    { key: 'priority', header: 'Priority', render: (w) => <span className={PRIORITY_TONE[w.priority]}>{w.priority}</span> },
    { key: 'dates', header: 'Start – Due', render: (w) => <span className={cn('whitespace-nowrap', w.status !== 'Done' && w.dueDate && w.dueDate < today && 'font-semibold text-danger-700')}>{`${w.startDate ? formatDate(w.startDate) : '-'} – ${w.dueDate ? formatDate(w.dueDate) : '-'}`}</span> },
    { key: 'status', header: 'Status', render: (w) => (onProgress ? <Select aria-label={`Status of ${w.title}`} placeholder={null} options={WORK_STATUS} value={w.status} onChange={(e) => onProgress(w, { status: e.target.value })} className="min-w-[130px]" /> : <StatusBadge status={w.status} />) },
    { key: 'progressNote', header: 'Progress note', render: (w) => <span className="line-clamp-2 max-w-xs text-xs text-ink-600">{w.progressNote}</span> },
    { key: 'assignedBy', header: 'By', render: (w) => <span className="text-xs text-ink-500">{w.assignedBy}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (w) => (
        <div className="flex justify-end gap-1">
          {onProgress && <Button size="sm" variant="ghost" icon={MessageSquareText} aria-label="Add progress note" onClick={() => setNote({ w, text: w.progressNote || '' })} />}
          {onEdit && <Button size="sm" variant="ghost" icon={Pencil} aria-label="Edit work" onClick={() => onEdit(w)} />}
          {onDelete && <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete work" onClick={() => onDelete(w)} />}
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable dense columns={columns} rows={rows} loading={loading} minWidth="min-w-[860px]" caption="Work assignments" empty={<EmptyState title="No work assigned" />} />
      <Modal open={!!note} onClose={() => setNote(null)} title="Progress note"
        footer={<><Button variant="secondary" onClick={() => setNote(null)}>Cancel</Button><Button onClick={async () => { await onProgress(note.w, { progressNote: note.text }); setNote(null); }}>Save</Button></>}>
        {note && <Textarea label={note.w.title} rows={4} maxLength={500} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />}
      </Modal>
    </>
  );
}
