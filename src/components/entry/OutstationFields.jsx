import { MapPin } from 'lucide-react';
import YearInput from '../ui/YearInput';
import Input from '../ui/Input';
import Select from '../ui/Select';
import SearchableSelect from '../ui/SearchableSelect';
import RadioGroup from '../ui/RadioGroup';
import LookupSelect from './LookupSelect';
import { facultyOptions } from './fieldProps';
import { OD_CHECKS } from '../../utils/entryForm';

/** "College / OD" group shown on the Class tab when Faculty in = College / OD (stored as Outstation). */
export default function OutstationFields({ values, errors, set, lookups, onAddLookup }) {
  const f = (name, required) => ({ id: `out-${name}`, value: values[name] ?? '', onChange: (e) => set(name, e?.target ? e.target.value : e), error: errors[name], required });
  return (
    <fieldset className="rounded-xl border border-accent-600/25 bg-accent-50/40 p-4">
      <legend className="flex items-center gap-1.5 px-1.5 text-[13px] font-semibold text-accent-600">
        <MapPin className="size-4" aria-hidden /> College / OD
      </legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <LookupSelect kind="colleges" label="College Name" className="sm:col-span-2 lg:col-span-5" options={lookups.colleges} onAddLookup={onAddLookup} {...f('collegeName', true)} />
        <LookupSelect kind="departments" label="Dept" className="lg:col-span-3" options={lookups.departments} onAddLookup={onAddLookup} {...f('dept', true)} />
        <Select label="Sec" className="lg:col-span-2" options={lookups.sections} {...f('sec')} />
        <Input label="Total Absent" className="lg:col-span-2" inputMode="numeric" {...f('totalAbsent')} />
        <YearInput label="YOP" className="lg:col-span-2" options={lookups.yopOptions} {...f('yop')} />
        <SearchableSelect label="Assistance Faculty" className="sm:col-span-2 lg:col-span-8" options={facultyOptions(lookups)} {...f('assistanceFaculty')} />
      </div>
      <div className="mt-4 border-t border-accent-600/15 pt-3">
        <p className="mb-2 text-[12px] font-medium text-ink-500">In this session (optional)</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OD_CHECKS.map(([name, label]) => (
            <RadioGroup key={name} size="sm" label={label} name={`out-${name}`} options={['Yes', 'No']} value={values[name] ?? ''} onChange={(v) => set(name, v)} />
          ))}
        </div>
      </div>
    </fieldset>
  );
}
