import { useMemo, useState } from 'react';
import { BookOpen, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import * as api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Textarea from '../components/ui/Textarea';
import Modal from '../components/ui/Modal';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Loading';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { canAccess, MASTER_ROLES } from '../utils/permissions';
import { cn } from '../utils/cn';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime } from '../utils/format';

const EMPTY_CHAPTER = { no: '', type: '', details: '' };

/** Master › Courses & Chapters: the course list and the chapter / session details the Class tab fills in. */
export default function Master() {
  const { user } = useAuth();
  const { lookups, reload } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState('');
  const [courseForm, setCourseForm] = useState(null); // { id, name, isNew }
  const [chapterForm, setChapterForm] = useState(null); // { ...chapter, originalNo }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const requests = useAsync(() => (canAccess(user, MASTER_ROLES) ? api.getCourseRequests() : Promise.resolve([])), []);
  const courses = lookups?.courses ?? [];
  const courseId = selected || courses[0]?.id || '';
  const chapters = useMemo(() => (lookups?.chapters ?? []).filter((c) => c.courseId === courseId).sort((a, b) => a.no - b.no), [lookups, courseId]);

  if (!canAccess(user, MASTER_ROLES)) {
    return (
      <>
        <PageHeader title="Master" />
        <Card><p className="text-sm text-ink-600">Access restricted. Only the manager and admin can change master data.</p></Card>
      </>
    );
  }
  if (!lookups) return <PageLoader />;

  const run = async (fn, ok) => {
    setSaving(true);
    try {
      await fn();
      await reload();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveCourse = async () => {
    const errs = {};
    if (!/^[A-Za-z0-9+#._-]{2,20}$/.test(courseForm.id)) errs.id = '2 to 20 letters or digits';
    if (!courseForm.name.trim()) errs.name = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const id = courseForm.id.trim().toUpperCase();
    if (await run(() => api.saveCourse({ id, name: courseForm.name.trim() }, courseForm.isNew), courseForm.isNew ? 'Course added.' : 'Course updated.')) {
      setSelected(id);
      setCourseForm(null);
      requests.reload(); // a matching request is closed as Added by the server
    }
  };

  const removeCourse = async (c) => {
    if (!(await confirm({ title: 'Delete course', message: `Delete ${c.id} and all its chapters? Saved entries keep their text.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    if (await run(() => api.deleteCourse(c.id), 'Course deleted.')) setSelected('');
  };

  const saveChapter = async () => {
    const errs = {};
    if (!/^\d{1,3}$/.test(String(chapterForm.no)) || Number(chapterForm.no) < 1) errs.no = 'Enter a number';
    if (!chapterForm.type) errs.type = 'Required';
    if (!chapterForm.details.trim()) errs.details = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ch = { courseId, no: Number(chapterForm.no), type: chapterForm.type, details: chapterForm.details.trim() };
    if (await run(() => api.saveChapter(ch, chapterForm.originalNo), chapterForm.originalNo == null ? 'Chapter added.' : 'Chapter updated.')) setChapterForm(null);
  };

  const removeChapter = async (c) => {
    if (!(await confirm({ title: 'Delete chapter', message: `Delete chapter ${c.no} of ${courseId}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    await run(() => api.deleteChapter(courseId, c.no), 'Chapter deleted.');
  };

  const dismissRequest = async (r) => {
    if (!(await confirm({ title: 'Dismiss request', message: `Dismiss ${r.requestedByName}'s request for "${r.courseName}"?`, confirmLabel: 'Dismiss' }))) return;
    try {
      await api.setCourseRequestStatus(r.id, 'Dismissed');
      toast.success('Request dismissed.');
      requests.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const nextNo = chapters.reduce((m, c) => Math.max(m, c.no), 0) + 1;
  const columns = [
    { key: 'no', header: 'No', className: 'w-16' },
    { key: 'type', header: 'Type', className: 'w-36' },
    { key: 'details', header: 'Chapter / Session Details', className: 'whitespace-normal' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit chapter ${c.no}`} onClick={() => { setErrors({}); setChapterForm({ ...c, originalNo: c.no }); }} />
          <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete chapter ${c.no}`} onClick={() => removeChapter(c)} />
        </div>
      ),
    },
  ];
  const current = courses.find((c) => c.id === courseId);

  return (
    <>
      <PageHeader title="Courses & Chapters" description="Courses and their chapter / session details. The Class entry fills these in automatically." breadcrumb={[{ label: 'Master', to: '/master' }, { label: 'Course' }]} />
      {requests.data?.length > 0 && (
        <Card className="mb-5" title={`Course requests (${requests.data.length})`} description="Sent by faculty and employees from the Class entry. Add the course, or dismiss the request.">
          <ul className="divide-y divide-ink-100">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Mail className="size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] font-medium text-ink-900">
                    {r.courseName} {r.courseId && <span className="text-xs text-ink-500">· suggested ID {r.courseId}</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {r.requestedByName} ({r.requestedByCode}) · {formatDateTime(r.createdAt)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <Button size="sm" icon={Plus} onClick={() => { setErrors({}); setCourseForm({ id: r.courseId || '', name: r.courseName, isNew: true }); }}>
                  Add course
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dismissRequest(r)}>
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <Card title="Courses" actions={<Button size="sm" icon={Plus} onClick={() => { setErrors({}); setCourseForm({ id: '', name: '', isNew: true }); }}>Add course</Button>} bodyClassName="p-2">
          {courses.length === 0 ? (
            <EmptyState icon={BookOpen} title="No courses yet" message="Add the first course." />
          ) : (
            <ul className="space-y-1">
              {courses.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected(c.id)} className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ink-50', c.id === courseId && 'bg-brand-50 text-brand-800 hover:bg-brand-50')}>
                    <span className="font-semibold">{c.id}</span>
                    <span className="block truncate text-xs text-ink-500">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={current ? `${current.id} – ${current.name}` : 'Chapters'}
          description={current ? `${chapters.length} chapter${chapters.length === 1 ? '' : 's'} / sessions` : undefined}
          actions={
            current && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => { setErrors({}); setCourseForm({ ...current, isNew: false }); }}>Edit course</Button>
                <Button size="sm" variant="secondary" icon={Trash2} onClick={() => removeCourse(current)}>Delete course</Button>
                <Button size="sm" icon={Plus} onClick={() => { setErrors({}); setChapterForm({ ...EMPTY_CHAPTER, no: String(nextNo), originalNo: null }); }}>Add chapter</Button>
              </div>
            )
          }
        >
          {current ? <DataTable columns={columns} rows={chapters} rowKey="no" caption="Chapters" empty={<EmptyState icon={BookOpen} title="No chapters yet" message="Add the chapters / sessions for this course." />} /> : <p className="text-sm text-ink-500">Add a course to start.</p>}
        </Card>
      </div>

      <Modal open={!!courseForm} onClose={() => setCourseForm(null)} title={courseForm?.isNew ? 'Add course' : 'Edit course'}
        footer={<><Button variant="secondary" onClick={() => setCourseForm(null)}>Cancel</Button><Button loading={saving} onClick={saveCourse}>Save</Button></>}>
        {courseForm && (
          <div className="grid gap-4">
            <Input label="Course ID" required value={courseForm.id} error={errors.id} readOnly={!courseForm.isNew} onChange={(e) => setCourseForm({ ...courseForm, id: e.target.value })} />
            <Input label="Course name" required value={courseForm.name} error={errors.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} />
          </div>
        )}
      </Modal>

      <Modal open={!!chapterForm} onClose={() => setChapterForm(null)} size="lg" title={chapterForm?.originalNo == null ? `Add chapter to ${courseId}` : `Edit chapter of ${courseId}`}
        footer={<><Button variant="secondary" onClick={() => setChapterForm(null)}>Cancel</Button><Button loading={saving} onClick={saveChapter}>Save</Button></>}>
        {chapterForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Chapter / Session No" required inputMode="numeric" value={chapterForm.no} error={errors.no} onChange={(e) => setChapterForm({ ...chapterForm, no: e.target.value })} />
            <Select label="Chap / Session Type" required options={lookups.chapterTypes} value={chapterForm.type} error={errors.type} onChange={(e) => setChapterForm({ ...chapterForm, type: e.target.value })} />
            <Textarea label="Chap / Session Details" required className="sm:col-span-2" rows={4} maxLength={300} value={chapterForm.details} error={errors.details} onChange={(e) => setChapterForm({ ...chapterForm, details: e.target.value })} placeholder="What this chapter / session covers" />
          </div>
        )}
      </Modal>
    </>
  );
}
