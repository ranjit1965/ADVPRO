import * as api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import WorkTable from '../components/master/WorkTable';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';

/** Work assigned to the signed-in person from Master › Shedulling. */
export default function MyWork() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.getWorkAssignments('mine'), []);
  const progress = async (w, patch) => {
    try {
      await api.updateWorkAssignment(w.id, patch);
      toast.success('Progress saved.');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const open = (data || []).filter((w) => w.status !== 'Done').length;
  return (
    <>
      <PageHeader title="My Work" description={data ? `${open} open of ${data.length} assigned to you` : 'Work assigned to you by the Admin or Manager'} />
      <Card bodyClassName="p-0">{error ? <ErrorState message={error} onRetry={reload} /> : <WorkTable rows={data || []} loading={loading} onProgress={progress} />}</Card>
    </>
  );
}
