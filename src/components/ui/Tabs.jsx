import { useRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * Accessible tab list. tabs: [{ key, label, icon?, badge? }]
 * Wraps onto several rows like the legacy two-row tab strip, so all nine
 * activity tabs stay visible without horizontal scrolling.
 */
export default function Tabs({ tabs, value, onChange, idPrefix = 'tab', disabledKeys = [] }) {
  const refs = useRef({});
  const onKeyDown = (e, idx) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const enabled = tabs.filter((t) => !disabledKeys.includes(t.key));
    const pos = enabled.findIndex((t) => t.key === tabs[idx].key);
    const next = enabled[(pos + dir + enabled.length) % enabled.length];
    onChange(next.key);
    refs.current[next.key]?.focus();
  };
  return (
    <div role="tablist" aria-label="Activity type" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
      {tabs.map((t, idx) => {
        const active = t.key === value;
        const disabled = disabledKeys.includes(t.key);
        return (
          <button
            key={t.key}
            ref={(el) => (refs.current[t.key] = el)}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.key}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-center text-[13px] leading-tight font-medium transition-colors disabled:opacity-40',
              active ? 'border-brand-600 bg-brand-600 text-white shadow-xs' : 'border-ink-200 bg-white text-accent-600 hover:border-ink-300 hover:bg-ink-50',
            )}
          >
            {t.icon && <t.icon className="size-4 shrink-0" aria-hidden />}
            <span>{t.label}</span>
            {t.badge ? <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-white/20' : 'bg-ink-100 text-ink-600')}>{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
