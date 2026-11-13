import { Link } from 'react-router-dom';
import { Award, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import Card from '../ui/Card';
import { useAsync } from '../../hooks/useAsync';
import { getHalfyearly } from '../../services/api';
import { formatDate } from '../../utils/format';
import { periodDates } from '../../utils/halfyearly';

const Pill = ({ ok, yes, no }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ok ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
    {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
    {ok ? yes : no}
  </span>
);

/**
 * Top of the dashboard: the target and course delivery certifications HR assigned to this person
 * (Halfyearly Program Report), with the quarter, period dates and status. Hidden when none are assigned.
 */
export default function CertificationTargets({ employeeCode, canUpdate }) {
  const { data } = useAsync(() => getHalfyearly({ employeeCode }), [employeeCode]);
  if (!data?.length) return null;
  return (
    <Card
      className="mb-5 border-brand-200"
      title={
        <span className="flex items-center gap-2">
          <Award className="size-5 text-brand-600" aria-hidden /> Assigned certifications
        </span>
      }
      description="Halfyearly Program Report: target and course delivery certifications"
      actions={
        <Link to="/hr-report/halfyearly" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          {canUpdate ? 'Update status' : 'Open report'} <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.map((r) => {
          const [from, to] = periodDates(r.startMonth, r.endMonth);
          return (
            <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-xs font-semibold text-brand-700">
                {r.quarter ? `${r.quarter} · ` : ''}
                {r.period ? `${r.period} · ` : ''}
                {formatDate(from)} to {formatDate(to)}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Target certification</p>
                  <ul className="mt-1 space-y-2">
                    {r.targets.map((t, i) => (
                      <li key={i}>
                        <p className="font-medium text-ink-900">{t.name}</p>
                        <Pill ok={t.achieved === 'Yes'} yes={`Achieved ${t.completionDate ? formatDate(t.completionDate) : ''}`} no="Not achieved yet" />
                        {t.certificationCode && <p className="mt-1 text-xs text-ink-600">Code: {t.certificationCode}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Course delivery certification</p>
                  <ul className="mt-1 space-y-2">
                    {r.deliveries.length ? r.deliveries.map((d, i) => (
                      <li key={i}>
                        <p className="font-medium text-ink-900">{d.name}</p>
                        <Pill ok={d.ready === 'Yes'} yes="Delivery ready" no="Delivery not ready" />
                      </li>
                    )) : <li className="text-xs text-ink-400">None assigned</li>}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
