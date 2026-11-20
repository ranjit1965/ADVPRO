import { useRef } from 'react';
import Input from '../ui/Input';
import { cn } from '../../utils/cn';

export const monthTitle = (month) => (month ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase() : '');
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const weekday = (month, day) => new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00`).getDay();
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Colours of the codes on screen and in print. */
export const CODE_TONE = {
  S: 'text-ink-900',
  'S(L)': 'text-amber-700',
  '#': 'text-danger-700',
  P: 'text-brand-700',
  X: 'text-danger-700',
  W: 'text-ink-500',
  H: 'text-success-700',
  C: 'text-brand-700',
};

/** The mark shown: the one saved by hand, else the automatic one. */
export const effectiveMark = (marks, auto, code, day) => marks?.[code]?.[String(day)] || auto?.[code]?.[String(day)] || '';

/** Month picker shown above the attendance pages (not printed). */
export function MonthBar({ month, setMonth, children }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3">
      <Input label="Month" type="month" className="w-48" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      {children}
    </div>
  );
}

/** "S - Report Submitted / S(L) - ... " legend line. */
export function Legend({ codes }) {
  return (
    <p className="text-[11px] text-ink-600">
      {codes.map((c, i) => (
        <span key={c.code}>
          {i > 0 && ' / '}
          <span className={cn('font-bold', CODE_TONE[c.code])}>{c.code}</span> - {c.label}
          {c.key && c.key !== c.code && <span className="no-print text-ink-400"> (key {c.key})</span>}
        </span>
      ))}
    </p>
  );
}

/**
 * The monthly sheet: EMPLOYEE NAME and the days 1 … 31 as headings, a row per employee.
 * `editable`: each cell is a dropdown; typing a code's key (S, L, N, P, X, W, H) fills it and moves to the next
 * day, Backspace / Delete / Space clears it, the arrow keys move between cells.
 * `cell(code, day)` renders a read-only cell (Print and Time Sheet).
 * `auto`: the automatic marks, shown (lighter, italic) where nothing was saved by hand.
 */
export function SheetTable({ month, days, employees, codes, value, auto, onChange, editable = false, cell, totals }) {
  const refs = useRef({});
  const byKey = Object.fromEntries((codes || []).map((c) => [c.key.toUpperCase(), c.code]));
  const focus = (r, d) => refs.current[`${r}-${d}`]?.focus();

  const onKey = (e, r, d, code) => {
    const k = e.key;
    const move = { ArrowRight: [r, d + 1], ArrowLeft: [r, d - 1], ArrowDown: [r + 1, d], ArrowUp: [r - 1, d], Enter: [r + 1, d] }[k];
    if (move) {
      e.preventDefault();
      focus(...move);
      return;
    }
    if (k === 'Backspace' || k === 'Delete' || k === ' ') {
      e.preventDefault();
      onChange(code, d, '');
      return;
    }
    const mark = k === '#' ? '#' : byKey[k.toUpperCase()];
    if (mark && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onChange(code, d, mark);
      focus(r, d + 1 <= days ? d + 1 : d);
    }
  };

  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-ink-50">
            <th className="sticky left-0 z-10 border border-ink-300 bg-ink-50 px-2 py-1 text-left font-semibold whitespace-nowrap">EMPLOYEE NAME</th>
            {dayList.map((d) => (
              <th key={d} className={cn('min-w-[30px] border border-ink-300 px-0.5 py-1 text-center font-semibold', weekday(month, d) === 0 && 'bg-ink-200')}>
                <div>{d}</div>
                <div className="text-[9px] font-normal text-ink-500">{WD[weekday(month, d)]}</div>
              </th>
            ))}
            {totals && totals.head.map((h) => (
              <th key={h} className="border border-ink-300 px-1 py-1 text-center font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((p, r) => (
            <tr key={p.code} className="hover:bg-brand-50/40">
              <td className="sticky left-0 z-10 border border-ink-300 bg-white px-2 py-0.5 font-medium whitespace-nowrap">{p.name}</td>
              {dayList.map((d) => {
                const manual = value?.[p.code]?.[String(d)] || '';
                const v = manual || auto?.[p.code]?.[String(d)] || '';
                const isAuto = !manual && !!v;
                return (
                  <td key={d} className={cn('border border-ink-300 p-0 text-center', weekday(month, d) === 0 && 'bg-ink-100')}>
                    {editable ? (
                      <select
                        ref={(el) => (refs.current[`${r}-${d}`] = el)}
                        aria-label={`${p.name}, day ${d}`}
                        title={isAuto ? 'Filled automatically (holiday, biometric file or daily entries). Press a key to change it.' : undefined}
                        value={v}
                        onChange={(e) => onChange(p.code, d, e.target.value)}
                        onKeyDown={(e) => onKey(e, r, d, p.code)}
                        className={cn('h-7 w-full min-w-[34px] cursor-pointer appearance-none bg-transparent text-center [text-align-last:center] text-[11px] font-bold outline-none focus:bg-brand-100 focus:ring-2 focus:ring-brand-500', CODE_TONE[v], isAuto && 'font-medium italic opacity-70')}
                      >
                        <option value="" />
                        {codes.map((c) => (
                          <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                      </select>
                    ) : (
                      cell(p.code, d)
                    )}
                  </td>
                );
              })}
              {totals && totals.row(p.code).map((n, i) => (
                <td key={i} className="border border-ink-300 px-1 text-center font-semibold">{n}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
