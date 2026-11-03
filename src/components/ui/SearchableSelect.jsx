import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import FormField from './FormField';
import { cn } from '../../utils/cn';
import { sortOptions, startsWithFilter } from '../../utils/options';

/**
 * Type-to-filter dropdown (combobox). Used for Faculty Name and other long lists.
 * options: [{ value, label, alt? }] shown A to Z (sort={false} keeps the given order).
 * Typing filters to the values that START with the typed letters ("s" lists S names only).
 */
export default function SearchableSelect({ label, required, error, hint, options: rawOptions, value, onChange, placeholder = 'Select', className, aside, onKeyDown: extraKeyDown, id, sort = true, disabled, 'aria-label': ariaLabel }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const listId = `${fieldId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const options = useMemo(() => (sort ? sortOptions(rawOptions) : rawOptions), [rawOptions, sort]);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => startsWithFilter(options, query), [options, query]);

  useEffect(() => {
    const close = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => setActive(0), [query, open]);

  const choose = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    extraKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint} className={className} aside={aside}>
      <div ref={wrapRef} className="relative">
        <div className="relative">
          {open && <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />}
          <input
            ref={inputRef}
            id={fieldId}
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={!!error}
            aria-required={required}
            autoComplete="off"
            disabled={disabled}
            className={cn('field-control pr-9', open && 'pl-9')}
            placeholder={selected ? selected.label : placeholder}
            value={open ? query : selected?.label || ''}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          <ChevronDown className={cn('pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-400 transition-transform', open && 'rotate-180')} aria-hidden />
        </div>
        {open && (
          <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full min-w-[220px] overflow-auto rounded-lg border border-ink-200 bg-white py-1 shadow-pop">
            {filtered.length === 0 && <li className="px-3 py-2 text-ink-500">No matches</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px]', i === active ? 'bg-brand-50 text-brand-800' : 'text-ink-700')}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormField>
  );
}
