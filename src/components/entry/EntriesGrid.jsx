import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import DataTable from '../ui/DataTable';
import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';
import { ACTIVITY_LABEL } from '../../utils/constants';
import { formatDuration, formatTime } from '../../utils/format';
import { entrySummary } from '../../utils/entry';

/** Grid under the form: the selected faculty's entries for the activity date. Click a row to select it. */
export default function EntriesGrid({ rows, loading, selectedId, editingId, onSelect }) {
  const columns = [
    { key: 'timeFrom', header: 'Time From', render: (r) => <span className="tabular-nums">{formatTime(r.timeFrom)}</span> },
    { key: 'timeTo', header: 'Time To', render: (r) => <span className="tabular-nums">{formatTime(r.timeTo)}</span> },
    { key: 'minutes', header: 'Duration', render: (r) => formatDuration(r.minutes) },
    {
      key: 'activityType',
      header: 'Activity',
      render: (r) => (
        <span className="font-medium text-ink-900">
          {ACTIVITY_LABEL[r.activityType]}
          {r.id === editingId && <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800">Editing</span>}
        </span>
      ),
    },
    { key: 'facultyIn', header: 'Faculty in', render: (r) => <StatusBadge status={r.facultyIn} /> },
    { key: 'details', header: 'Details', render: (r) => <span className="line-clamp-1 max-w-sm">{entrySummary(r)}</span> },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      render: (r) => (
        <Link to={`/entries/${r.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-brand-700" aria-label={`Open entry ${r.timeFrom}`}>
          <ExternalLink className="size-4" />
        </Link>
      ),
    },
  ];
  return (
    <DataTable
      dense
      caption="Entries for the selected faculty and date"
      columns={columns}
      rows={rows}
      loading={loading}
      selectedKey={selectedId}
      onRowClick={(r) => onSelect(r.id === selectedId ? null : r.id)}
      empty={<EmptyState title="No entries for this date yet" message="Saved activities for the selected faculty and date appear here." />}
    />
  );
}
