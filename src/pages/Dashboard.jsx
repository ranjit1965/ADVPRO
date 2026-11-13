import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckCircle2, ClipboardList, Clock3, FilePlus2, FileText, ListChecks, Printer, CalendarRange, AlertTriangle, ArrowRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Loading';
import SimpleBarChart from '../components/charts/BarChartCard';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupsContext';
import Select from '../components/ui/Select';
import { canAccess, MASTER_ROLES, PEOPLE_VIEW_ROLES } from '../utils/permissions';
import UploadReminder from '../components/UploadReminder';
import CertificationTargets from '../components/dashboard/CertificationTargets';
import { useAsync } from '../hooks/useAsync';
import { getDashboardSummary } from '../services/api';
import { ACTIVITY_LABEL } from '../utils/constants';
import { formatDate, formatDuration, formatTime, parseISODate } from '../utils/format';
import { entrySummary } from '../utils/entry';

const QUICK_ACTIONS = [
  { label: 'New daily entry', icon: FilePlus2, to: '/faculty/daily-activity/entry' },
  { label: 'My entries', icon: ListChecks, to: '/faculty/daily-activity/history' },
  { label: 'Print activity', icon: Printer, to: '/faculty/daily-activity/print' },
  { label: 'Monthly plan', icon: CalendarRange, to: '/faculty/monthly-plan' },
  { label: 'Monthly report', icon: FileText, to: '/faculty/reports/monthly' },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const weekday = (iso) => parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short' });

export default function Dashboard() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // HR, Admin and Manager can open any employee's or faculty member's dashboard.
  const viewAll = canAccess(user, PEOPLE_VIEW_ROLES);
  const people = lookups?.employees || [];
  const picked = viewAll ? params.get('code') : null;
  const other = picked && picked !== user.code ? people.find((p) => p.code === picked) || { code: picked, name: picked } : null;
  const target = other || user;
  const { data, loading, error, reload } = useAsync(() => getDashboardSummary(target.code), [target.code]);
  const pickPerson = (code) => setParams(code && code !== user.code ? { code } : {});

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const recentColumns = [
    { key: 'activityDate', header: 'Date', render: (r) => formatDate(r.activityDate) },
    { key: 'activityType', header: 'Activity', render: (r) => <span className="font-medium text-ink-900">{ACTIVITY_LABEL[r.activityType]}</span> },
    { key: 'summary', header: 'Details', render: (r) => <span className="line-clamp-1 max-w-xs">{entrySummary(r)}</span> },
    { key: 'time', header: 'Time', render: (r) => `${formatTime(r.timeFrom)} – ${formatTime(r.timeTo)}` },
  ];

  return (
    <>
      {!other && canAccess(user, MASTER_ROLES) && <UploadReminder />}
      <PageHeader
        title={other ? `${other.name}'s dashboard` : `${greeting()}, ${user.name}`}
        description={other ? `${formatDate(new Date())} · ${other.role || ''}${other.designation && other.designation !== other.role ? ` · ${other.designation}` : ''} · Code ${other.code}` : `${formatDate(new Date())} · ${user.designation} · Grade ${user.grade}`}
        actions={
          other ? (
            <Button variant="secondary" icon={FileText} onClick={() => navigate(`/faculty/reports/monthly?code=${encodeURIComponent(other.code)}`)}>
              Monthly report
            </Button>
          ) : (
            <Button icon={FilePlus2} onClick={() => navigate('/faculty/daily-activity/entry')}>
              New daily entry
            </Button>
          )
        }
      />

      {viewAll && (
        <div className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <Select
            label="View dashboard of"
            className="w-full sm:w-80"
            searchable
            placeholder={`My dashboard (${user.name})`}
            options={people.filter((p) => p.code !== user.code).map((p) => ({ value: p.code, label: `${p.name} (${p.code}) · ${p.role}` }))}
            value={other ? other.code : ''}
            onChange={(e) => pickPerson(e.target.value)}
          />
          <p className="pb-2 text-[13px] text-ink-600">{other ? `Showing ${other.name}'s entries and hours.` : 'Pick a faculty member or employee to see their dashboard.'}</p>
          {other && (
            <button type="button" className="mb-2 text-[13px] font-medium text-brand-700 hover:underline" onClick={() => pickPerson('')}>
              Back to my dashboard
            </button>
          )}
        </div>
      )}

      <CertificationTargets employeeCode={target.code} own={!other} />

      {data?.missingDays?.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning-600/25 bg-warning-50 px-4 py-3 text-[13px] text-warning-700" role="status">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p className="flex-1">
            <b>{data.missingDays.length} working day(s)</b> this month have no activity entry{other ? ` from ${other.name}` : ''}: {data.missingDays.slice(0, 5).map(formatDate).join(', ')}
            {data.missingDays.length > 5 && '…'}
          </p>
          {!other && <Link to={`/faculty/daily-activity/entry?date=${data.missingDays[0]}`} className="font-semibold underline-offset-2 hover:underline">
            Add entry
          </Link>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's entries" value={data?.todayEntries ?? 0} sub={formatDate(new Date())} icon={ClipboardList} loading={loading} onClick={other ? undefined : () => navigate('/faculty/daily-activity/entry')} />
        <StatCard label="Worked hours today" value={formatDuration(data?.todayMinutes)} sub="Sum of Time From to Time To" icon={Clock3} tone="info" loading={loading} />
        <StatCard label="Worked hours this month" value={formatDuration(data?.monthTotalMinutes)} sub="All activities, Others included" icon={AlarmClock} tone="warning" loading={loading} />
        <StatCard label="Total entries" value={data?.totalEntries ?? 0} sub="All time" icon={CheckCircle2} tone="success" loading={loading} onClick={other ? undefined : () => navigate('/faculty/daily-activity/history')} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Worked hours, last 7 days" description="Worked hours per day" className="xl:col-span-2">
          {loading ? <Skeleton className="h-60 w-full" /> : <SimpleBarChart data={data.last7} xKey="date" yKey="hours" xFormatter={weekday} labelFormatter={formatDate} />}
        </Card>

        <Card title={other ? `${other.name} this month` : 'Quick actions'}>
          {other ? (
            <dl className="space-y-2 text-[13px]">
              {[
                ['Entries this month', data?.monthEntries ?? 0],
                ['Worked hours this month', formatDuration(data?.monthTotalMinutes)],
                ['Days without entry', data?.missingDays?.length ?? 0],
                ['Total entries', data?.totalEntries ?? 0],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-ink-100 pb-2 last:border-0">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="font-semibold text-ink-900 tabular-nums">{loading ? '…' : v}</dd>
                </div>
              ))}
            </dl>
          ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.to} to={a.to} className="group flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5 font-medium text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800">
                <a.icon className="size-4 text-ink-400 group-hover:text-brand-600" aria-hidden />
                <span className="flex-1">{a.label}</span>
                <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </Link>
            ))}
          </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Today's activity" description={formatDate(new Date())}>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : data.todayList.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nothing logged today"
              message={other ? `${other.name} has not logged any activity today.` : 'Record your first activity for today.'}
              action={
                !other && <Button size="sm" icon={FilePlus2} onClick={() => navigate('/faculty/daily-activity/entry')}>
                  Add entry
                </Button>
              }
            />
          ) : (
            <ol className="relative space-y-4 border-l border-ink-200 pl-5">
              {data.todayList.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-brand-600 ring-4 ring-white" aria-hidden />
                  <Link to={`/entries/${e.id}`} className="block rounded-lg hover:bg-ink-50">
                    <p className="text-xs text-ink-500 tabular-nums">
                      {formatTime(e.timeFrom)} – {formatTime(e.timeTo)} · {formatDuration(e.minutes)}
                    </p>
                    <p className="font-medium text-ink-900">{ACTIVITY_LABEL[e.activityType]}</p>
                    <p className="line-clamp-1 text-[13px] text-ink-600">{entrySummary(e)}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Activity mix this month" description="Hours by activity type" className="xl:col-span-2">
          {loading ? (
            <Skeleton className="h-60 w-full" />
          ) : data.byType.length === 0 ? (
            <EmptyState title="No activity this month" />
          ) : (
            <SimpleBarChart data={[...data.byType].sort((a, b) => b.hours - a.hours)} layout="vertical" xKey="type" yKey="hours" xFormatter={(k) => ACTIVITY_LABEL[k]} height={Math.max(180, data.byType.length * 34)} />
          )}
        </Card>
      </div>

      <Card
        title="Recent entries"
        className="mt-5"
        bodyClassName="p-0"
        actions={
          !other && (
            <Link to="/faculty/daily-activity/history" className="text-[13px] font-medium text-brand-700 hover:underline">
              View all
            </Link>
          )
        }
      >
        <DataTable columns={recentColumns} rows={data?.recent || []} loading={loading} onRowClick={(r) => navigate(`/entries/${r.id}`)} empty={<EmptyState title="No entries yet" />} />
      </Card>
    </>
  );
}
