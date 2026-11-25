import { useEffect, useState } from 'react';
import { Briefcase, Building2, Home, MapPin, Timer } from 'lucide-react';
import * as api from '../../services/api';
import Select from '../ui/Select';
import { useToast } from '../../context/ToastContext';
import SearchableSelect from '../ui/SearchableSelect';
import DatePicker from '../ui/DatePicker';
import TimeField from '../ui/TimeField';
import RadioGroup from '../ui/RadioGroup';
import FormField from '../ui/FormField';
import { facultyOptions } from './fieldProps';
import { formatDuration, minutesBetween, toISODate, personLabel } from '../../utils/format';
import { cn } from '../../utils/cn';
import { DAY_START } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { seesAllEntries } from '../../utils/permissions';

/** Faculty Name and Activity Date (top card). */
export default function EntryHeaderFields({ header, errors, onChange, lookups }) {
  const { user } = useAuth();
  const set = (k) => (e) => onChange({ [k]: e?.target ? e.target.value : e });
  // Faculty and Staff enter only for themselves: the list holds just their own name.
  const all = seesAllEntries(user);
  const options = all ? facultyOptions(lookups) : [{ value: user.code, label: `${personLabel(user)}` }];
  const canDeclare = header.facultyCode && (header.facultyCode === user.code || ['ADMIN', 'MANAGER'].includes(user.role));
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
      <SearchableSelect id="facultyCode" label="Faculty Name" required disabled={!all} match="contains" className="col-span-2 lg:col-span-6" options={options} value={header.facultyCode} onChange={set('facultyCode')} error={errors.facultyCode} placeholder="Search faculty" />
      <DatePicker id="activityDate" label="Activity Date" required className="col-span-2 lg:col-span-3" value={header.activityDate} max={toISODate()} onChange={set('activityDate')} error={errors.activityDate} />
      {canDeclare && <DeclareField code={header.facultyCode} date={header.activityDate} />}
    </div>
  );
}

export const DECLARE_OPTIONS = ['Absent', 'Week off'];

/**
 * v60: optional Declare dropdown. Absent or Week off is saved at once for that person and day:
 * Daily Entry Submission shows A or W, and the missing-entry check does not count the day.
 */
function DeclareField({ code, date }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setValue('');
    if (!code || !date) return undefined;
    api.getDeclarations(date.slice(0, 7), code)
      .then((list) => live && setValue(list.find((d) => d.date === date)?.kind || ''))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code, date]);
  const change = async (kind) => {
    setBusy(true);
    try {
      await api.declareDay({ date, kind, facultyCode: code });
      setValue(kind);
      toast.success(kind ? `${date.split('-').reverse().join('/')} declared ${kind}.` : 'Declaration removed.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Select
      id="declare"
      label="Declare"
      className="col-span-2 lg:col-span-3"
      sort={false}
      placeholder="None (optional)"
      disabled={busy || !date}
      options={DECLARE_OPTIONS}
      value={value}
      onChange={(e) => change(e.target.value)}
      hint="Absent shows A, Week off shows W"
    />
  );
}

/** Time From, Time To, Faculty in and Worked Hours: one line shown above the activity tabs. */
export function EntryTimeFields({ header, errors, onChange, lastEnd }) {
  const set = (k) => (e) => onChange({ [k]: e?.target ? e.target.value : e });
  const minutes = minutesBetween(header.timeFrom, header.timeTo);
  const valid = header.timeFrom && header.timeTo && minutes > 0;
  // Shown at once, while choosing, not only on Save.
  const toWarning = header.timeFrom && header.timeTo && minutes <= 0 ? `Time To must be after Time From (${header.timeFrom})` : '';
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
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
        className="col-span-2 lg:col-span-6 xl:col-span-6"
        value={header.facultyIn}
        onChange={set('facultyIn')}
        options={[
          { value: 'Center', label: 'Center', icon: Building2 },
          { value: 'Outstation', label: 'College', icon: MapPin },
          { value: 'Corporate', label: 'Corporate', icon: Briefcase },
          { value: 'WFH', label: 'Work from home', icon: Home },
        ]}
      />
      <FormField label="Worked Hours" className="col-span-2 lg:col-span-12 xl:col-span-2">
        <div className={cn('flex h-[38px] items-center gap-2 rounded-lg border px-3 font-semibold tabular-nums', valid ? 'border-brand-200 bg-brand-50 text-brand-700' : toWarning ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-ink-200 bg-ink-50 text-ink-400')} aria-live="polite">
          <Timer className="size-4" aria-hidden />
          {valid ? formatDuration(minutes) : '0h'}
        </div>
      </FormField>
    </div>
  );
}
