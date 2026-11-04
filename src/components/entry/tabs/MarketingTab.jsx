import Input from '../../ui/Input';
import YearInput from '../../ui/YearInput';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import RadioGroup from '../../ui/RadioGroup';
import LookupSelect from '../LookupSelect';
import { makeField } from '../fieldProps';
import { MARKETING_COUNT_LABEL, MARKETING_GRADE_FIELDS } from '../../../utils/entryForm';

/**
 * Legacy Marketing tab: TC calls, Mailers, SMS, Label Printout, Councelling, Registration.
 * The first four share College/Database Name, Dept/File Name, Sec, YOP, a total, Fresh/Repeat and Remarks;
 * TC calls also records the A / B+ / B- / D / NR call grades.
 */
export default function MarketingTab({ values, errors, set, setMany, lookups, onAddLookup }) {
  const f = makeField('marketing', values, errors, set);
  const req = (k) => ({ ...f(k), required: true });
  const type = values.marketingType;
  const countLabel = MARKETING_COUNT_LABEL[type];

  const changeType = (t) =>
    setMany({ marketingType: t, collegeName: '', dept: '', sec: '', yop: '', total: '', freshRepeat: '', enquiryFormNo: '', registerNo: '', ...Object.fromEntries(MARKETING_GRADE_FIELDS.map(([k]) => [k, ''])) });

  return (
    <div className="space-y-5">
      <RadioGroup name="marketingType" label="Marketing Type" required options={lookups.marketingTypes} value={type} onChange={changeType} error={errors.marketingType} />

      {countLabel && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <LookupSelect kind="colleges" label="College Name / Database Name" className="sm:col-span-2 lg:col-span-5" options={lookups.colleges} onAddLookup={onAddLookup} {...req('collegeName')} />
          <LookupSelect kind="departments" label="Dept / File Name" className="lg:col-span-3" options={lookups.departments} onAddLookup={onAddLookup} {...f('dept')} />
          <Select label="Sec" className="lg:col-span-2" options={lookups.sections} {...f('sec')} />
          <YearInput label="YOP" className="lg:col-span-2" options={lookups.yopOptions} {...f('yop')} />
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

      {type === 'Councelling' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Select label="Enq Form No" className="lg:col-span-3" options={lookups.enquiryFormNos} {...req('enquiryFormNo')} />
          <Textarea label="Remarks" className="lg:col-span-9" rows={2} maxLength={500} {...f('remarks')} />
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
