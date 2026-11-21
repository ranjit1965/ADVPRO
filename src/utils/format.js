const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD (the format stored and sent to the API). */
export function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "08/10/2026" (DD/MM/YYYY), used everywhere in the application (v55). */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? parseISODate(iso.slice(0, 10)) : iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return '—';
  const d = new Date(isoDateTime);
  return `${formatDate(d)} ${formatClock(d)}`;
}

/** "22:54" (24-hour, v55) */
export function formatClock(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "9:30" / "14:30" -> "09:30" / "14:30" (24-hour, v55) */
export function formatTime(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  return `${pad(h)}:${pad(m)}`;
}

export function minutesBetween(from, to) {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}

/** 135 -> "2h 15m" */
export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function monthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function initials(name = '') {
  return name
    .replace(/[^A-Za-z ]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export const facultyLabel = (f) => (f ? `${f.name} (${f.code})` : '');
