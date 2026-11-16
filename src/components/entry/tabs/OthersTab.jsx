import { Info } from 'lucide-react';
import Textarea from '../../ui/Textarea';
import Input from '../../ui/Input';
import SearchableSelect from '../../ui/SearchableSelect';
import { makeField } from '../fieldProps';
import { OTHERS_CUSTOM } from '../../../utils/entryForm';

/**
 * Others: Heading and Remarks. Headings come from Master › Dropdown Values (Admin / Manager add them);
 * "Others" at the end of the list asks for a heading typed by the faculty. An entry over 1 hour asks
 * "Are you sure?" on Save.
 */
export default function OthersTab({ values, errors, set, setMany, lookups }) {
  const f = makeField('others', values, errors, set);
  const headings = (lookups.othersHeadings || []).filter((h) => h.toLowerCase() !== OTHERS_CUSTOM.toLowerCase());
  const custom = values.heading === OTHERS_CUSTOM;
  const onHeading = (v) => (setMany ? setMany({ heading: v, otherHeading: v === OTHERS_CUSTOM ? values.otherHeading || '' : '' }) : set('heading', v));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SearchableSelect
          label="Heading"
          className="lg:col-span-4"
          sort={false}
          options={[...headings.map((h) => ({ value: h, label: h })), { value: OTHERS_CUSTOM, label: 'Others (type your own)' }]}
          placeholder="Select a heading"
          {...f('heading')}
          onChange={onHeading}
        />
        {custom && <Input label="Other heading" required className="lg:col-span-4" maxLength={80} placeholder="Type the heading" {...f('otherHeading')} />}
        <Textarea label="Remarks" className={custom ? 'lg:col-span-12' : 'lg:col-span-8'} rows={2} maxLength={500} placeholder="Describe the activity (optional)" {...f('remarks')} />
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-info-600/20 bg-info-50 px-3 py-2.5 text-[13px] text-info-700">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <b className="text-accent-600">Please Note:</b> Information entered in the Others column is not a part of activity performance. An Others entry longer than{' '}
          <b>1 hour</b> asks you to confirm before it is saved. Meetings should be entered in <b>Faculty Development</b>.
        </span>
      </p>
    </div>
  );
}
