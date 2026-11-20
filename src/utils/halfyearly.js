// Halfyearly Program Report: dates of a quarter (H1 to H6) from its starting and ending month.

/** First day of the starting month and last day of the ending month, as dates. */
export const periodDates = (start, end) => {
  if (!start || !end) return ['', ''];
  const [ey, em] = end.split('-').map(Number);
  return [`${start}-01`, `${end}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`];
};

/** True when today falls between the starting and the ending month. */
export const isCurrent = (row, today = new Date()) => {
  const m = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return row.startMonth <= m && m <= row.endMonth;
};

/** Starting and ending date of a saved row: the dates HR picked (v52), else the whole months. */
export const rowDates = (row) => {
  const [from, to] = periodDates(row.startMonth, row.endMonth);
  return [row.startDate || from, row.endDate || to];
};

/** 'YYYY-MM-DD' picked as the starting date: the ending date 6 months later (1 Jan -> 30 Jun, 15 Jan -> 14 Jul). */
export const sixMonthsEnd = (start) => {
  const [y, m, d] = start.split('-').map(Number);
  const e = new Date(y, m - 1 + 6, d - 1);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
};
