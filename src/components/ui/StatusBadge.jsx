import { cn } from '../../utils/cn';
import { facultyInLabel } from '../../utils/constants';

const TONE_BY_STATUS = {
  Completed: 'bg-success-50 text-success-700 ring-success-600/20',
  Resolved: 'bg-success-50 text-success-700 ring-success-600/20',
  Assigned: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  Done: 'bg-success-50 text-success-700 ring-success-600/20',
  Approved: 'bg-success-50 text-success-700 ring-success-600/20',
  Rejected: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  Pending: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  'In Progress': 'bg-info-50 text-info-700 ring-info-600/20',
  Open: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  Center: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  Outstation: 'bg-accent-50 text-accent-600 ring-accent-600/20',
};

export default function StatusBadge({ status, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONE_BY_STATUS[status] || 'bg-ink-100 text-ink-700 ring-ink-300', className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {facultyInLabel(status)}
    </span>
  );
}
