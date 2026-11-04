import { useMemo } from 'react';
import SearchableSelect from './SearchableSelect';
import { formatTime } from '../../utils/format';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/**
 * Time dropdown in 12-hour format (value stays HH:MM, 24h), every `step` minutes.
 * after: only times later than this HH:MM are listed (used by Time To).
 * from / to: the first and last time listed. Type to jump: "10" lists 10:00 AM..., "14" or "2 pm" 02:00 PM...
 */
export default function TimeSelect({ value, onChange, after, from = '00:00', to = '23:55', step = 5, placeholder = 'Select time', ...props }) {
  const options = useMemo(() => {
    const start = after ? toMin(after) + step - (toMin(after) % step) : toMin(from);
    const list = [];
    for (let m = start; m <= toMin(to); m += step) list.push(m);
    const cur = toMin(value);
    // keep an existing value (an older entry, or a time now before Time From) visible so the warning makes sense
    if (cur !== null && !list.includes(cur)) list.push(cur);
    return list.sort((a, b) => a - b).map((m) => {
      const v = toHHMM(m), label = formatTime(v), h12 = (Math.floor(m / 60) % 12) || 12;
      const ap = m >= 720 ? 'pm' : 'am';
      return { value: v, label, alt: [v, v.replace(':', ''), `${h12}:${pad(m % 60)} ${ap}`, `${h12} ${ap}`, `${h12}${ap}`] };
    });
  }, [after, from, to, step, value]);
  return <SearchableSelect {...props} options={options} sort={false} value={value || ''} placeholder={placeholder} onChange={onChange} />;
}
