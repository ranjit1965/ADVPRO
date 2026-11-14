import Input from '../ui/Input';

/**
 * Course form in the CourseMaster column order: CourseId, CourseName, InstalmentAmt, LumpsumAmt,
 * Status, TotalHrs, InsAmt, LumpAmt, CourseStatus. The first three are required.
 * Used by Master › Course and by "Add course" on the Learning tab.
 */
export const COURSE_FIELDS = [
  { key: 'id', label: 'Course ID', required: true, placeholder: 'e.g. ADCH&N', wide: false },
  { key: 'name', label: 'Course Name', required: true, placeholder: 'e.g. ADVANCED DIPLOMA IN COMPUTER HARDWARE & NETWORKING', wide: true },
  { key: 'instalmentAmt', label: 'Instalment Amt', required: true, number: true },
  { key: 'lumpsumAmt', label: 'Lumpsum Amt', number: true },
  { key: 'status', label: 'Status' },
  { key: 'totalHrs', label: 'Total Hrs', number: true },
  { key: 'insAmt', label: 'Ins Amt', number: true },
  { key: 'lumpAmt', label: 'Lump Amt', number: true },
  { key: 'courseStatus', label: 'Course Status' },
];

export const EMPTY_COURSE = Object.fromEntries(COURSE_FIELDS.map((f) => [f.key, '']));

/** Course from the server -> form values (numbers become text, missing ones blank). */
export const courseToForm = (c) => Object.fromEntries(COURSE_FIELDS.map((f) => [f.key, c?.[f.key] == null ? '' : String(c[f.key])]));

const isNum = (v) => /^\d+(\.\d{1,2})?$/.test(String(v).trim());

export function validateCourse(form) {
  const errs = {};
  if (!form.id.trim()) errs.id = 'Enter the Course ID';
  else if (form.id.trim().length > 40) errs.id = 'Up to 40 characters';
  if (!form.name.trim()) errs.name = 'Enter the course name';
  for (const f of COURSE_FIELDS.filter((x) => x.number)) {
    const v = String(form[f.key] ?? '').trim();
    if (f.required && !v) errs[f.key] = 'Required';
    else if (v && !isNum(v)) errs[f.key] = 'Enter a number';
  }
  return errs;
}

/** Form values -> request body: trimmed text, numbers as numbers, empty optional numbers as null. */
export function courseBody(form) {
  const body = {};
  for (const f of COURSE_FIELDS) {
    const v = String(form[f.key] ?? '').trim();
    body[f.key] = f.number ? (v === '' ? null : Number(v)) : v;
  }
  body.id = body.id.toUpperCase();
  return body;
}

export default function CourseFormFields({ form, errors = {}, onChange, idReadOnly = false }) {
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {COURSE_FIELDS.map((f) => (
        <Input
          key={f.key}
          className={f.wide ? 'sm:col-span-2' : undefined}
          label={f.label}
          required={f.required}
          placeholder={f.placeholder}
          inputMode={f.number ? 'decimal' : undefined}
          maxLength={f.key === 'id' ? 40 : f.key === 'name' ? 200 : 40}
          readOnly={f.key === 'id' && idReadOnly}
          value={form[f.key]}
          error={errors[f.key]}
          onChange={set(f.key)}
          hint={f.key === 'id' && !idReadOnly ? 'Any letters, digits or symbols, e.g. ADCH&N, C++' : undefined}
        />
      ))}
    </div>
  );
}
