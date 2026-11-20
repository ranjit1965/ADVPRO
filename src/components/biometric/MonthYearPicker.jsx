import Select from '../ui/Select';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));

/** Years offered: this year, 3 back and 1 ahead. */
const yearOptions = () => {
  const y = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => String(y + 1 - i));
};

/**
 * Month and year of the biometric file (the file has only "Employee Name" and the days 1 to 31).
 * draft / setDraft: { month: '01'..'12', year: 'YYYY' }; draftMonth(draft) gives 'YYYY-MM' once both are chosen.
 */
export default function MonthYearPicker({ draft, setDraft, error, disabled }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Select label="Month" required sort={false} className="w-44" placeholder="Choose month" options={MONTH_OPTIONS} value={draft.month} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))} error={error && !draft.month ? error : undefined} />
      <Select label="Year" required sort={false} className="w-32" placeholder="Choose year" options={yearOptions()} value={draft.year} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))} error={error && !draft.year ? error : undefined} />
    </div>
  );
}

export const draftMonth = (d) => (d.month && d.year ? `${d.year}-${d.month}` : '');
export const monthName = (ym) => (ym ? `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '');
