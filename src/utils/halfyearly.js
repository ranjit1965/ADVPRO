// Halfyearly Program Report periods: 6 months (half year) or a quarter, from a starting month.
export const PERIOD_MONTHS = { '6 Months': 6, Quarter: 3 };
/** Ending month for a period that starts in `start` (YYYY-MM): 6 months from Apr is Sep, a quarter is Jun. */
export const endOfPeriod = (start, period) => {
  if (!start || !PERIOD_MONTHS[period]) return '';
  const [y, m] = start.split('-').map(Number);
  const d = new Date(y, m - 1 + PERIOD_MONTHS[period] - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** First day of the starting month and last day of the ending month, as dates. */
export const periodDates = (start, end) => {
  if (!start || !end) return ['', ''];
  const [ey, em] = end.split('-').map(Number);
  return [`${start}-01`, `${end}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`];
};
