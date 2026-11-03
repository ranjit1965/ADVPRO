/** Checkbox list of people with "All faculty / All employees / Clear" shortcuts. Used by Shedulling and Monthly Plan. */
export default function AssigneePicker({ people, value, onChange, error }) {
  const toggle = (uid) => onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]);
  const pick = (pred) => onChange(people.filter(pred).map((p) => p.userId));
  const chip = 'rounded-md border border-ink-200 px-2 py-1 hover:bg-ink-50';
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-700">Assign to<span className="text-danger-600"> *</span></legend>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <button type="button" className={chip} onClick={() => pick((p) => p.role === 'FACULTY')}>All faculty</button>
        <button type="button" className={chip} onClick={() => pick(() => true)}>All employees</button>
        <button type="button" className={chip} onClick={() => pick(() => false)}>Clear</button>
        <span className="self-center text-ink-500">{value.length} selected</span>
      </div>
      <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-ink-200 p-2 sm:grid-cols-2">
        {people.map((p) => (
          <label key={p.userId} className="flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-ink-50">
            <input type="checkbox" className="size-4 accent-brand-600" checked={value.includes(p.userId)} onChange={() => toggle(p.userId)} />
            {p.name} <span className="text-xs text-ink-400">{p.code} · {p.role}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </fieldset>
  );
}
