import { Building2, MapPin, Timer } from 'lucide-react';
import SearchableSelect from '../ui/SearchableSelect';
import DatePicker from '../ui/DatePicker';
import TimePicker from '../ui/TimePicker';
import RadioGroup from '../ui/RadioGroup';
import FormField from '../ui/FormField';
import { facultyOptions } from './fieldProps';
import { formatDuration, minutesBetween, toISODate } from '../../utils/format';
import { cn } from '../../utils/cn';

/** Faculty Name, Activity Date, Faculty in, Time From, Time To, Worked Hours. */
export default function EntryHeaderFields({ header, errors, onChange, lookups, lastEnd }) {
  const set = (k) => (e) => onChange({ [k]: e?.target ? e.target.value : e });
  const minutes = minutesBetween(header.timeFrom, header.timeTo);
  const valid = header.timeFrom && header.timeTo && minutes > 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <SearchableSelect id="facultyCode" label="Faculty Name" required className="sm:col-span-2 lg:col-span-4" options={facultyOptions(lookups)} value={header.facultyCode} onChange={set('facultyCode')} error={errors.facultyCode} placeholder="Search faculty" />
      <DatePicker id="activityDate" label="Activity Date" required className="lg:col-span-3" value={header.activityDate} max={toISODate()} onChange={set('activityDate')} error={errors.activityDate} />
      <RadioGroup
        label="Faculty in"
        required
        name="facultyIn"
        className="lg:col-span-5"
        value={header.facultyIn}
        onChange={set('facultyIn')}
        options={[
          { value: 'Center', label: 'Center', icon: Building2 },
          { value: 'Outstation', label: 'College / OD', icon: MapPin },
        ]}
      />
      <TimePicker id="timeFrom" label="Time From" required className="lg:col-span-2" hint={lastEnd && header.timeFrom === lastEnd ? "Last entry's end time" : undefined} value={header.timeFrom} onChange={set('timeFrom')} error={errors.timeFrom} />
      <TimePicker id="timeTo" label="Time To" required className="lg:col-span-2" value={header.timeTo} onChange={set('timeTo')} error={errors.timeTo} />
      <FormField label="Worked Hours" className="lg:col-span-2">
        <div className={cn('flex h-[38px] items-center gap-2 rounded-lg border px-3 font-semibold tabular-nums', valid ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-ink-50 text-ink-400')} aria-live="polite">
          <Timer className="size-4" aria-hidden />
          {valid ? formatDuration(minutes) : "0h"}
        </div>
      </FormField>
    </div>
  );
}
