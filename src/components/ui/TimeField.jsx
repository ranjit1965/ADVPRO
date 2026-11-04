import { useEffect, useId, useState } from 'react';
import FormField from './FormField';

const digitsOf = (s) => String(s || '').replace(/\D/g, '');
/** Typed digits shown as HH:MM. A first digit above 2 is an hour like 9, so it becomes 09. */
const mask = (raw) => {
  let d = digitsOf(raw);
  if (d.length && Number(d[0]) > 2) d = `0${d}`;
  d = d.slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
/** "HH:MM" when the text is a full, real 24-hour time, else "". */
const parse = (text) => {
  const d = digitsOf(text);
  if (d.length !== 4) return '';
  const h = Number(d.slice(0, 2)), m = Number(d.slice(2));
  return h <= 23 && m <= 59 ? `${d.slice(0, 2)}:${d.slice(2)}` : '';
};

/**
 * Time typed by hand in 24-hour (railway) time: 0930, 9:30 or 13:45. No picker, no AM / PM.
 * onChange gets "HH:MM" once a full valid time is typed, and "" while it is incomplete.
 */
export default function TimeField({ id, label, required, error, hint, className, value, onChange, disabled }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [text, setText] = useState(value || '');
  const [touched, setTouched] = useState(false);

  // Follow values set by the form (next entry's Time From, Clear, Edit).
  useEffect(() => {
    if ((value || '') !== parse(text)) setText(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const complete = digitsOf(text).length === 4;
  const ownError = text && (complete || touched) && !parse(text) ? 'Enter a 24-hour time, 00:00 to 23:59' : '';
  const shownError = ownError || error;

  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={shownError} hint={shownError ? undefined : hint} className={className}>
      <input
        id={fieldId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder="HH:MM"
        disabled={disabled}
        aria-invalid={!!shownError}
        aria-describedby={shownError ? `${fieldId}-error` : undefined}
        aria-required={required}
        className="field-control tabular-nums"
        value={text}
        onChange={(e) => {
          const next = mask(e.target.value);
          setText(next);
          setTouched(false);
          const v = parse(next);
          if (v !== (value || '')) onChange(v);
        }}
        onBlur={() => {
          setTouched(true);
          // 930 typed and left: read it as 09:30
          const d = digitsOf(text);
          if (d.length === 3) {
            const fixed = mask(`0${d}`);
            setText(fixed);
            const v = parse(fixed);
            if (v !== (value || '')) onChange(v);
          }
        }}
      />
    </FormField>
  );
}
