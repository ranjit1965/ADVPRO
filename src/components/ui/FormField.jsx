import { cn } from '../../utils/cn';

/** Label + control + hint/error wrapper used by every input. */
export default function FormField({ label, htmlFor, required, error, hint, className, children, aside }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-700">
            {label}
            {required && (
              <span className="ml-0.5 text-danger-600" aria-hidden>
                *
              </span>
            )}
          </label>
          {aside}
        </div>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-danger-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}
