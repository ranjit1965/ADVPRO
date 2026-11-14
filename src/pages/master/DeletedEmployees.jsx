import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArchiveRestore, UserX } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { hasSection } from '../../utils/permissions';
import { formatDate, formatDateTime, formatDuration } from '../../utils/format';
import { ACTIVITY_LABEL } from '../../utils/constants';
import { cn } from '../../utils/cn';

const COLLECTION_LABEL = { daily_entries: 'Daily entries', leave_requests: 'Leave / permission', halfyearly_reports: 'Halfyearly reports', work_assignments: 'Work assignments', biometric_days: 'Biometric days' };

/** Master › Deleted Employees: who was deleted, with the entries and records saved with them, and Restore. */
export default function DeletedEmployees() {
  const { user } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setError('');
    api.getDeletedUsers().then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const selected = userId || rows?.[0]?.userId || '';
  useEffect(() => {
    if (!selected) return setDetail(null);
    setDetailLoading(true);
    api
      .getDeletedUser(selected)
      .then(setDetail)
      .catch((e) => {
        toast.error(e.message);
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return !rows ? [] : s ? rows.filter((r) => [r.userId, r.code, r.name, r.role].some((v) => String(v || '').toLowerCase().includes(s))) : rows;
  }, [rows, q]);

  if (!hasSection(user, 'master')) {
    return (
      <>
        <PageHeader title="Deleted Employees" />
        <Card><p className="text-sm text-ink-600">Access restricted. Ask the Manager for the Master menu.</p></Card>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <PageLoader />;

  const restore = async () => {
    const e = detail.employee;
    if (!(await confirm({ title: 'Restore employee', message: `Restore ${e.name} (${e.userId})? They become Active, can sign in again, and their entries and records go back into the reports.`, confirmLabel: 'Restore' }))) return;
    setRestoring(true);
    try {
      await api.restoreUser(e.userId);
      toast.success(`${e.name} restored with their entries.`);
      setRows((list) => list.filter((r) => r.userId !== e.userId));
      navigate('/master/deleted-employees', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestoring(false);
    }
  };

  const entryColumns = [
    { key: 'activityDate', header: 'Date', render: (r) => formatDate(r.activityDate) },
    { key: 'time', header: 'Time', render: (r) => `${r.timeFrom}–${r.timeTo}` },
    { key: 'minutes', header: 'Hours', align: 'right', render: (r) => formatDuration(r.minutes) },
    { key: 'activityType', header: 'Activity', render: (r) => ACTIVITY_LABEL[r.activityType] || r.activityType },
    { key: 'facultyIn', header: 'In', hideOnMobile: true },
    { key: 'id', header: 'Entry No', hideOnMobile: true },
  ];
  const totalMinutes = detail?.entries.reduce((s, e) => s + (e.minutes || 0), 0) || 0;
  const emp = detail?.employee;

  return (
    <>
      <PageHeader
        title="Deleted Employees"
        description="Employees deleted in Master › Employees, with the daily entries and records that were moved with them. Restore brings the employee and all their records back."
        breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Deleted Employees' }]}
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={UserX} title="No deleted employees" message="Employees you delete appear here with their entries." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
          <Card title={`Deleted (${rows.length})`} bodyClassName="p-2">
            <div className="px-2 pb-2">
              <Input label="Search" placeholder="Name, user ID, code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="space-y-1">
              {filtered.map((r) => (
                <li key={r.userId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/master/deleted-employees/${encodeURIComponent(r.userId)}`)}
                    className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ink-50', r.userId === selected && 'bg-brand-50 text-brand-800 hover:bg-brand-50')}
                  >
                    <span className="font-semibold">{r.name} ({r.code})</span>
                    <span className="block truncate text-xs text-ink-500">{r.role} · deleted {formatDateTime(r.deletedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-5">
            {detailLoading || !detail ? (
              <Card><PageLoader /></Card>
            ) : (
              <>
                <Card
                  title={`${emp.name} (${emp.code})`}
                  description={`Deleted ${formatDateTime(emp.deletedAt)}${emp.deletedBy ? ` by ${emp.deletedBy}` : ''}`}
                  actions={<Button icon={ArchiveRestore} loading={restoring} onClick={restore}>Restore</Button>}
                >
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                    {[
                      ['User ID', emp.userId],
                      ['Role', emp.role],
                      ['Designation', emp.designation],
                      ['Department', emp.department],
                      ['Email', emp.email],
                      ['Branch', emp.branch],
                      ['Grade', emp.grade],
                      ['Created', emp.createdAt ? formatDateTime(emp.createdAt) : ''],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-28 shrink-0 text-ink-500">{k}</dt>
                        <dd className="font-medium text-ink-900">{v || '-'}</dd>
                      </div>
                    ))}
                  </dl>
                  {emp.recordCounts && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(emp.recordCounts).map(([k, n]) => (
                        <span key={k} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-700">
                          {COLLECTION_LABEL[k] || k}: <b>{n}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title={`Daily entries (${detail.entries.length})`} description={detail.entries.length ? `Total ${formatDuration(totalMinutes)}` : undefined} bodyClassName="p-0">
                  <DataTable columns={entryColumns} rows={detail.entries} rowKey="id" caption="Deleted employee's daily entries" dense empty={<EmptyState title="No daily entries" message="This employee had no saved entries." />} />
                </Card>

                {detail.leave.length > 0 && (
                  <Card title={`Leave / permission (${detail.leave.length})`}>
                    <ul className="divide-y divide-ink-100 text-[13px]">
                      {detail.leave.map((l) => (
                        <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                          <span>{l.kind} {l.leaveType || ''} · {formatDate(l.dateFrom)}{l.dateTo && l.dateTo !== l.dateFrom ? ` – ${formatDate(l.dateTo)}` : ''}</span>
                          <span className="text-ink-500">{l.status}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {detail.work.length > 0 && (
                  <Card title={`Work assignments (${detail.work.length})`}>
                    <ul className="divide-y divide-ink-100 text-[13px]">
                      {detail.work.map((w) => (
                        <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2">
                          <span>{w.title || w.work || w.id}</span>
                          <span className="text-ink-500">{w.status}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
