/** Options for a master field of type "lookup", from the shared lookups. */
export function lookupOptions(source, lookups) {
  if (!lookups) return [];
  switch (source) {
    case 'courses':
      return lookups.courses.map((c) => ({ value: c.id, label: `${c.id} – ${c.name}` }));
    case 'faculties':
      return lookups.faculties.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }));
    case 'employees':
      return (lookups.employees || []).map((e) => ({ value: e.code, label: `${e.name} (${e.code})` }));
    default:
      return lookups[source] || [];
  }
}

/** Text shown in tables for a stored lookup value. */
export function lookupLabel(source, value, lookups) {
  if (!value) return '';
  const opt = lookupOptions(source, lookups).find((o) => (typeof o === 'string' ? o === value : o.value === value));
  return typeof opt === 'object' ? opt.label : value;
}
