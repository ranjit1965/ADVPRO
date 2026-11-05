import { toISODate } from './format';

/**
 * Batch Master and Biometric files are uploaded once a month, on the last day or the day before.
 * The reminder shows from that day (last day − 1) until an upload is made on or after it, and keeps
 * showing in the first 5 days of the next month if the month-end upload was missed.
 */
export function uploadWindowStart(today = new Date()) {
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
  const y = today.getFullYear();
  const m = today.getMonth();
  const startThis = new Date(y, m, lastDay(y, m) - 1);
  if (today >= startThis) return toISODate(startThis);
  if (today.getDate() <= 5) return toISODate(new Date(y, m - 1, lastDay(y, m - 1) - 1));
  return null;
}

/** True when the upload for this month-end is still due. lastAt is the last import time (ISO). */
export function uploadDue(lastAt, today = new Date()) {
  const start = uploadWindowStart(today);
  if (!start) return false;
  return !lastAt || String(lastAt).slice(0, 10) < start;
}
