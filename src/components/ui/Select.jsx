import { forwardRef, useId, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import FormField from './FormField';
import SearchableSelect from './SearchableSelect';
import { cn } from '../../utils/cn';
import { sortOptions, toOption } from '../../utils/options';

/**
 * options: array of strings or { value, label }. Shown A to Z unless sort={false}.
 * searchable: renders a type-to-search dropdown (first-letter match) with the same onChange(event) contract.
 */
const Select = forwardRef(function Select({ label, required, error, hint, options = [], placeholder = 'Select', className, id, aside, sort = true, searchable = false, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  const items = useMemo(() => (sort ? sortOptions(options) : options.map(toOption)), [options, sort]);

  if (searchable) {
    const { value, onChange, onKeyDown, disabled } = props;
    return (
      <SearchableSelect
        id={fieldId}
        label={label}
        required={required}
        error={error}
        hint={hint}
        className={className}
        aside={aside}
        options={placeholder && !required ? [{ value: '', label: placeholder }, ...items] : items}
        sort={false}
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder ?? 'Select'}
        onKeyDown={onKeyDown}
        aria-label={props['aria-label']}
        onChange={(v) => onChange?.({ target: { value: v } })}
      />
    );
  }

  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint} className={className} aside={aside}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          aria-required={required}
          className={cn('field-control appearance-none pr-9', !props.value && 'text-ink-400')}
          {...props}
        >
          {placeholder !== null && <option value="">{placeholder}</option>}
          {items.map((opt) => (
            <option key={opt.value} value={opt.value} className="text-ink-900">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      </div>
    </FormField>
  );
});

export default Select;
