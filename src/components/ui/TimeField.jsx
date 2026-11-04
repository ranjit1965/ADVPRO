import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import FormField from './FormField';
import { cn } from '../../utils/cn';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const DAY_END = 23 * 60 + 59;

/**
 * The usual time box (type hh:mm AM/PM, or click the clock for hour / minute / AM-PM columns).
 * after: only times later than this HH:MM can be picked in the columns (used by Time To).
 * Value is HH:MM (24h).
 */
export default function TimeField({ id, label, required, error, hint, className, value, onChange, after, disabled }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const colsRef = useRef(null);
  const afterMin = after ? toMin(after) : null;
  const ok = (m) => m >= 0 && m <= DAY_END && (afterMin === null || m > afterMin);
  const firstOk = (start, end) => {
    for (let m = start; m <= end; m += 1) if (ok(m)) return m;
    return null;
  };

  const cur = toMin(value);
  const curOk = cur !== null && ok(cur);
  const first = firstOk(0, DAY_END);
  const shown = curOk ? cur : first; // what the columns highlight / build on
  const pm = shown !== null && shown >= 720;

  const cols = useMemo(() => {
    const base = pm ? 12 : 0;
    const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      .map((h12) => ({ h12, h24: (h12 % 12) + base }))
      .filter(({ h24 }) => firstOk(h24 * 60, h24 * 60 + 59) !== null);
    const h24 = shown === null ? null : Math.floor(shown / 60);
    const minutes = h24 === null ? [] : Array.from({ length: 60 }, (_, i) => i).filter((mm) => ok(h24 * 60 + mm));
    const periods = [
      { key: 'AM', start: 0, enabled: firstOk(0, 719) !== null },
      { key: 'PM', start: 720, enabled: firstOk(720, DAY_END) !== null },
    ];
    return { hours, minutes, periods, h24 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, pm, afterMin]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    // bring the chosen hour / minute into view, like the browser's own picker
    requestAnimationFrame(() => colsRef.current?.querySelectorAll('[aria-selected="true"]').forEach((el) => el.scrollIntoView({ block: 'nearest' })));
    return () => document.removeEventListener('mousedown', close);
  }, [open, shown]);

  const pick = (m) => m !== null && onChange(toHHMM(m));
  const pickHour = (h24) => {
    const mm = shown === null ? 0 : shown % 60;
    pick(ok(h24 * 60 + mm) ? h24 * 60 + mm : firstOk(h24 * 60, h24 * 60 + 59));
  };
  const pickPeriod = (p) => {
    if (shown === null) return pick(firstOk(p.start, p.start + 719));
    const moved = (shown % 720) + p.start;
    return pick(ok(moved) ? moved : firstOk(p.start, p.start + 719));
  };

  const cell = (selected, enabled = true) =>
    cn(
      'block w-full rounded-md px-3 py-1.5 text-center text-[14px] tabular-nums',
      selected ? 'bg-brand-600 font-semibold text-white' : enabled ? 'text-ink-800 hover:bg-brand-50' : 'cursor-not-allowed text-ink-300',
    );

  return (
    <FormField label={label} htmlFor={fieldId} required={required} error={error} hint={hint} className={className}>
      <div ref={wrapRef} className="relative">
        <input
          id={fieldId}
          type="time"
          step={60}
          min={after || undefined}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          aria-required={required}
          className="field-control time-field pr-10"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Pick ${typeof label === 'string' ? label : 'time'}`}
          onClick={() => setOpen((o) => !o)}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-500 hover:bg-ink-100 disabled:opacity-40"
        >
          <Clock className="size-4" aria-hidden />
        </button>
        {open && (
          <div ref={colsRef} role="dialog" aria-label={`${typeof label === 'string' ? label : 'Time'} picker`} className="absolute left-0 z-30 mt-1 flex gap-1 rounded-lg border border-ink-200 bg-white p-1.5 shadow-pop">
            <ul role="listbox" aria-label="Hour" className="max-h-60 w-14 overflow-auto">
              {cols.hours.map(({ h12, h24 }) => (
                <li key={h24} role="option" aria-selected={h24 === cols.h24}>
                  <button type="button" className={cell(h24 === cols.h24)} onClick={() => pickHour(h24)}>
                    {pad(h12)}
                  </button>
                </li>
              ))}
            </ul>
            <ul role="listbox" aria-label="Minute" className="max-h-60 w-14 overflow-auto">
              {cols.minutes.map((mm) => (
                <li key={mm} role="option" aria-selected={curOk && mm === shown % 60}>
                  <button
                    type="button"
                    className={cell(curOk && mm === shown % 60)}
                    onClick={() => {
                      pick(cols.h24 * 60 + mm);
                      setOpen(false);
                    }}
                  >
                    {pad(mm)}
                  </button>
                </li>
              ))}
            </ul>
            <ul role="listbox" aria-label="AM or PM" className="w-14">
              {cols.periods.map((p) => (
                <li key={p.key} role="option" aria-selected={p.key === (pm ? 'PM' : 'AM')} aria-disabled={!p.enabled}>
                  <button type="button" disabled={!p.enabled} className={cell(curOk && p.key === (pm ? 'PM' : 'AM'), p.enabled)} onClick={() => pickPeriod(p)}>
                    {p.key}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FormField>
  );
}
