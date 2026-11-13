import { Link } from 'react-router-dom';
import { Award, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import Card from '../ui/Card';
import { useAsync } from '../../hooks/useAsync';
import { getHalfyearly } from '../../services/api';
import { formatDate } from '../../utils/format';
import { isCurrent, periodDates } from '../../utils/halfyearly';
import { cn } from '../../utils/cn';

/** One certification or course as its own box: green when finished, amber while not finished. */
function Item({ kind, name, courseId, done, doneText, pendingText, extra }) {
  return (
    <li className={cn('flex flex-col rounded-xl border p-4', done ? 'border-success-600/30 bg-success-50' : 'border-warning-600/30 bg-warning-50')}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{kind}</p>
      <p className="font-medium text-ink-900">{name}</p>
      {courseId && <p className="text-xs text-ink-500">Course {courseId}</p>}
      <p className={cn('mt-2 inline-flex items-center gap-1 text-[12px] font-semibold', done ? 'text-success-700' : 'text-warning-700')}>
        {done ? <CheckCircle2 className="size-4" aria-hidden /> : <Clock3 className="size-4" aria-hidden />}
        {done ? doneText : pendingText}
      </p>
      {extra && <p className="mt-1 text-xs text-ink-600">{extra}</p>}
    </li>
  );
}

/**
 * Top of the dashboard: the current quarter's target certifications and delivery ready courses HR assigned
 * to this person (Halfyearly Program Report), each in its own box. Hidden when nothing is assigned for now.
 */
export default function CertificationTargets({ employeeCode, canUpdate }) {
  const { data } = useAsync(() => getHalfyearly({ employeeCode }), [employeeCode]);
  const current = (data || []).filter((r) => isCurrent(r));
  if (!current.length) return null;
  const targets = current.flatMap((r) => r.targets);
  const deliveries = current.flatMap((r) => r.deliveries);
  const quarters = current.map((r) => {
    const [from, to] = periodDates(r.startMonth, r.endMonth);
    return `${r.quarter ? `${r.quarter} · ` : ''}${formatDate(from)} to ${formatDate(to)}`;
  });
  return (
    <Card
      className="mb-5 border-brand-200"
      title={
        <span className="flex items-center gap-2">
          <Award className="size-5 text-brand-600" aria-hidden /> Assigned certifications, current quarter
        </span>
      }
      description={quarters.join(' | ')}
      actions={
        <Link to="/hr-report/halfyearly" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          {canUpdate ? 'Update status' : 'Open report'} <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <p className="mb-3 flex flex-wrap gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-500">
        <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-ink-700">Target certifications: {targets.filter((t) => t.achieved === 'Yes').length} of {targets.length} finished</span>
        {deliveries.length > 0 && <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-ink-700">Delivery ready courses: {deliveries.filter((d) => d.ready === 'Yes').length} of {deliveries.length} finished</span>}
      </p>
      {/* One row of boxes, the same size as the stat cards below (4 per row on wide screens). */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {targets.map((t, i) => (
          <Item
            key={`t${i}`}
            kind="Target certification"
            name={t.name}
            courseId={t.courseId}
            done={t.achieved === 'Yes'}
            doneText={`Achieved${t.completionDate ? ` ${formatDate(t.completionDate)}` : ''}`}
            pendingText="Not finished"
            extra={t.certificationCode && `Code: ${t.certificationCode}`}
          />
        ))}
        {deliveries.map((d, i) => (
          <Item key={`d${i}`} kind="Delivery ready course" name={d.name} courseId={d.courseId} done={d.ready === 'Yes'} doneText="Delivery ready" pendingText="Not ready yet" />
        ))}
      </ul>
    </Card>
  );
}
