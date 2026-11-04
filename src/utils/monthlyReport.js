// Builds the monthly activity report (dashboard, day by day, weeks, topics, calendar, log)
// from the month's entries. Every figure is "Time To minus Time From" of each entry.
import { entrySummary } from './entry';
import { parseISODate, toISODate } from './format';

/** Report series. Each activity type maps to one. Others has its own column, as in the reports. */
export const REPORT_GROUPS = [
  { key: 'class', label: 'Class', color: '#2b78d6' },
  { key: 'seminar', label: 'Seminar / Work Shop', color: '#e8663d' },
  { key: 'preparation', label: 'Course Preparation / Learning', color: '#e9a20a' },
  { key: 'marketing', label: 'Marketing Support', color: '#8a5cd0' },
  { key: 'support', label: 'Database, Software & Travel', color: '#1f9d77' },
  { key: 'others', label: 'Others', color: '#8a93a6' },
];
export const GROUP_LABEL = Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, g.label]));

export function groupOf(type) {
  if (type === 'class' || type === 'seminar' || type === 'marketing' || type === 'others') return type;
  if (type === 'learning' || type === 'selfLearning') return 'preparation';
  return 'support'; // database, travelling, software, systemFault
}

/** What the entry was about, used for "Where the time went". */
export function topicOf(e, courses = []) {
  const d = e.details || {};
  const course = (id) => {
    const c = courses.find((x) => x.id === id);
    return c ? `${c.id} – ${c.name}` : id;
  };
  switch (e.activityType) {
    case 'class':
      return d.courseId ? `${course(d.courseId)} classes` : 'Classes';
    case 'learning':
      return d.courseId ? `${course(d.courseId)} – ${d.materialType || 'Course preparation'}` : d.materialType || 'Course preparation';
    case 'selfLearning':
      return d.courseId ? `${course(d.courseId)} – ${d.learningType || 'Self learning'}` : d.learningType || 'Self learning';
    case 'seminar':
      return `${d.seminarType || 'Seminar'}${d.collegeName ? ` – ${d.collegeName}` : ''}`;
    case 'marketing':
      return `Marketing – ${d.marketingType || 'General'}`;
    case 'database':
      return 'Database creation / download';
    case 'travelling':
      return 'Travelling';
    case 'software':
    case 'systemFault':
      return 'Software & system support';
    case 'others':
      return d.heading ? `Others – ${d.heading}` : 'Others';
    default:
      return 'Other';
  }
}

const zero = () => Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, 0]));
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildMonthlyReport(rows, month, courses = []) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const today = toISODate();

  // Calendar days of the month.
  const days = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const date = new Date(y, m - 1, d);
    const iso = toISODate(date);
    days.push({ date: iso, day: d, dow: date.getDay(), dayName: DAY_SHORT[date.getDay()], label: `${DAY_SHORT[date.getDay()]} ${d}`, byGroup: zero(), minutes: 0, entries: [], first: '', last: '', future: iso > today });
  }
  // Weeks run Monday to Sunday, cut at the month ends.
  let week = 1;
  days.forEach((d, i) => {
    if (i > 0 && d.dow === 1) week += 1;
    d.week = week;
  });

  const byGroup = zero();
  const groupDays = Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, new Set()]));
  const topics = {};
  const sorted = [...rows].sort((a, b) => (a.activityDate + a.timeFrom).localeCompare(b.activityDate + b.timeFrom));
  sorted.forEach((e) => {
    const day = days.find((d) => d.date === e.activityDate);
    if (!day) return;
    const g = groupOf(e.activityType);
    day.byGroup[g] += e.minutes;
    day.minutes += e.minutes;
    day.entries.push(e);
    if (!day.first || e.timeFrom < day.first) day.first = e.timeFrom;
    if (!day.last || e.timeTo > day.last) day.last = e.timeTo;
    byGroup[g] += e.minutes;
    groupDays[g].add(e.activityDate);
    const t = topicOf(e, courses);
    topics[t] = topics[t] || { topic: t, entries: 0, minutes: 0, byGroup: zero(), notes: new Set() };
    topics[t].entries += 1;
    topics[t].minutes += e.minutes;
    topics[t].byGroup[g] += e.minutes;
    const s = entrySummary(e);
    if (s && topics[t].notes.size < 3) topics[t].notes.add(s);
  });

  const total = sorted.reduce((s, e) => s + e.minutes, 0);
  const worked = days.filter((d) => d.minutes > 0);
  const longest = worked.reduce((best, d) => (!best || d.minutes > best.minutes ? d : best), null);

  const weeks = [];
  days.forEach((d) => {
    let w = weeks[d.week - 1];
    if (!w) {
      w = { week: d.week, label: `Week ${d.week}`, from: d.day, to: d.day, days: 0, minutes: 0, byGroup: zero() };
      weeks.push(w);
    }
    w.to = d.day;
    if (d.minutes) w.days += 1;
    w.minutes += d.minutes;
    REPORT_GROUPS.forEach((g) => (w.byGroup[g.key] += d.byGroup[g.key]));
  });

  const sessions = sorted.filter((e) => e.activityType === 'class' || e.activityType === 'seminar');
  const kpi = {
    total,
    workingDays: worked.length,
    calendarDays: lastDay,
    averageDay: worked.length ? Math.round(total / worked.length) : 0,
    longest,
    classSeminar: byGroup.class + byGroup.seminar,
    preparation: byGroup.preparation,
    others: byGroup.others,
    classes: sorted.filter((e) => e.activityType === 'class').length,
    seminars: sorted.filter((e) => e.activityType === 'seminar').length,
    sessions: sessions.length,
    entries: sorted.length,
  };

  return {
    month,
    monthName: new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
    days,
    weeks,
    groups: REPORT_GROUPS.map((g) => ({ ...g, minutes: byGroup[g.key], days: groupDays[g.key].size, share: total ? byGroup[g.key] / total : 0 })),
    topics: Object.values(topics)
      .map((t) => ({ ...t, notes: [...t.notes].join('; '), share: total ? t.minutes / total : 0 }))
      .sort((a, b) => b.minutes - a.minutes),
    log: sorted,
    kpi,
  };
}

/** "235h 08m" */
export const hm = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
/** "7:05" */
export const hmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
export const pct = (x) => `${(x * 100).toFixed(1)}%`;
export const hours1 = (min) => +(min / 60).toFixed(1);
/** Signed difference in minutes as "+12m" / "-1h 05m"; '-' when unknown. */
export const signedHm = (min) => {
  if (min === null || min === undefined) return '-';
  if (min === 0) return '0m';
  const a = Math.abs(min);
  return `${min > 0 ? '+' : '-'}${a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m` : `${a}m`}`;
};
export const dateLabel = (iso) => parseISODate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
