import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';

function PolicyText({ content }) {
  const blocks = [];
  content.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('# ')) blocks.push({ h: t.slice(2) });
    else if (t.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last?.ul) last.ul.push(t.slice(2));
      else blocks.push({ ul: [t.slice(2)] });
    } else blocks.push({ p: t });
  });
  return (
    <div className="space-y-3 text-sm text-ink-700">
      {blocks.map((b, i) =>
        b.h ? <h2 key={i} className="pt-2 text-base font-semibold text-ink-900">{b.h}</h2> : b.ul ? <ul key={i} className="list-disc space-y-1 pl-5">{b.ul.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b.p}</p>,
      )}
    </div>
  );
}

export default function HrPolicy() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.getHrPolicy(), []);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = api.HR_ROLES.includes(user.role);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveHrPolicy(draft);
      setDraft(null);
      toast.success('HR policy saved.');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="HR Policy"
        breadcrumb={[{ label: 'HR' }, { label: 'HR Policy' }]}
        description={data?.updatedAt ? `Last updated ${formatDateTime(data.updatedAt)} by ${data.updatedBy}` : 'Company HR policy'}
        actions={canEdit && !draft && data && <Button variant="secondary" icon={Pencil} onClick={() => setDraft(data.content)}>Edit</Button>}
      />
      <Card>
        {loading ? (
          <PageLoader />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : draft !== null ? (
          <div className="space-y-3">
            <Textarea label="Policy text" hint='Start a line with "# " for a heading and "- " for a bullet.' rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={X} onClick={() => setDraft(null)}>Cancel</Button>
              <Button icon={Save} loading={saving} onClick={save}>Save</Button>
            </div>
          </div>
        ) : (
          <PolicyText content={data.content} />
        )}
      </Card>
    </>
  );
}
