import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Printer, Trash2, UserRound, CalendarClock, History } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import DescriptionList from '../components/ui/DescriptionList';
import { PageLoader } from '../components/ui/Loading';
import ErrorState from '../components/ui/ErrorState';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAsync } from '../hooks/useAsync';
import * as api from '../services/api';
import { ACTIVITY_LABEL } from '../utils/constants';
import { DETAIL_FIELDS, OUTSTATION_FIELDS } from '../utils/entryFields';
import { formatDate, formatDateTime, formatDuration, formatTime } from '../utils/format';

export default function EntryDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: entry, loading, error, reload } = useAsync(() => api.getDailyEntry(id), [id]);

  if (loading) return <PageLoader label="Loading entry…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const facultyName = (code) => {
    const f = lookups?.faculties.find((x) => x.code === code);
    return f ? `${f.name} (${f.code})` : code;
  };
  const display = (key, value) => (['assistance', 'assistanceFaculty'].includes(key) && value ? facultyName(value) : value);

  const remove = async () => {
    const ok = await confirm({ title: 'Delete entry', message: 'Delete this entry? This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await api.deleteDailyEntry(entry.id);
      toast.success('Daily entry deleted.');
      navigate('/faculty/daily-activity/history');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const details = DETAIL_FIELDS[entry.activityType]
    .filter(([k]) => !(entry.activityType === 'class' && ((k === 'batchNo' && entry.facultyIn === 'Outstation') || (k === 'classIn' && entry.facultyIn === 'Center'))))
    .map(([k, label, wide]) => ({ label, value: display(k, entry.details[k]), wide }));

  return (
    <>
      <PageHeader
        title={ACTIVITY_LABEL[entry.activityType]}
        breadcrumb={[{ label: 'Faculty' }, { label: 'My Entries', to: '/faculty/daily-activity/history' }, { label: 'Entry details' }]}
        description={`${formatDate(entry.activityDate)} · ${formatTime(entry.timeFrom)} – ${formatTime(entry.timeTo)}`}
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
              Back
            </Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="danger-outline" icon={Trash2} onClick={remove}>
              Delete
            </Button>
            <Button icon={Pencil} onClick={() => navigate(`/faculty/daily-activity/entry/${entry.id}`)}>
              Edit
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Entry information">
            <DescriptionList
              items={[
                { label: 'Activity Date', value: formatDate(entry.activityDate) },
                { label: 'Faculty in', value: <StatusBadge status={entry.facultyIn} /> },
                { label: 'Activity', value: ACTIVITY_LABEL[entry.activityType] },
                { label: 'Time From', value: formatTime(entry.timeFrom) },
                { label: 'Time To', value: formatTime(entry.timeTo) },
                { label: 'Worked Hours', value: formatDuration(entry.minutes) },
              ]}
            />
          </Card>
          <Card title={`${ACTIVITY_LABEL[entry.activityType]} details`}>
            <DescriptionList items={details} />
          </Card>
          {entry.outstation && (
            <Card title="College / OD">
              <DescriptionList items={OUTSTATION_FIELDS.map(([k, label]) => ({ label, value: display(k, entry.outstation[k]) }))} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Employee">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-brand-100 text-brand-800">
                <UserRound className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-ink-900">{entry.facultyName}</p>
                <p className="text-[13px] text-ink-500">Code {entry.facultyCode}</p>
              </div>
            </div>
            <DescriptionList
              className="mt-4 !grid-cols-1"
              items={[
                { label: 'Department', value: entry.department },
                { label: 'Designation', value: lookups?.faculties.find((f) => f.code === entry.facultyCode)?.designation },
              ]}
            />
          </Card>
          <Card title="Record">
            <ul className="space-y-3 text-[13px]">
              <li className="flex gap-3">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  Created by <b className="text-ink-900">{entry.createdBy}</b>
                  <br />
                  <span className="text-ink-500">{formatDateTime(entry.createdAt)}</span>
                </span>
              </li>
              <li className="flex gap-3">
                <History className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  Last updated{entry.updatedBy ? ' by ' : ''}
                  {entry.updatedBy && <b className="text-ink-900">{entry.updatedBy}</b>}
                  <br />
                  <span className="text-ink-500">{formatDateTime(entry.updatedAt)}</span>
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
