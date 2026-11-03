import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSearch, Printer } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchableSelect from '../components/ui/SearchableSelect';
import DatePicker from '../components/ui/DatePicker';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Loading';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import * as api from '../services/api';
import { ACTIVITY_LABEL, ACTIVITY_TYPES, facultyInLabel } from '../utils/constants';
import { formatDate, formatDateTime, formatDuration, formatTime, toISODate } from '../utils/format';
import { entrySummary } from '../utils/entry';

/** Faculty › Daily Activity › Print: printable daily activity sheet for a faculty and date range. */
export default function DailyActivityPrint() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const today = toISODate();
  const [form, setForm] = useState({
    facultyCode: params.get('faculty') || user.code,
    dateFrom: params.get('date') || today,
    dateTo: params.get('date') || today,
    activityType: '',
  });
  const [errors, setErrors] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.facultyCode) errs.facultyCode = 'Select a faculty';
    if (!form.dateFrom) errs.dateFrom = 'Required';
    if (!form.dateTo) errs.dateTo = 'Required';
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) errs.dateTo = 'Must be on or after From date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const { items } = await api.getDailyEntries({ ...form, sortBy: 'activityDate', sortDir: 'asc' });
      setReport({ ...form, items, generatedAt: new Date().toISOString() });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    if (!report) return [];
    const map = new Map();
    // One list per day, in time order from morning to evening (Others included).
    [...report.items].sort((a, b) => (a.activityDate + a.timeFrom).localeCompare(b.activityDate + b.timeFrom)).forEach((e) => {
      if (!map.has(e.activityDate)) map.set(e.activityDate, []);
      map.get(e.activityDate).push(e);
    });
    return [...map.entries()];
  }, [report]);

  if (!lookups) return <PageLoader />;
  const faculty = lookups.faculties.find((f) => f.code === report?.facultyCode);
  const total = report?.items.reduce((s, e) => s + e.minutes, 0) || 0;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Daily Activity Print"
          breadcrumb={[{ label: 'Faculty' }, { label: 'Daily Activity' }, { label: 'Print' }]}
          description="Generate a printable activity sheet for a faculty and date range."
          actions={
            <Button icon={Printer} onClick={() => window.print()} disabled={!report?.items.length}>
              Print
            </Button>
          }
        />
        <Card className="mb-5">
          <form onSubmit={generate} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SearchableSelect label="Faculty Name" required className="sm:col-span-2 lg:col-span-1" options={lookups.faculties.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }))} value={form.facultyCode} onChange={(v) => setForm({ ...form, facultyCode: v })} error={errors.facultyCode} />
            <DatePicker label="From" required value={form.dateFrom} max={today} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} error={errors.dateFrom} />
            <DatePicker label="To" required value={form.dateTo} max={today} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} error={errors.dateTo} />
            <Select label="Activity" placeholder="All activities" options={ACTIVITY_TYPES.map((a) => ({ value: a.key, label: a.label }))} value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })} />
            <Button type="submit" icon={FileSearch} loading={loading} className={Object.keys(errors).length ? 'self-center' : ''}>
              Generate
            </Button>
          </form>
        </Card>
      </div>

      {!report && !loading && (
        <Card className="no-print">
          <EmptyState icon={Printer} title="No sheet generated yet" message="Choose a faculty and dates, then click Generate." />
        </Card>
      )}

      {report && (
        <article className="card print-full mx-auto max-w-4xl p-6 sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink-900 pb-4">
            <div>
              <p className="text-xs font-semibold tracking-widest text-ink-500 uppercase">Advantage Pro · IT Training Division</p>
              <h2 className="mt-1 text-xl font-bold text-ink-900">Faculty Daily Activity Report</h2>
            </div>
            <div className="text-right text-[13px] text-ink-600">
              <p>
                Period: <b className="text-ink-900">{formatDate(report.dateFrom)}</b> to <b className="text-ink-900">{formatDate(report.dateTo)}</b>
              </p>
              <p>Generated: {formatDateTime(report.generatedAt)}</p>
            </div>
          </header>
          <div className="grid grid-cols-2 gap-4 border-b border-ink-200 py-4 text-[13px] sm:grid-cols-4">
            <p>
              <span className="block text-xs text-ink-500">Faculty</span>
              <b>
                {faculty?.name} ({faculty?.code})
              </b>
            </p>
            <p>
              <span className="block text-xs text-ink-500">Designation</span>
              <b>{faculty?.designation}</b>
            </p>
            <p>
              <span className="block text-xs text-ink-500">Entries</span>
              <b>{report.items.length}</b>
            </p>
            <p>
              <span className="block text-xs text-ink-500">Worked hours</span>
              <b>{formatDuration(total)}</b>
            </p>
          </div>

          {grouped.length === 0 ? (
            <EmptyState title="No activities in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-4 w-full min-w-[600px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-y border-ink-300 bg-ink-50 text-left">
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 font-semibold">Time</th>
                    <th className="px-2 py-2 font-semibold">Activity</th>
                    <th className="px-2 py-2 font-semibold">In</th>
                    <th className="px-2 py-2 font-semibold">Details</th>
                    <th className="px-2 py-2 text-right font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([date, items]) =>
                    items.map((e, i) => (
                      <tr key={e.id} className="border-b border-ink-200 align-top">
                        {i === 0 && (
                          <td rowSpan={items.length} className="px-2 py-2 font-medium whitespace-nowrap">
                            {formatDate(date)}
                          </td>
                        )}
                        <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                          {formatTime(e.timeFrom)} – {formatTime(e.timeTo)}
                        </td>
                        <td className="px-2 py-2">{ACTIVITY_LABEL[e.activityType]}</td>
                        <td className="px-2 py-2">{facultyInLabel(e.facultyIn)}</td>
                        <td className="px-2 py-2">{entrySummary(e)}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{formatDuration(e.minutes)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-900 font-semibold">
                    <td colSpan={5} className="px-2 py-2 text-right">
                      Total worked hours
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatDuration(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </article>
      )}
    </>
  );
}
