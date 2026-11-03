import { forwardRef, useId } from 'react';
import FormField from './FormField';
import { cn } from '../../utils/cn';

const Input = forwardRef(function Input({ label, required, error, hint, className, inputClassName, id, aside, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint} className={className} aside={aside}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        aria-required={required}
        className={cn('field-control', inputClassName)}
        {...props}
      />
    </FormField>
  );
});

export default Input;
