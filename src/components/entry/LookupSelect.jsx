import { Keyboard } from 'lucide-react';
import SearchableSelect from '../ui/SearchableSelect';

/**
 * College Name / Dept dropdown. Like the legacy screen, Ctrl + A while the field
 * has focus opens "Add new" so a missing college or department can be added on the spot.
 */
export default function LookupSelect({ kind, options, onAddLookup, onChange, ...props }) {
  const label = kind === 'colleges' ? 'college' : 'department';
  return (
    <SearchableSelect
      {...props}
      onChange={onChange}
      options={options.map((o) => ({ value: o, label: o }))}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          onAddLookup(kind, onChange);
        }
      }}
      aside={
        <button type="button" onClick={() => onAddLookup(kind, onChange)} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline" title={`Add a new ${label} (Ctrl + A)`}>
          <Keyboard className="size-3" aria-hidden />
          Ctrl + A
        </button>
      }
    />
  );
}
