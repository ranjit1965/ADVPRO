import { cn } from '../../utils/cn';

/** items: [{ label, value, wide? }] */
export default function DescriptionList({ items, className }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.label} className={cn('min-w-0', it.wide && 'sm:col-span-2 lg:col-span-3')}>
          <dt className="text-xs font-medium tracking-wide text-ink-500 uppercase">{it.label}</dt>
          <dd className="mt-1 break-words whitespace-pre-line text-ink-900">{it.value === '' || it.value === null || it.value === undefined ? <span className="text-ink-400">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
