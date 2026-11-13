import Input from '../../ui/Input';
import YearInput from '../../ui/YearInput';
import Select from '../../ui/Select';
import SearchableSelect from '../../ui/SearchableSelect';
import Textarea from '../../ui/Textarea';
import RadioGroup from '../../ui/RadioGroup';
import LookupSelect from '../LookupSelect';
import { courseOptions, makeField } from '../fieldProps';
import { LAB_CREATION_OPTIONS, MARKETING_COUNT_LABEL, MARKETING_GRADE_FIELDS, MK_DATABASE, MK_LAB_CHECK } from '../../../utils/entryForm';

const digits = (e) => ({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 7) } });

/**
 * Marketing Support: TC calls, Mailers, SMS, Lab Creation - Check, DataBase Creation/Download, Councelling, Registration.
 * TC calls / Mailers / SMS share College/Database Name, Dept/File Name, Sec, YOP, a total, Fresh/Repeat and Remarks;
 * TC calls also records the A / B+ / B- / D / NR call grades.
 */
export default function MarketingTab({ values, errors, set, setMany, lookups, onAddLookup }) {
  const f = makeField('marketing', values, errors, set);
  const req = (k) => ({ ...f(k), required: true });
  const num = (k) => ({ ...req(k), inputMode: 'numeric', onChange: (e) => set(k, digits(e).target.value) });
  const type = values.marketingType;
  const countLabel = MARKETING_COUNT_LABEL[type];

  const changeType = (t) =>
    setMany({
      marketingType: t, collegeName: '', dept: '', sec: '', yop: '', total: '', freshRepeat: '', enquiryFormNo: '', courseId: '', registerNo: '',
      databaseName: '', fileName: '', records: '', storedPlace: '', utilizationCheck: '', labCreation: '',
      ...Object.fromEntries(MARKETING_GRADE_FIELDS.map(([k]) => [k, ''])),
    });

  return (
    <div className="space-y-5">
      <RadioGroup name="marketingType" label="Marketing Type" required options={lookups.marketingTypes} value={type} onChange={changeType} error={errors.marketingType} />

      {countLabel && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <LookupSelect kind="colleges" label="College Name / Database Name" className="sm:col-span-2 lg:col-span-5" options={lookups.colleges} onAddLookup={onAddLookup} {...req('collegeName')} />
          <LookupSelect kind="departments" label="Dept / File Name" className="lg:col-span-3" options={lookups.departments} onAddLookup={onAddLookup} {...f('dept')} />
          <Select label="Sec" className="lg:col-span-2" options={lookups.sections} {...f('sec')} />
          <YearInput label="YOP" className="lg:col-span-2" {...f('yop')} />
          <Input label={countLabel} className="lg:col-span-2" inputMode="numeric" {...req('total')} />
          <RadioGroup className="lg:col-span-4" label="Fresh / Repeat" name="freshRepeat" options={['Fresh', 'Repeat']} value={values.freshRepeat} onChange={(v) => set('freshRepeat', v)} />
          <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-6 lg:row-span-2" rows={3} maxLength={500} {...f('remarks')} />
          {type === 'TC calls' && (
            <fieldset className="rounded-xl border border-ink-200 p-3 sm:col-span-2 lg:col-span-6">
              <legend className="px-1 text-[13px] font-medium text-ink-700">Call grades</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {MARKETING_GRADE_FIELDS.map(([key, label]) => (
                  <Input key={key} label={label} inputMode="numeric" {...f(key)} />
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {type === MK_LAB_CHECK && (
        <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-ink-200 p-4 sm:grid-cols-2 lg:grid-cols-12">
          <legend className="px-1 text-[13px] font-semibold text-ink-700">Lab Creation - Check</legend>
          <RadioGroup className="lg:col-span-4" label="Utilization Check" required name="utilizationCheck" options={['Yes', 'No']} value={values.utilizationCheck} onChange={(v) => set('utilizationCheck', v)} error={errors.utilizationCheck} />
          <RadioGroup className="lg:col-span-5" label="Fresh Lab / Repeat Lab Creation" required name="labCreation" options={LAB_CREATION_OPTIONS} value={values.labCreation} onChange={(v) => set('labCreation', v)} error={errors.labCreation} />
          <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
        </fieldset>
      )}

      {type === MK_DATABASE && (
        <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-ink-200 p-4 sm:grid-cols-2 lg:grid-cols-12">
          <legend className="px-1 text-[13px] font-semibold text-ink-700">DataBase Creation / Download</legend>
          <Input label="College Name / Database Name" className="sm:col-span-2 lg:col-span-5" maxLength={150} {...req('databaseName')} />
          <Input label="File Name" className="lg:col-span-4" maxLength={150} {...req('fileName')} />
          <Input label="Total Records" className="lg:col-span-3" {...num('records')} />
          <Input label="Stored Place" className="sm:col-span-2 lg:col-span-6" maxLength={200} placeholder="e.g. Server \\Marketing\\2026" {...f('storedPlace')} />
          <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-6" rows={2} maxLength={500} {...f('remarks')} />
        </fieldset>
      )}

      {type === 'Councelling' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Input label="Enq Form No" className="lg:col-span-3" maxLength={30} placeholder="Type the form number" {...req('enquiryFormNo')} />
          <SearchableSelect label="Course Name" className="lg:col-span-9" options={courseOptions(lookups)} placeholder="Search course" {...f('courseId')} />
          <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
        </div>
      )}

      {type === 'Registration' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Select label="Register No" className="lg:col-span-3" options={lookups.registerNos} {...req('registerNo')} />
          <Textarea label="Remarks" className="lg:col-span-9" rows={2} maxLength={500} {...f('remarks')} />
        </div>
      )}
    </div>
  );
}
