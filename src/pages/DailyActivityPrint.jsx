import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, FileSearch, FileSpreadsheet, Printer } from 'lucide-react';
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
import { ACTIVITY_TYPES } from '../utils/constants';
import { formatDuration, toISODate } from '../utils/format';
import { reportRow } from '../utils/entry';
import { LEGEND_TEXT, SHEET_COLUMNS, downloadExcel, downloadPdf, roleText, sheetRows, shortDate, slashDate } from '../utils/dailySheetExport';
import { canAccess, MASTER_ROLES } from '../utils/permissions';

/** Faculty › Daily Activity › Print: printable daily activity sheet for a faculty and date range, in the old software's layout. */
export default function DailyActivityPrint() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const today = toISODate();
  // Faculty and staff see only their own sheet; Manager / Admin / HR can pick anyone.
  const ownOnly = !canAccess(user, [...MASTER_ROLES, 'HR']);
  const [form, setForm] = useState({
    facultyCode: ownOnly ? user.code : params.get('faculty') || user.code,
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
  const people = [...(lookups.faculties || []), ...(lookups.employees || [])];
  const nameOf = (code) => people.find((p) => p.code === code)?.name || code;
  const faculty = people.find((f) => f.code === report?.facultyCode) || (report?.facultyCode === user.code ? user : null);
  const total = report?.items.reduce((s, e) => s + e.minutes, 0) || 0;
  const meta = report && { name: faculty?.name || report.facultyCode, code: report.facultyCode, dateFrom: report.dateFrom, dateTo: report.dateTo, totalText: `Entries ${report.items.length} · Worked hours ${formatDuration(total)}` };
  const exportAs = async (kind) => {
    try {
      const rows = sheetRows(report.items, lookups.courses, nameOf);
      await (kind === 'pdf' ? downloadPdf(meta, rows) : downloadExcel(meta, rows));
    } catch (err) {
      toast.error(err.message || String(err), 'Download failed');
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Daily Activity Print"
          breadcrumb={[{ label: 'Faculty' }, { label: 'Daily Activity' }, { label: 'Print' }]}
          description="Generate a printable activity sheet for a faculty and date range."
          actions={
            <>
              <Button variant="secondary" icon={FileDown} onClick={() => exportAs('pdf')} disabled={!report?.items.length}>
                Download PDF
              </Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={() => exportAs('excel')} disabled={!report?.items.length}>
                Download Excel
              </Button>
              <Button icon={Printer} onClick={() => window.print()} disabled={!report?.items.length}>
                Print
              </Button>
            </>
          }
        />
        <Card className="mb-5">
          <form onSubmit={generate} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SearchableSelect
              label="Faculty Name"
              required
              disabled={ownOnly}
              hint={ownOnly ? 'You can print your own report only' : undefined}
              className="sm:col-span-2 lg:col-span-1"
              options={ownOnly ? [{ value: user.code, label: `${user.name} (${user.code})` }] : lookups.faculties.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }))}
              value={form.facultyCode}
              onChange={(v) => setForm({ ...form, facultyCode: v })}
              error={errors.facultyCode}
            />
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
        <article className="card print-full mx-auto max-w-6xl p-6 sm:p-8">
          <header className="flex flex-wrap items-end justify-between gap-4 pb-3">
            <div>
              <h2 className="text-xl font-bold tracking-wide text-ink-900">ADVANTAGE PRO</h2>
              <p className="mt-0.5 text-[13px] text-ink-700">
                {meta.name} ({meta.code}) Daily Activity Report
              </p>
              <p className="mt-0.5 text-[13px] text-ink-700">Page No. 1</p>
            </div>
            <p className="text-[13px] text-ink-700">
              Date&nbsp;&nbsp;
              <b className="text-ink-900">{report.dateFrom === report.dateTo ? slashDate(report.dateFrom) : `${slashDate(report.dateFrom)} to ${slashDate(report.dateTo)}`}</b>
            </p>
          </header>

          {grouped.length === 0 ? (
            <EmptyState title="No activities in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-[12px] leading-snug">
                <thead>
                  <tr className="text-left">
                    {SHEET_COLUMNS.map((h) => (
                      <th key={h} className="border border-ink-400 px-1.5 py-1 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped
                    .flatMap(([, items]) => items)
                    .map((e) => {
                      const r = reportRow(e, lookups.courses);
                      return (
                        <tr key={e.id} className="align-top">
                          <td className="border border-ink-400 px-1.5 py-1 whitespace-nowrap">{shortDate(e.activityDate)}</td>
                          <td className="border border-ink-400 px-1.5 py-1 whitespace-nowrap tabular-nums">{e.timeFrom}</td>
                          <td className="border border-ink-400 px-1.5 py-1 whitespace-nowrap tabular-nums">{e.timeTo}</td>
                          <td className="border border-ink-400 px-1.5 py-1">{r.batchNo}</td>
                          <td className="w-[13%] border border-ink-400 px-1.5 py-1">{r.paper}</td>
                          <td className="border border-ink-400 px-1.5 py-1 text-center">{r.sNo}</td>
                          <td className="border border-ink-400 px-1.5 py-1 text-center">{r.sType}</td>
                          <td className="w-[13%] border border-ink-400 px-1.5 py-1 uppercase">{r.college}</td>
                          <td className="border border-ink-400 px-1.5 py-1">{r.dept}</td>
                          <td className="border border-ink-400 px-1.5 py-1">{r.yop}</td>
                          <td className="w-[26%] border border-ink-400 px-1.5 py-1">{r.topic}</td>
                          <td className="border border-ink-400 px-1.5 py-1 text-center font-medium">{r.cType}</td>
                          <td className="border border-ink-400 px-1.5 py-1">{roleText(r, nameOf)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-[11.5px] text-ink-700">
            <p className="max-w-4xl">{LEGEND_TEXT}</p>
            {report.items.length > 0 && (
              <p className="whitespace-nowrap">
                Entries <b>{report.items.length}</b> · Worked hours <b>{formatDuration(total)}</b>
              </p>
            )}
          </div>
        </article>
      )}
    </>
  );
}
