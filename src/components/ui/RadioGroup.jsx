import { useId } from 'react';
import { cn } from '../../utils/cn';

/** Segmented radio group (keyboard accessible native radios). */
export default function RadioGroup({ label, name, value, onChange, options, required, error, className, size = 'md' }) {
  const id = useId();
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)} aria-invalid={!!error}>
      {label && (
        <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-danger-600">*</span>}
        </legend>
      )}
      <div className={cn('inline-flex w-full flex-wrap gap-1 rounded-lg border bg-ink-50 p-1', error ? 'border-danger-500' : 'border-ink-200')}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400',
                size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-[13px]',
                checked ? 'bg-white text-brand-700 shadow-xs ring-1 ring-ink-200' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              <input type="radio" className="sr-only" name={name || id} value={opt.value} checked={checked} onChange={() => onChange(opt.value)} />
              {opt.icon && <opt.icon className="size-4" aria-hidden />}
              {opt.label}
            </label>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-danger-600" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
