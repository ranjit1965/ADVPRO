import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import DataTable from '../../components/ui/DataTable';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../context/LookupsContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDuration } from '../../utils/format';
import { downloadCsv } from '../../utils/export';

/** HR_Report › Batch Paper Completion: first and last class per faculty, batch and course, from the Class entries. */
export default function BatchCompletion() {
  const { user } = useAuth();
  const { lookups } = useLookups();
  const isHr = api.HR_ROLES.includes(user.role);
  const [facultyCode, setFacultyCode] = useState(isHr ? '' : user.code);
  const { data, loading, error, reload } = useAsync(() => api.getBatchCompletion({ facultyCode }), [facultyCode]);
  const courseName = useMemo(() => Object.fromEntries((lookups?.courses || []).map((c) => [c.id, c.name])), [lookups]);
  const course = (id) => (courseName[id] ? `${id} – ${courseName[id]}` : id);

  const columns = [
    { key: 'facultyName', header: 'Emp Name', render: (r) => <span className="font-medium text-ink-900">{r.facultyName}</span> },
    { key: 'batchNo', header: 'Batch No' },
    { key: 'courseId', header: 'Course', render: (r) => course(r.courseId) },
    { key: 'startDate', header: 'Start Date', render: (r) => formatDate(r.startDate) },
    { key: 'endDate', header: 'End Date', render: (r) => formatDate(r.endDate) },
    { key: 'sessions', header: 'Sessions', align: 'right' },
    { key: 'minutes', header: 'Hours', align: 'right', render: (r) => formatDuration(r.minutes) },
  ];
  const exportCsv = () =>
    downloadCsv('batch-paper-completion.csv', [
      { header: 'Emp Name', value: (r) => r.facultyName },
      { header: 'Batch No', value: (r) => r.batchNo },
      { header: 'Course', value: (r) => course(r.courseId) },
      { header: 'Start Date', value: (r) => formatDate(r.startDate) },
      { header: 'End Date', value: (r) => formatDate(r.endDate) },
      { header: 'Sessions', value: (r) => r.sessions },
      { header: 'Hours', value: (r) => +(r.minutes / 60).toFixed(1) },
    ], data || []);

  return (
    <>
      <PageHeader title="Batch Paper Completion" breadcrumb={[{ label: 'HR' }, { label: 'Batch Paper Completion' }]} description="Built from Class entries: the first and last session of each batch and course." actions={<Button variant="secondary" icon={Download} disabled={!data?.length} onClick={exportCsv}>Export</Button>} />
      {isHr && (
        <Card className="mb-5">
          <Select searchable label="Faculty" className="max-w-sm" placeholder="All faculty" options={(lookups?.faculties || []).map((f) => ({ value: f.code, label: `${f.name} (${f.code})` }))} value={facultyCode} onChange={(e) => setFacultyCode(e.target.value)} />
        </Card>
      )}
      <Card bodyClassName="p-0">
        {error ? <ErrorState message={error} onRetry={reload} /> : <DataTable columns={columns} rows={data || []} rowKey="key" loading={loading} dense caption="Batch paper completion" empty={<EmptyState title="No batch classes yet" message="Class entries with a Batch No appear here." />} />}
      </Card>
    </>
  );
}
