import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Eye, FilePlus2, Pencil, SearchX, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Pagination from '../components/ui/Pagination';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import EntryFilters from '../components/entry/EntryFilters';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import * as api from '../services/api';
import { ACTIVITY_LABEL, facultyInLabel } from '../utils/constants';
import { formatDate, formatDuration, formatTime } from '../utils/format';
import { entrySummary } from '../utils/entry';
import { downloadCsv } from '../utils/export';

const EMPTY_FILTERS = { q: '', dateFrom: '', dateTo: '', activityType: '', facultyCode: '', facultyIn: '' };

export default function EntryHistory() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();

  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, q: params.get('q') || '' }));
  const [sort, setSort] = useState({ key: 'activityDate', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useDebounce(filters.q, 250);

  // Keep header search (?q=) in sync when it changes while on this page.
  useEffect(() => {
    const urlQ = params.get('q') || '';
    setFilters((f) => (f.q === urlQ ? f : { ...f, q: urlQ }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  const query = useMemo(() => ({ ...filters, q, sortBy: sort.key, sortDir: sort.dir, page, pageSize }), [filters, q, sort, page, pageSize]);
  const { data, loading, error, reload } = useAsync(() => api.getDailyEntries(query), [query]);

  const changeFilters = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
    if ('q' in patch) {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      setParams(next, { replace: true });
    }
  };

  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const remove = async (row) => {
    const ok = await confirm({ title: 'Delete entry', message: `Delete the ${ACTIVITY_LABEL[row.activityType]} entry of ${formatDate(row.activityDate)} (${formatTime(row.timeFrom)} – ${formatTime(row.timeTo)})? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await api.deleteDailyEntry(row.id);
      toast.success('Daily entry deleted.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportCsv = async () => {
    const { items } = await api.getDailyEntries({ ...query, page: 1, pageSize: 0 });
    downloadCsv(
      `daily-entries-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Date', value: (r) => formatDate(r.activityDate) },
        { header: 'Faculty', value: (r) => `${r.facultyName} (${r.facultyCode})` },
        { header: 'Faculty in', value: (r) => facultyInLabel(r.facultyIn) },
        { header: 'Activity', value: (r) => ACTIVITY_LABEL[r.activityType] },
        { header: 'Time From', value: (r) => r.timeFrom },
        { header: 'Time To', value: (r) => r.timeTo },
        { header: 'Duration (min)', value: (r) => r.minutes },
        { header: 'Details', value: (r) => entrySummary(r) },
      ],
      items,
    );
    toast.success(`Exported ${items.length} entries to CSV.`);
  };

  const columns = [
    {
      key: 'activityDate',
      header: 'Date',
      sortable: true,
      render: (r) => (
        <Link to={`/entries/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium whitespace-nowrap text-brand-700 hover:underline">
          {formatDate(r.activityDate)}
        </Link>
      ),
    },
    { key: 'facultyName', header: 'Faculty', sortable: true, render: (r) => <span className="line-clamp-1 max-w-[180px]">{r.facultyName}</span> },
    {
      key: 'activityType',
      header: 'Activity',
      sortable: true,
      render: (r) => (
        <div className="max-w-[240px]">
          <p className="font-medium text-ink-900">{ACTIVITY_LABEL[r.activityType]}</p>
          <p className="line-clamp-1 text-xs text-ink-500">{entrySummary(r)}</p>
        </div>
      ),
    },
    {
      key: 'timeFrom',
      header: 'Time',
      sortable: true,
      render: (r) => (
        <div className="whitespace-nowrap tabular-nums">
          <p>{`${formatTime(r.timeFrom)} – ${formatTime(r.timeTo)}`}</p>
          <p className="text-xs text-ink-500">{formatDuration(r.minutes)}</p>
        </div>
      ),
    },
    { key: 'facultyIn', header: 'Faculty in', sortable: true, render: (r) => <StatusBadge status={r.facultyIn} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (r) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="size-8" icon={Eye} aria-label={`View ${r.id}`} title="View" onClick={() => navigate(`/entries/${r.id}`)} />
          <Button variant="ghost" size="icon" className="size-8" icon={Pencil} aria-label={`Edit ${r.id}`} title="Edit" onClick={() => navigate(`/faculty/daily-activity/entry/${r.id}`)} />
          <Button variant="ghost" size="icon" className="size-8 hover:!bg-danger-50 hover:!text-danger-600" icon={Trash2} aria-label={`Delete entry of ${formatDate(r.activityDate)} ${r.timeFrom}`} title="Delete" onClick={() => remove(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="My Entries"
        breadcrumb={[{ label: 'Faculty' }, { label: 'Daily Activity' }, { label: 'My Entries' }]}
        description="All daily activity entries. Search, filter and open any entry."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data?.total}>
              Export CSV
            </Button>
            <Button icon={FilePlus2} onClick={() => navigate('/faculty/daily-activity/entry')}>
              New entry
            </Button>
          </>
        }
      />
      <Card className="mb-5">
        <EntryFilters
          filters={filters}
          onChange={changeFilters}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setParams({}, { replace: true });
            setPage(1);
          }}
          faculties={lookups?.faculties || []}
        />
      </Card>
      <Card bodyClassName="p-0">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items || []}
              loading={loading && !data}
              sort={sort}
              onSort={onSort}
              onRowClick={(r) => navigate(`/entries/${r.id}`)}
              caption="Daily activity entries"
              empty={<EmptyState icon={SearchX} title="No entries match these filters" message="Change or reset the filters to see more entries." />}
            />
            {data?.total > 0 && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} onPageSizeChange={(n) => (setPageSize(n), setPage(1))} />}
          </>
        )}
      </Card>
    </>
  );
}
