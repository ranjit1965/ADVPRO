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
 * Top of the dashboard: the target certifications HR / Manager assigned to this person
 * (Halfyearly Program Report), with the period dates and status. Hidden when none are assigned.
 */
export default function CertificationTargets({ employeeCode, own }) {
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
      description="Halfyearly Program Report: target certifications for the period"
      actions={
        <Link to="/hr-report/halfyearly" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          {own ? 'Update status' : 'Open report'} <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((r) => {
          const [from, to] = periodDates(r.startMonth, r.endMonth);
          return (
            <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="font-semibold text-ink-900">{r.targetCertification}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {r.period ? `${r.period} · ` : ''}
                {formatDate(from)} to {formatDate(to)}
                {r.courseId ? ` · Course ${r.courseId}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill ok={r.achieved === 'Yes'} yes={`Achieved ${r.completionDate ? formatDate(r.completionDate) : ''}`} no="Not achieved yet" />
                <Pill ok={r.deliveryReady === 'Yes'} yes="Delivery ready" no="Delivery not ready" />
              </div>
              {r.certificationCode && <p className="mt-2 text-xs text-ink-600">Code: {r.certificationCode}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
