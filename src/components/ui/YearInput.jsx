import { forwardRef, useId } from 'react';
import Input from './Input';

/**
 * Year field that takes both: pick a year from the list (saved YOP options plus years around now), or type any 4-digit year.
 * Same onChange(event) contract as Input; non-digits are dropped while typing.
 */
const YearInput = forwardRef(function YearInput({ options = [], onChange, placeholder = 'Select or type', ...props }, ref) {
  const listId = `${useId()}-years`;
  const now = new Date().getFullYear();
  // The saved YOP list plus a few years around this year.
  const years = [...new Set([...options.map(String), ...Array.from({ length: 8 }, (_, i) => String(now - 3 + i))])].sort();
  return (
    <>
      <Input
        ref={ref}
        list={listId}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange?.({ ...e, target: { ...e.target, value: e.target.value.replace(/\D/g, '').slice(0, 4) } })}
        {...props}
      />
      <datalist id={listId}>
        {years.map((y) => (
          <option key={y} value={y} />
        ))}
      </datalist>
    </>
  );
});

export default YearInput;
