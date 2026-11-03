import { ClipboardList } from 'lucide-react';
import { cn } from '../../utils/cn';

export default function Logo({ compact, dark, size = 'md' }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('grid shrink-0 place-items-center rounded-lg bg-brand-600 text-white', size === 'lg' ? 'size-11' : 'size-9')}>
        <ClipboardList className={size === 'lg' ? 'size-6' : 'size-5'} aria-hidden />
      </span>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className={cn('truncate font-semibold', dark ? 'text-white' : 'text-ink-900', size === 'lg' ? 'text-lg' : 'text-[15px]')}>Daily Entry Report</p>
          <p className={cn('truncate text-[11px]', dark ? 'text-ink-400' : 'text-ink-500')}>Advantage Pro · Advpro</p>
        </div>
      )}
    </div>
  );
}
