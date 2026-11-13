import { useEffect, useState } from 'react';
import { NavLink, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock3, Download, Gauge, FileBarChart, FileSpreadsheet, FileText, Printer, Users, StickyNote } from 'lucide-react';
import { useMemo } from 'react';
import MonthlyReportView from '../components/report/MonthlyReportView';
import { buildMonthlyReport } from '../utils/monthlyReport';
import { downloadMonthlyExcel } from '../utils/monthlyExcel';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import StatCard from '../components/ui/StatCard';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Loading';
import SimpleBarChart from '../components/charts/BarChartCard';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import * as api from '../services/api';
import { ACTIVITY_LABEL, ACTIVITY_TYPES, FACULTY_IN_OPTIONS, NON_PERFORMANCE_TYPES, facultyInLabel } from '../utils/constants';
import { formatDate, formatDuration, formatTime, monthLabel, toISODate } from '../utils/format';
import { entrySummary } from '../utils/entry';
import { downloadCsv } from '../utils/export';
import { cn } from '../utils/cn';
import { canAccess, PEOPLE_VIEW_ROLES, WORKING_HOURS_ROLES } from '../utils/permissions';
import { ShieldAlert } from 'lucide-react';

const REPORTS = {
  monthly: { title: 'Monthly Report', description: 'Activity summary for a faculty member or employee for the selected month.' },
  'working-hours': { roles: WORKING_HOURS_ROLES, title: 'Monthly Working Hrs Report', description: 'Working hours per employee and faculty, split by Center and College / OD.' },
};

const hrs = (m) => +(m / 60).toFixed(1);

