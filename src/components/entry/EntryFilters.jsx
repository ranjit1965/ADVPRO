import { Search, X } from 'lucide-react';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { ACTIVITY_TYPES, FACULTY_IN_OPTIONS } from '../../utils/constants';

export default function EntryFilters({ filters, onChange, onReset, faculties, showFaculty = true }) {
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const active = Object.entries(filters).some(([k, v]) => v && !['sortBy', 'sortDir', 'page', 'pageSize'].includes(k));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <div className="relative sm:col-span-2 xl:col-span-2">
        <label htmlFor="entry-search" className="mb-1.5 block text-[13px] font-medium text-ink-700">
          Search
        </label>
        <Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-ink-400" aria-hidden />
        <input id="entry-search" type="search" className="field-control pl-9" placeholder="College, course, remarks…" value={filters.q} onChange={set('q')} />
      </div>
      <DatePicker label="From" value={filters.dateFrom} onChange={set('dateFrom')} max={filters.dateTo || undefined} />
      <DatePicker label="To" value={filters.dateTo} onChange={set('dateTo')} min={filters.dateFrom || undefined} />
      <Select label="Activity" placeholder="All activities" options={ACTIVITY_TYPES.map((a) => ({ value: a.key, label: a.label }))} value={filters.activityType} onChange={set('activityType')} />
      {showFaculty && <Select searchable label="Faculty" placeholder="All faculty" options={faculties.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }))} value={filters.facultyCode} onChange={set('facultyCode')} />}
      <div className="flex items-end gap-2">
        <Select className="flex-1" label="Faculty in" placeholder="All" sort={false} options={FACULTY_IN_OPTIONS} value={filters.facultyIn} onChange={set('facultyIn')} />
        {active && <Button variant="ghost" size="icon" icon={X} onClick={onReset} aria-label="Reset filters" title="Reset filters" />}
      </div>
    </div>
  );
}
