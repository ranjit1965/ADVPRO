import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, CalendarCheck, Coffee, GraduationCap, FilePlus2, FileText, ListChecks, Printer, AlertTriangle, ArrowRight, Users } from 'lucide-react';
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
import { canAccess, makesEntries, MASTER_ROLES } from '../utils/permissions';
import UploadReminder from '../components/UploadReminder';
import CertificationTargets from '../components/dashboard/CertificationTargets';
import { useAsync } from '../hooks/useAsync';
import { getDashboardSummary, HR_ROLES } from '../services/api';
import CelebrationReminder from '../components/dashboard/CelebrationReminder';
import WeekOffIncentive from '../components/dashboard/WeekOffIncentive';
import { ACTIVITY_LABEL } from '../utils/constants';
import { formatDate, formatDuration, formatTime, personLabel } from '../utils/format';
import { entrySummary } from '../utils/entry';

/** Total hours only, e.g. "18h 30m". */
const hrs = (t) => formatDuration(t?.minutes || 0);
const days = (n) => `${n ?? 0} day${n === 1 ? '' : 's'}`;

const QUICK_ACTIONS = [
  { label: 'New daily entry', icon: FilePlus2, to: '/faculty/daily-activity/entry' },
  { label: 'My entries', icon: ListChecks, to: '/faculty/daily-activity/history' },
  { label: 'Print activity', icon: Printer, to: '/faculty/daily-activity/print' },
  { label: 'Monthly report', icon: FileText, to: '/faculty/reports/monthly' },
];

/** HR, Admin and Super Admin pick only from the Faculty and Lab Support people. */
const LAB_SUPPORT = /lab\s*_?support/i;
const isDashboardPerson = (p) => p.role === 'FACULTY' || LAB_SUPPORT.test(p.role || '') || LAB_SUPPORT.test(p.roleLabel || '');

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};


export default function Dashboard() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // HR, Admin and Super Admin do not make entries: they only view a Faculty or Lab Support person's dashboard.
  const viewAll = !makesEntries(user);
  const people = (lookups?.employees || []).filter(isDashboardPerson);
  const picked = viewAll ? params.get('code') : null;
  const other = picked && picked !== user.code ? people.find((p) => p.code === picked) || { code: picked, name: picked } : null;
  const target = other || user;
  const { data, loading, error, reload } = useAsync(() => (viewAll && !other ? Promise.resolve(null) : getDashboardSummary(target.code)), [target.code, viewAll]);
  const pickPerson = (code) => setParams(code && code !== user.code ? { code } : {});

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const picker = viewAll && (
    <div className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <Select
        label="View dashboard of"
        className="w-full sm:w-80"
        searchable
        placeholder="Select a faculty or lab support person"
        options={people.map((p) => ({ value: p.code, label: `${personLabel(p)}` }))}
        value={other ? other.code : ''}
        onChange={(e) => pickPerson(e.target.value)}
      />
      <p className="pb-2 text-[13px] text-ink-600">{other ? `Showing ${other.name}'s entries and hours.` : 'Pick a faculty or lab support person to see their dashboard.'}</p>
    </div>
  );

  if (viewAll && !other) {
    return (
      <>
        {HR_ROLES.includes(user.role) && <CelebrationReminder />}
        {canAccess(user, MASTER_ROLES) && <UploadReminder />}
        <PageHeader title={`${greeting()}, ${user.name}`} description={formatDate(new Date())} />
        {picker}
        <Card>
          <EmptyState icon={Users} title="Select a person" message="Choose a faculty or lab support person above to view their dashboard, hours and recent entries." />
        </Card>
      </>
    );
  }

  const recentColumns = [
    { key: 'activityDate', header: 'Date', render: (r) => formatDate(r.activityDate) },
    { key: 'activityType', header: 'Activity', render: (r) => <span className="font-medium text-ink-900">{ACTIVITY_LABEL[r.activityType]}</span> },
    { key: 'summary', header: 'Details', render: (r) => <span className="line-clamp-1 max-w-xs">{entrySummary(r)}</span> },
    { key: 'time', header: 'Time', render: (r) => `${formatTime(r.timeFrom)} – ${formatTime(r.timeTo)}` },
  ];

  return (
    <>
      {!other && HR_ROLES.includes(user.role) && <CelebrationReminder />}
      {!other && canAccess(user, MASTER_ROLES) && <UploadReminder />}
      {user.adminAccessRemoved && (
        <div className="mb-5 rounded-xl border border-warning-600/25 bg-warning-50 px-4 py-3 text-[13px] text-warning-700" role="status">
          Your Admin access was removed by the Super Admin. You can still enter and see your own work. Ask the Super Admin to give it back.
        </div>
      )}
      <PageHeader
        title={other ? `${other.name}'s dashboard` : `${greeting()}, ${user.name}`}
        description={other ? `${formatDate(new Date())} · ${other.roleLabel || other.role || ''} · Code ${other.code}` : `${formatDate(new Date())} · ${user.roleLabel || user.role} · ${user.code}${user.employeeId ? ` · ${user.employeeId}` : ''}`}
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

      {picker}

      <CertificationTargets employeeCode={target.code} canUpdate={HR_ROLES.includes(user.role)} />

      {data?.missingDays?.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning-600/25 bg-warning-50 px-4 py-3 text-[13px] text-warning-700" role="status">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p className="flex-1">
            {other ? `${other.name} needs to enter the daily entries of the remaining working days this month.` : 'You need to enter your daily entries for the remaining working days this month.'}
          </p>
          {!other && <Link to={`/faculty/daily-activity/entry?date=${data.missingDays[0]}`} className="font-semibold underline-offset-2 hover:underline">
            Add entry
          </Link>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* This month in large type; all time underneath. */}
        <StatCard label="Days with entries" value={days(data?.month?.days)} sub={`This month · all time ${days(data?.allTime?.days)}`} icon={CalendarCheck} tone="success" loading={loading} onClick={other ? undefined : () => navigate('/faculty/daily-activity/history')} />
        <StatCard label="Total class taken" value={hrs(data?.month?.class)} sub={`This month · all time ${hrs(data?.allTime?.class)}`} icon={GraduationCap} loading={loading} />
        <StatCard label="Total course preparation" value={hrs(data?.month?.learning)} sub={`This month · all time ${hrs(data?.allTime?.learning)}`} icon={BookOpen} tone="info" loading={loading} />
        <StatCard label="Total Others time" value={hrs(data?.month?.others)} sub={`This month · all time ${hrs(data?.allTime?.others)}`} icon={Coffee} tone="warning" loading={loading} />
      </div>

      <WeekOffIncentive code={target.code} own={!other} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Activity mix this month" description="Hours by activity type" className="xl:col-span-2">
          {loading || !data ? (
            <Skeleton className="h-60 w-full" />
          ) : data.byType.length === 0 ? (
            <EmptyState title="No activity this month" />
          ) : (
            <SimpleBarChart data={[...data.byType].sort((a, b) => b.hours - a.hours)} layout="vertical" xKey="type" yKey="hours" xFormatter={(k) => ACTIVITY_LABEL[k]} height={Math.max(180, data.byType.length * 34)} />
          )}
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