export default function Reports() {
  const { type } = useParams();
  const { user } = useAuth();
  const { lookups } = useLookups();
  const toast = useToast();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ month: toISODate().slice(0, 7), facultyCode: (canAccess(user, PEOPLE_VIEW_ROLES) && params.get('code')) || user.code, teamFaculty: '', activityType: '', facultyIn: '' });
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const [generated, setGenerated] = useState({ month: '', facultyCode: '' });
  const report = useMemo(() => (type === 'monthly' && state.data && generated.month ? buildMonthlyReport(state.data.rows, generated.month, lookups?.courses) : null), [type, state.data, generated, lookups]);
  const viewAll = canAccess(user, PEOPLE_VIEW_ROLES);
  const people = lookups?.employees?.length ? lookups.employees : lookups?.faculties || [];
  const reportFaculty = people.find((f) => f.code === generated.facultyCode) || lookups?.faculties?.find((f) => f.code === generated.facultyCode) || (user.code === generated.facultyCode ? user : null);

  const run = async () => {
    if (!filters.month) return toast.error('Select a month');
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const fn = type === 'monthly' ? api.getMonthlyReport : api.getWorkingHoursReport;
      const facultyCode = type === 'monthly' ? filters.facultyCode : filters.teamFaculty;
      if (type === 'monthly' && !facultyCode) throw new Error('Select a faculty for the monthly report.');
      const data = await fn({ ...filters, facultyCode });
      setGenerated({ month: filters.month, facultyCode });
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e.message });
    }
  };

  // Generate on open and when switching between reports.
  useEffect(() => {
    setState({ data: null, loading: false, error: null });
    if (REPORTS[type] && canAccess(user, REPORTS[type].roles)) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  if (!REPORTS[type]) return <Navigate to="/faculty/reports/monthly" replace />;
  const meta = REPORTS[type];
  if (!canAccess(user, meta.roles)) {
    return (
      <>
        <PageHeader title={meta.title} breadcrumb={[{ label: 'Faculty' }, { label: meta.title }]} />
        <Card>
          <EmptyState icon={ShieldAlert} title="Access restricted" message="The Monthly Working Hrs Report is available to HR, Admin and Manager accounts only." />
        </Card>
      </>
    );
  }
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const downloadExcel = async () => {
    try {
      await downloadMonthlyExcel(report, reportFaculty, lookups?.courses, state.data?.biometric);
      toast.success('Excel report downloaded.');
    } catch (e) {
      toast.error(`Could not create the Excel file: ${e.message}`);
    }
  };
  // HR, Admin and Manager pick anyone; faculty and staff only see their own report.
  const facultyOpts = viewAll
    ? people.map((f) => ({ value: f.code, label: `${f.name} (${f.code})${f.role && f.role !== 'FACULTY' ? ` · ${f.role}` : ''}` }))
    : [{ value: user.code, label: `${user.name} (${user.code})` }];

  const exportCsv = () => {
    const d = state.data;
    if (!d) return;
    const file = `${type}-report-${filters.month}.csv`;
    if (type === 'monthly') {
      downloadCsv(
        file,
        [
          { header: 'Date', value: (r) => formatDate(r.activityDate) },
          { header: 'Activity', value: (r) => ACTIVITY_LABEL[r.activityType] },
          { header: 'Faculty in', value: (r) => facultyInLabel(r.facultyIn) },
          { header: 'Time From', value: (r) => r.timeFrom },
          { header: 'Time To', value: (r) => r.timeTo },
          { header: 'Hours', value: (r) => hrs(r.minutes) },
          { header: 'Details', value: (r) => entrySummary(r) },
          { header: 'Section', value: (r) => (NON_PERFORMANCE_TYPES.includes(r.activityType) ? 'Others (not performance)' : 'Activity') },
        ],
        d.rows,
      );
    } else if (type === 'working-hours') {
      downloadCsv(
        file,
        [
          { header: 'Employee', value: (r) => `${r.facultyName} (${r.facultyCode})` },
          { header: 'Role', value: (r) => r.role || 'FACULTY' },
          { header: 'Days', value: (r) => r.days },
          { header: 'Entries', value: (r) => r.entries },
          { header: 'Class hrs', value: (r) => hrs(r.classMinutes) },
          { header: 'Center hrs', value: (r) => hrs(r.centerMinutes) },
          { header: 'College / OD hrs', value: (r) => hrs(r.outstationMinutes) },
          { header: 'Performance hrs', value: (r) => hrs(r.performanceMinutes) },
          { header: 'Others hrs', value: (r) => hrs(r.othersMinutes) },
          { header: 'Total hrs', value: (r) => hrs(r.totalMinutes) },
        ],
        d.rows,
      );
    }
    toast.success('Report exported to CSV.');
  };

  return (
    <>
      <PageHeader
        title={meta.title}
        breadcrumb={[{ label: 'Faculty' }, { label: meta.title }]}
        description={meta.description}
        actions={
          type === 'monthly' ? (
            <>
              <Button variant="secondary" icon={FileText} onClick={() => window.print()} disabled={!state.data} title="Opens the print dialog; choose Save as PDF">
                Download PDF
              </Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={downloadExcel} disabled={!state.data}>
                Download Excel
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!state.data}>
                Print
              </Button>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!state.data}>
                Export
              </Button>
            </>
          )
        }
      />

      {Object.values(REPORTS).filter((r) => canAccess(user, r.roles)).length > 1 && <nav className="no-print mb-5 flex flex-wrap gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-card sm:inline-flex" aria-label="Report type">
        {Object.entries(REPORTS).filter(([, r]) => canAccess(user, r.roles)).map(([key, r]) => (
          <NavLink key={key} to={`/faculty/reports/${key}`} className={({ isActive }) => cn('flex-1 rounded-lg px-3 py-1.5 text-center text-[13px] font-medium whitespace-nowrap sm:flex-none', isActive ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50')}>
            {r.title.replace('Monthly ', '')}
          </NavLink>
        ))}
      </nav>}

      <Card className="no-print mb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Input label="Month" type="month" required value={filters.month} max={toISODate().slice(0, 7)} onChange={set('month')} />
          <Select
            searchable={viewAll}
            label={viewAll ? 'Faculty / Employee' : 'Faculty'}
            placeholder={type === 'monthly' ? (viewAll ? 'Select a person' : null) : 'Everyone'}
            options={facultyOpts}
            disabled={!viewAll}
            value={type === 'monthly' ? filters.facultyCode : filters.teamFaculty}
            onChange={set(type === 'monthly' ? 'facultyCode' : 'teamFaculty')}
          />
          {type === 'monthly' && (
            <>
              <Select label="Activity" placeholder="All activities" options={ACTIVITY_TYPES.map((a) => ({ value: a.key, label: a.label }))} value={filters.activityType} onChange={set('activityType')} />
              <Select label="Faculty in" placeholder="All" sort={false} options={FACULTY_IN_OPTIONS} value={filters.facultyIn} onChange={set('facultyIn')} />
            </>
          )}
          <Button type="submit" icon={FileBarChart} loading={state.loading} className="lg:col-start-5">
            Generate Report
          </Button>
        </form>
      </Card>

      {state.error && (
        <Card>
          <ErrorState message={state.error} onRetry={run} />
        </Card>
      )}
      {!state.error && type === 'monthly' && <MonthlyView data={state.data} loading={state.loading} month={filters.month} report={report} faculty={reportFaculty} courses={lookups?.courses} />}
      {!state.error && type === 'working-hours' && <WorkingHoursView data={state.data} loading={state.loading} month={filters.month} />}
    </>
  );
}

function MonthlyView({ data, loading, report, faculty, courses }) {
  if (loading || !report) {
    return (
      <Card>
        <Skeleton className="h-96" />
      </Card>
    );
  }
  if (!report.kpi.entries) {
    return (
      <Card>
        <EmptyState title="No entries for this month" message="Choose another month or faculty." />
      </Card>
    );
  }
  return (
    <div className="print-full overflow-hidden rounded-xl border border-ink-200 shadow-card">
      <MonthlyReportView report={report} faculty={faculty} courses={courses || []} biometric={data?.biometric} />
    </div>
  );
}

function WorkingHoursView({ data, loading, month }) {
  const busy = loading || !data;
  const rows = data?.rows || [];
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="People" value={rows.length} sub="Employees and faculty" icon={Users} loading={busy} />
        <StatCard label="Total working time" value={formatDuration(sum('totalMinutes'))} icon={Clock3} tone="info" loading={busy} />
        <StatCard label="Performance time" value={formatDuration(sum('performanceMinutes'))} sub="All activities except Others" icon={Gauge} tone="accent" loading={busy} />
        <StatCard label="Others time" value={formatDuration(sum('othersMinutes'))} sub="Not part of performance" icon={StickyNote} tone="warning" loading={busy} />
      </div>
      <Card title="Total hours per person" description={monthLabel(month)}>
        {busy ? (
          <Skeleton className="h-60" />
        ) : (
          <SimpleBarChart data={[...rows].sort((a, b) => b.totalMinutes - a.totalMinutes).map((r) => ({ name: r.facultyName, hours: hrs(r.totalMinutes) }))} layout="vertical" xKey="name" yKey="hours" height={Math.max(160, rows.length * 34)} />
        )}
      </Card>
      <Card title="Working hours" bodyClassName="p-0">
        <DataTable
          loading={busy}
          rows={rows}
          rowKey="facultyCode"
          columns={[
            { key: 'facultyName', header: 'Employee', render: (r) => <span className="font-medium whitespace-nowrap text-ink-900">{`${r.facultyName} (${r.facultyCode})`}</span> },
            { key: 'role', header: 'Role', render: (r) => <span className="text-xs text-ink-500">{r.role || 'FACULTY'}</span> },
            { key: 'days', header: 'Days', align: 'right' },
            { key: 'entries', header: 'Entries', align: 'right' },
            { key: 'classMinutes', header: 'Class', align: 'right', render: (r) => formatDuration(r.classMinutes) },
            { key: 'centerMinutes', header: 'Center', align: 'right', render: (r) => formatDuration(r.centerMinutes) },
            { key: 'outstationMinutes', header: 'College / OD', align: 'right', render: (r) => formatDuration(r.outstationMinutes) },
            { key: 'performanceMinutes', header: 'Performance', align: 'right', render: (r) => formatDuration(r.performanceMinutes) },
            { key: 'othersMinutes', header: 'Others', align: 'right', render: (r) => formatDuration(r.othersMinutes) },
            { key: 'totalMinutes', header: 'Total', align: 'right', render: (r) => <b className="text-ink-900">{formatDuration(r.totalMinutes)}</b> },
          ]}
          footer={
            <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-900">
              <td className="px-4 py-3">Total</td>
              <td />
              <td className="px-4 py-3 text-right" />
              <td className="px-4 py-3 text-right tabular-nums">{sum('entries')}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('classMinutes'))}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('centerMinutes'))}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('outstationMinutes'))}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('performanceMinutes'))}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('othersMinutes'))}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDuration(sum('totalMinutes'))}</td>
            </tr>
          }
        />
      </Card>
    </div>
  );
}
