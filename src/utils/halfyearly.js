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
