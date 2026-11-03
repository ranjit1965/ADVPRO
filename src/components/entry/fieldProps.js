import { isRequired } from '../../utils/entryForm';

/** Builds value/onChange/error/required props for a details field of a tab. */
export const makeField = (tab, values, errors, set) => (name) => ({
  value: values[name] ?? '',
  onChange: (e) => set(name, e?.target ? e.target.value : e),
  error: errors[name],
  required: isRequired(tab, name),
  id: `${tab}-${name}`,
});

export const facultyOptions = (lookups) => lookups.faculties.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }));

export const courseOptions = (lookups) => lookups.courses.map((c) => ({ value: c.id, label: `${c.id} – ${c.name}`, alt: [c.name] }));
