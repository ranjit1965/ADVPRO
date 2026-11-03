// Shared helpers for every dropdown in the app.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Normalises strings / { value, label } to { value, label }. */
export const toOption = (o) => (typeof o === 'string' || typeof o === 'number' ? { value: String(o), label: String(o) } : o);

/** A to Z by label (numbers in natural order: Chapter 2 before Chapter 10). */
export const sortOptions = (options = []) => options.map(toOption).sort((a, b) => collator.compare(a.label, b.label));

/**
 * First-letter search: only values whose label (or one of its `alt` texts, e.g. a course name)
 * starts with what was typed. Typing "s" lists only names starting with S.
 */
export const startsWithFilter = (options, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => [o.label, ...(o.alt || [])].some((t) => String(t).toLowerCase().startsWith(q)));
};
