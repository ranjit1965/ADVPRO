import { Info, Plus } from 'lucide-react';
import Textarea from '../../ui/Textarea';
import SearchableSelect from '../../ui/SearchableSelect';
import { makeField } from '../fieldProps';
import { OTHERS_DAILY_LIMIT } from '../../../utils/entryForm';

/** Others: Heading and Remarks. Limited to 1 hour per person per day (othersUsed = minutes already logged that day). */
export default function OthersTab({ values, errors, set, lookups, onAddLookup, othersUsed = 0 }) {
  const f = makeField('others', values, errors, set);
  const addHeading = () => onAddLookup('othersHeadings', (v) => set('heading', v));
  const left = Math.max(0, OTHERS_DAILY_LIMIT - othersUsed);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SearchableSelect
          label="Heading"
          className="lg:col-span-4"
          options={lookups.othersHeadings.map((h) => ({ value: h, label: h }))}
          placeholder="Select a heading"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
              e.preventDefault();
              addHeading();
            }
          }}
          aside={
            <button type="button" onClick={addHeading} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">
              <Plus className="size-3.5" aria-hidden /> Add new heading
            </button>
          }
          {...f('heading')}
          onChange={(v) => set('heading', v)}
        />
        <Textarea label="Remarks" className="lg:col-span-8" rows={2} maxLength={500} placeholder="Describe the activity" {...f('remarks')} />
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-info-600/20 bg-info-50 px-3 py-2.5 text-[13px] text-info-700">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <b className="text-accent-600">Please Note:</b> Information entered in the Others column is not a part of activity performance. Others can be entered for at most{' '}
          <b>1 hour a day</b>: <b>{left} min left</b> for this day.
        </span>
      </p>
    </div>
  );
}
