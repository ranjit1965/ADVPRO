import { Building2, MapPin, Timer } from 'lucide-react';
import SearchableSelect from '../ui/SearchableSelect';
import DatePicker from '../ui/DatePicker';
import TimeField from '../ui/TimeField';
import RadioGroup from '../ui/RadioGroup';
import FormField from '../ui/FormField';
import { facultyOptions } from './fieldProps';
import { formatDuration, minutesBetween, toISODate } from '../../utils/format';
import { cn } from '../../utils/cn';
import { DAY_START } from '../../utils/constants';

/** Faculty Name, Activity Date; then Time From, Time To, Faculty in, Worked Hours. */
export default function EntryHeaderFields({ header, errors, onChange, lookups, lastEnd }) {
  const set = (k) => (e) => onChange({ [k]: e?.target ? e.target.value : e });
  const minutes = minutesBetween(header.timeFrom, header.timeTo);
  const valid = header.timeFrom && header.timeTo && minutes > 0;
  // Shown at once, while choosing, not only on Save.
  const toWarning = header.timeFrom && header.timeTo && minutes <= 0 ? `Time To must be after Time From (${header.timeFrom})` : '';
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
      <SearchableSelect id="facultyCode" label="Faculty Name" required className="col-span-2 lg:col-span-8" options={facultyOptions(lookups)} value={header.facultyCode} onChange={set('facultyCode')} error={errors.facultyCode} placeholder="Search faculty" />
      <DatePicker id="activityDate" label="Activity Date" required className="col-span-2 lg:col-span-4" value={header.activityDate} max={toISODate()} onChange={set('activityDate')} error={errors.activityDate} />
      <TimeField
        id="timeFrom"
        label="Time From"
        required
        className="lg:col-span-3 xl:col-span-2"
        hint={lastEnd && header.timeFrom === lastEnd ? "Last entry's end time" : !lastEnd && header.timeFrom === DAY_START ? 'Day starts 09:00' : undefined}
        value={header.timeFrom}
        onChange={set('timeFrom')}
        error={errors.timeFrom}
      />
      <TimeField
        id="timeTo"
        label="Time To"
        required
        className="lg:col-span-3 xl:col-span-2"
        value={header.timeTo}
        onChange={set('timeTo')}
        error={toWarning || errors.timeTo}
      />
      <RadioGroup
        label="Faculty in"
        required
        name="facultyIn"
        className="col-span-2 lg:col-span-4 xl:col-span-5"
        value={header.facultyIn}
        onChange={set('facultyIn')}
        options={[
          { value: 'Center', label: 'Center', icon: Building2 },
          { value: 'Outstation', label: 'College / OD', icon: MapPin },
        ]}
      />
      <FormField label="Worked Hours" className="col-span-2 lg:col-span-2 xl:col-span-3">
        <div className={cn('flex h-[38px] items-center gap-2 rounded-lg border px-3 font-semibold tabular-nums', valid ? 'border-brand-200 bg-brand-50 text-brand-700' : toWarning ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-ink-200 bg-ink-50 text-ink-400')} aria-live="polite">
          <Timer className="size-4" aria-hidden />
          {valid ? formatDuration(minutes) : '0h'}
        </div>
      </FormField>
    </div>
  );
}
