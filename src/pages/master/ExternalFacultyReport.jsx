import { useMemo, useState } from 'react';
import { Download, FileBarChart, Printer } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import RadioGroup from '../../components/ui/RadioGroup';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useLookups } from '../../context/LookupsContext';
import { formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/export';

const QUARTERS = [
  { key: 'Q1', label: 'Q1', months: 'Jan – Mar' },
  { key: 'Q2', label: 'Q2', months: 'Apr – Jun' },
  { key: 'Q3', label: 'Q3', months: 'Jul – Sep' },
  { key: 'Q4', label: 'Q4', months: 'Oct – Dec' },
];
const SCOPES = [
  { value: 'batches', label: 'Batches only' },
  { value: 'whole', label: 'Whole record (with certifications)' },
];
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => String(thisYear + 1 - i));

/**
 * External Faculty › External Faculty Monthly Report (v60): filter by name, pick the year and tick Q1 to Q4
 * (none ticked = the whole year), choose Batches only or the Whole record, then Generate. Columns: name,
 * batch name, start, end, course name, course ID; the whole record adds the current / non-current certifications.
 */
export default function ExternalFacultyReport() {
  const { lookups } = useLookups();
  const [facultyId, setFacultyId] = useState('');
  const [year, setYear] = useState(String(thisYear));
  const [quarters, setQuarters] = useState([]);
  const [scope, setScope] = useState('batches');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const faculties = useMemo(() => (lookups?.externalFaculties || []).map((f) => ({ value: f.value, label: f.label })), [lookups]);
  const toggleQ = (q) => setQuarters((l) => (l.includes(q) ? l.filter((x) => x !== q) : [...l, q].sort()));

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getExternalQuarterReport({ year, quarters, facultyId, scope }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const period = data ? `${data.quarters.length ? data.quarters.join(', ') : 'Q1 – Q4'} ${data.year}` : '';
  const exportCsv = () => {
    const lines = data.faculties.flatMap((f) => {
      const n = Math.max(f.batches.length, f.certifications.length, 1);
      return Array.from({ length: n }, (_, i) => ({ f, b: f.batches[i] || {}, c: f.certifications[i] }));
    });
    downloadCsv(`external-faculty-report-${data.year}${data.quarters.length ? `-${data.quarters.join('')}` : ''}.csv`, [
      { header: 'Name', value: (x) => x.f.name },
      { header: 'Batch Name', value: (x) => x.b.batchNo || '' },
      { header: 'Start Date', value: (x) => (x.b.startDate ? formatDate(x.b.startDate) : '') },
      { header: 'End Date', value: (x) => (x.b.endDate ? formatDate(x.b.endDate) : '') },
      { header: 'Course Name', value: (x) => x.b.courseName || '' },
      { header: 'Course ID', value: (x) => x.b.courseId || '' },
      { header: 'Quarter', value: (x) => (x.b.quarters || []).join(' ') },
      ...(data.scope === 'whole'
        ? [
            { header: 'Certification', value: (x) => (x.c ? [x.c.name, x.c.certificationId].filter(Boolean).join(' · ') : '') },
            { header: 'Certification Status', value: (x) => x.c?.status || '' },
            { header: 'Certification Expiry', value: (x) => (x.c?.expiryDate ? formatDate(x.c.expiryDate) : '') },
          ]
        : []),
    ], lines);
  };

  const th = 'border border-ink-300 px-2 py-1.5 text-left font-semibold';
  const td = 'border border-ink-300 px-2 py-1 align-top';
  const whole = data?.scope === 'whole';
  return (
    <>
      <div className="no-print">
        <PageHeader
          title="External Faculty Monthly Report"
          breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'External Faculty', to: '/master/externalFaculty' }, { label: 'Monthly Report' }]}
          description="Batches of the external faculty in the chosen quarters. Whole record adds their current and non-current certifications."
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select label="Name" searchable className="w-64" placeholder="All external faculty" options={faculties} value={facultyId} onChange={(e) => setFacultyId(e.target.value)} />
          <Select label="Year" sort={false} placeholder="" className="w-28" options={YEARS} value={year} onChange={(e) => setYear(e.target.value)} />
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-ink-700">Quarters <span className="font-normal text-ink-500">(none = whole year)</span></legend>
            <div className="flex gap-1.5">
              {QUARTERS.map((q) => {
                const on = quarters.includes(q.key);
                return (
                  <button key={q.key} type="button" aria-pressed={on} title={q.months} onClick={() => toggleQ(q.key)}
                    className={`h-10 rounded-lg border px-3 text-[13px] font-semibold ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'}`}>
                    {q.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <RadioGroup label="Show" name="scope" options={SCOPES} value={scope} onChange={(v) => setScope(v?.target ? v.target.value : v)} />
          <Button icon={FileBarChart} loading={loading} onClick={generate}>Generate report</Button>
          {data?.faculties?.length > 0 && (
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" icon={Download} onClick={exportCsv}>Excel (CSV)</Button>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            </div>
          )}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={generate} />
      ) : !data ? (
        <EmptyState icon={FileBarChart} title="No report yet" message="Choose the year and quarters, then click Generate report." />
      ) : !data.faculties.length ? (
        <EmptyState icon={FileBarChart} title="Nothing found" message={`No external faculty batch in ${period}.`} />
      ) : (
        <div className="report rounded-xl border border-ink-200 bg-white p-4 print-full">
          <h2 className="text-[15px] font-bold tracking-wide text-ink-900">EXTERNAL FACULTY REPORT - {period}</h2>
          <p className="mb-3 text-[12px] text-ink-600">{data.faculties.length} external facult{data.faculties.length === 1 ? 'y' : 'ies'} · {data.batchCount} batch(es) · {whole ? 'Whole record' : 'Batches only'}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Batch Name</th>
                  <th className={th}>Start Date</th>
                  <th className={th}>End Date</th>
                  <th className={th}>Course Name</th>
                  <th className={th}>Course ID</th>
                  <th className={th}>Quarter</th>
                  {whole && <th className={th}>Certifications</th>}
                </tr>
              </thead>
              <tbody>
                {data.faculties.map((f) => {
                  const list = f.batches.length ? f.batches : [null];
                  return list.map((b, i) => (
                    <tr key={`${f.facultyId}-${i}`}>
                      {i === 0 && (
                        <td rowSpan={list.length} className={`${td} font-medium`}>
                          {f.name}
                          <div className="text-[11px] font-normal text-ink-500">{[f.phone, f.email, f.personalEmail].filter(Boolean).join(' · ')}</div>
                          {(f.certificationId || f.courseName) && <div className="text-[11px] font-normal text-ink-500">{[f.certificationId, f.courseName].filter(Boolean).join(' · ')}</div>}
                        </td>
                      )}
                      {b ? (
                        <>
                          <td className={td}>{b.batchNo}</td>
                          <td className={`${td} whitespace-nowrap`}>{formatDate(b.startDate)}</td>
                          <td className={`${td} whitespace-nowrap`}>{b.endDate ? formatDate(b.endDate) : '–'}</td>
                          <td className={td}>{b.courseName || '–'}</td>
                          <td className={td}>{b.courseId}</td>
                          <td className={td}>{b.quarters.join(' ')}</td>
                        </>
                      ) : (
                        <td className={`${td} text-ink-500`} colSpan={6}>No batch in this period</td>
                      )}
                      {whole && i === 0 && (
                        <td rowSpan={list.length} className={td}>
                          {f.certifications.length ? f.certifications.map((c) => (
                            <div key={c.id}>
                              {c.name || c.certificationId || c.id}{c.certificationId && c.name ? ` (${c.certificationId})` : ''} · <b className={c.status === 'Current' ? 'text-success-700' : 'text-ink-500'}>{c.status}</b>
                              {c.expiryDate && <span className="text-ink-500"> · exp {formatDate(c.expiryDate)}</span>}
                            </div>
                          )) : '–'}
                        </td>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
