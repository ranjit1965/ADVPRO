import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import FormField from './FormField';
import { cn } from '../../utils/cn';

const digitsOf = (s) => String(s || '').replace(/\D/g, '');
/** "YYYY-MM-DD" -> "DD/MM/YYYY" */
export const isoToDmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** Typed digits shown as DD/MM/YYYY. */
const mask = (raw) => {
  const d = digitsOf(raw).slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};
/** "YYYY-MM-DD" when the text is a full, real date, else "". */
const parse = (text) => {
  const d = digitsOf(text);
  if (d.length !== 8) return '';
  const day = Number(d.slice(0, 2)), month = Number(d.slice(2, 4)), year = Number(d.slice(4));
  const dt = new Date(year, month - 1, day);
  if (year < 1900 || dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return '';
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
};

/**
 * Date box shown as DD/MM/YYYY on every computer (the browser's own date box follows the computer's
 * language, e.g. mm/dd/yyyy). Type the digits (20112026 or 20/11/2026) or pick from the calendar button.
 * The value stays YYYY-MM-DD (what the API stores); onChange gets an event-like { target: { value } }.
 */
export default function DatePicker({ id, label, required, error, hint, className, value, onChange, min, max, disabled, name, 'aria-label': ariaLabel }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const picker = useRef(null);
  const [text, setText] = useState(isoToDmy(value));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if ((value || '') !== parse(text)) setText(isoToDmy(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (iso) => {
    if (iso !== (value || '')) onChange?.({ target: { value: iso, name } });
  };
  const iso = parse(text);
  const range = iso && ((min && iso < min) || (max && iso > max)) ? `Choose a date${min ? ` from ${isoToDmy(min)}` : ''}${max ? ` up to ${isoToDmy(max)}` : ''}` : '';
  const ownError = text && (digitsOf(text).length === 8 || touched) && !iso ? 'Enter the date as DD/MM/YYYY' : range;
  const shownError = ownError || error;

  const openPicker = () => {
    const el = picker.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={shownError} hint={shownError ? undefined : hint} className={className}>
      <div className="relative">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="DD/MM/YYYY"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={!!shownError}
          aria-describedby={shownError ? `${fieldId}-error` : undefined}
          aria-required={required}
          className={cn('field-control pr-10 tabular-nums')}
          value={text}
          onChange={(e) => {
            const next = mask(e.target.value);
            setText(next);
            setTouched(false);
            const v = parse(next);
            if (v || !next) emit(v);
          }}
          onBlur={() => setTouched(true)}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Choose ${label || ariaLabel || 'date'} from the calendar`}
          onClick={openPicker}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-500 hover:text-brand-700"
        >
          <CalendarDays className="size-4" aria-hidden />
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
          value={value || ''}
          min={min}
          max={max}
          onChange={(e) => {
            setText(isoToDmy(e.target.value));
            emit(e.target.value);
          }}
        />
      </div>
    </FormField>
  );
}
