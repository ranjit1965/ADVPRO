import { useMemo, useState } from 'react';
import { Download, FileBarChart, Printer } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useLookups } from '../../context/LookupsContext';
import { formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/export';
import { monthTitle, thisMonth } from '../../components/attendance/AttendanceSheet';

/**
 * External Faculty › Generate Report (v55): choose the month (and a batch status, optional), click Generate:
 * each external faculty with the batches that run in that month. Print or download as CSV (opens in Excel).
 */
export default function ExternalFacultyReport() {
  const { lookups } = useLookups();
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getExternalFacultyReport(month, status));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    const out = [];
    for (const r of data?.rows || []) {
      const last = out[out.length - 1];
      if (last && last.facultyId === r.facultyId) last.rows.push(r);
      else out.push({ facultyId: r.facultyId, name: r.facultyName, phone: r.phone, email: r.email, rows: [r] });
    }
    return out;
  }, [data]);

  const exportCsv = () =>
    downloadCsv(`external-faculty-report-${data.month}.csv`, [
      { header: 'External Faculty', value: (r) => r.facultyName },
      { header: 'Phone', value: (r) => r.phone },
      { header: 'Email', value: (r) => r.email },
      { header: 'Batch No', value: (r) => r.batchNo },
      { header: 'Course', value: (r) => `${r.courseId} ${r.courseName}`.trim() },
      { header: 'Start Date', value: (r) => formatDate(r.startDate) },
      { header: 'End Date', value: (r) => (r.endDate ? formatDate(r.endDate) : '') },
      { header: 'Timing', value: (r) => r.timing },
      { header: 'Mode', value: (r) => r.mode },
      { header: 'Class Mode', value: (r) => r.classMode },
      { header: 'Status', value: (r) => r.status },
    ], data.rows);

  const th = 'border border-ink-300 px-2 py-1.5 text-left font-semibold';
  const td = 'border border-ink-300 px-2 py-1 align-top';
  return (
    <>
      <div className="no-print">
        <PageHeader
          title="External Faculty Report"
          breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'External Faculty', to: '/master/externalFaculty' }, { label: 'Report' }]}
          description="Batches handled by external faculty in a month. Choose the month and, if needed, the batch status, then Generate."
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input label="Month" type="month" className="w-48" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <Select label="Batch status" className="w-48" sort={false} placeholder="All statuses" options={lookups?.batchStatuses || []} value={status} onChange={(e) => setStatus(e.target.value)} />
          <Button icon={FileBarChart} loading={loading} onClick={generate}>Generate report</Button>
          {data?.rows?.length > 0 && (
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
        <EmptyState icon={FileBarChart} title="No report yet" message="Choose the month and click Generate report." />
      ) : !data.rows.length ? (
        <EmptyState icon={FileBarChart} title="No batches" message={`No external faculty batch in ${monthTitle(data.month).toLowerCase()}${data.status ? ` with status ${data.status}` : ''}.`} />
      ) : (
        <div className="report rounded-xl border border-ink-200 bg-white p-4 print-full">
          <h2 className="text-[15px] font-bold tracking-wide text-ink-900">EXTERNAL FACULTY REPORT - {monthTitle(data.month)}</h2>
          <p className="mb-3 text-[12px] text-ink-600">
            {data.faculty} external facult{data.faculty === 1 ? 'y' : 'ies'} · {data.rows.length} batch(es){data.status ? ` · Status: ${data.status}` : ' · All statuses'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>External Faculty</th>
                  <th className={th}>Batch No</th>
                  <th className={th}>Course</th>
                  <th className={th}>Start Date</th>
                  <th className={th}>End Date</th>
                  <th className={th}>Timing</th>
                  <th className={th}>Mode</th>
                  <th className={th}>Class Mode</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) =>
                  g.rows.map((r, i) => (
                    <tr key={`${g.facultyId}-${r.batchNo}-${i}`}>
                      {i === 0 && (
                        <td rowSpan={g.rows.length} className={`${td} font-medium`}>
                          {g.name}
                          <div className="text-[11px] font-normal text-ink-500">{[g.phone, g.email].filter(Boolean).join(' · ')}</div>
                          <div className="text-[11px] font-normal text-ink-500">{g.rows.length} batch(es)</div>
                        </td>
                      )}
                      <td className={td}>{r.batchNo}</td>
                      <td className={td}>{r.courseId}{r.courseName && ` – ${r.courseName}`}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(r.startDate)}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.endDate ? formatDate(r.endDate) : '–'}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.timing}</td>
                      <td className={td}>{r.mode}</td>
                      <td className={td}>{r.classMode}</td>
                      <td className={td}>{r.status}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
