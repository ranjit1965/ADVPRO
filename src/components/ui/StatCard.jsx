import { cn } from '../../utils/cn';

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
  accent: 'bg-accent-50 text-accent-600',
};

export default function StatCard({ label, value, sub, icon: Icon, tone = 'brand', loading, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cn('card flex w-full items-start gap-4 p-4 text-left', onClick && 'transition-shadow hover:shadow-pop')}>
      {Icon && (
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', TONES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {loading ? <div className="mt-1.5 h-7 w-16 animate-pulse rounded bg-ink-100" /> : <p className="mt-0.5 text-2xl font-semibold tracking-tight text-ink-900 tabular-nums">{value}</p>}
        {sub && !loading && <p className="mt-0.5 truncate text-xs text-ink-500">{sub}</p>}
      </div>
    </Tag>
  );
}
