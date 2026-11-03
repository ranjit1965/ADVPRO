import Input from '../../ui/Input';
import YearInput from '../../ui/YearInput';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import RadioGroup from '../../ui/RadioGroup';
import SearchableSelect from '../../ui/SearchableSelect';
import LookupSelect from '../LookupSelect';
import { makeField, facultyOptions } from '../fieldProps';

export default function SeminarTab({ values, errors, set, lookups, onAddLookup }) {
  const f = makeField('seminar', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <RadioGroup className="sm:col-span-2 lg:col-span-4" label="Type" required name="seminarType" options={['Guest Lecture', 'IV / Work Shop']} value={values.seminarType} onChange={(v) => set('seminarType', v)} error={errors.seminarType} />
      <LookupSelect kind="colleges" label="College Name" className="sm:col-span-2 lg:col-span-5" options={lookups.colleges} onAddLookup={onAddLookup} {...f('collegeName')} />
      <LookupSelect kind="departments" label="Dept" className="lg:col-span-3" options={lookups.departments} onAddLookup={onAddLookup} {...f('dept')} />
      <Select label="Sec" className="lg:col-span-2" options={lookups.sections} {...f('sec')} />
      <Input label="Total Student" className="lg:col-span-2" inputMode="numeric" {...f('totalStudent')} />
      <YearInput label="YOP" className="lg:col-span-2" options={lookups.yopOptions} {...f('yop')} />
      <RadioGroup className="lg:col-span-2" label="Database Collected" name="databaseCollected" options={['Yes', 'No']} value={values.databaseCollected} onChange={(v) => set('databaseCollected', v)} />
      <SearchableSelect label="Assistance" className="lg:col-span-4" options={facultyOptions(lookups)} {...f('assistance')} />
      <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
    </div>
  );
}
