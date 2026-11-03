import { forwardRef, useId } from 'react';
import FormField from './FormField';
import { cn } from '../../utils/cn';

const Textarea = forwardRef(function Textarea({ label, required, error, hint, className, id, maxLength, value = '', rows = 3, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  const counter = maxLength ? (
    <span className={cn('text-xs tabular-nums', value.length >= maxLength ? 'text-danger-600' : 'text-ink-400')}>
      {value.length}/{maxLength}
    </span>
  ) : null;
  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint} className={className} aside={counter}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        aria-required={required}
        className="field-control resize-y"
        {...props}
      />
    </FormField>
  );
});

export default Textarea;
