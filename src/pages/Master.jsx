import { useMemo, useState } from 'react';
import { BookOpen, List, ListTree, Mail, Pencil, Plus, Trash2, X } from 'lucide-react';
import * as api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import SearchableSelect from '../components/ui/SearchableSelect';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Loading';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { canManage, isSuperAdmin } from '../utils/permissions';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime } from '../utils/format';
import CourseImport from '../components/master/CourseImport';
import CourseFormFields, { EMPTY_COURSE, courseBody, courseToForm, validateCourse } from '../components/master/CourseFormFields';


/** Master › Courses & Chapters: the course list and the chapter / session details the Class tab fills in. */
export default function Master() {
  const { user } = useAuth();
  const { lookups, reload } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState('');
  const [courseForm, setCourseForm] = useState(null); // { id, name, isNew }
  const [chapterForm, setChapterForm] = useState(null); // { ...chapter, originalNo } for editing one chapter
  const [bulk, setBulk] = useState(null); // Add chapter: { count, rows: [{ no, name }] }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false); // "View all courses" list
  const [allQ, setAllQ] = useState('');
  const canDelete = isSuperAdmin(user); // Admin / HR add and edit; only the Super Admin deletes

  const requests = useAsync(() => (canManage(user) ? api.getCourseRequests() : Promise.resolve([])), []);
  const batchRequests = useAsync(() => (canManage(user) ? api.getBatchRequests() : Promise.resolve([])), []);
  const courses = lookups?.courses ?? [];
  const courseId = selected || courses[0]?.id || '';
  const chapters = useMemo(() => (lookups?.chapters ?? []).filter((c) => c.courseId === courseId).sort((a, b) => a.no - b.no), [lookups, courseId]);
  const chapterCount = useMemo(() => (lookups?.chapters ?? []).reduce((m, c) => ({ ...m, [c.courseId]: (m[c.courseId] || 0) + 1 }), {}), [lookups]);

  if (!canManage(user)) {
    return (
      <>
        <PageHeader title="Master" />
        <Card><p className="text-sm text-ink-600">Access restricted. Only the Super Admin and admin can change master data.</p></Card>
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
    const errs = validateCourse(courseForm);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = courseBody(courseForm);
    const id = body.id;
    if (await run(() => api.saveCourse(body, courseForm.isNew), courseForm.isNew ? 'Course added.' : 'Course updated.')) {
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
    if (!chapterForm.name.trim()) errs.name = 'Enter the chapter name';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ch = { courseId, no: Number(chapterForm.no), name: chapterForm.name.trim() };
    if (await run(() => api.saveChapter(ch, chapterForm.originalNo), chapterForm.originalNo == null ? 'Chapter added.' : 'Chapter updated.')) setChapterForm(null);
  };

  // Add chapter: ask how many, then one row (No + Name) per chapter, numbered after the last chapter.
  const MAX_BULK = 200;
  const openBulk = () => {
    setErrors({});
    setBulk({ count: '1', rows: [{ no: String(nextNo), name: '' }] });
  };
  const setCount = (value) => {
    const count = value.replace(/\D/g, '').slice(0, 3);
    const n = Math.min(Number(count) || 0, MAX_BULK);
    setBulk((b) => {
      const rows = Array.from({ length: n }, (_, i) => b.rows[i] || { no: String(Number(b.rows[0]?.no || nextNo) + i), name: '' });
      return { count, rows };
    });
    setErrors({});
  };
  const setRow = (i, patch) => setBulk((b) => ({ ...b, rows: b.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const saveBulk = async () => {
    const errs = {};
    const used = new Set(chapters.map((c) => c.no));
    const seen = new Set();
    bulk.rows.forEach((r, i) => {
      const n = Number(r.no);
      if (!/^\d{1,3}$/.test(r.no) || n < 1) errs[i] = 'Enter a chapter number';
      else if (used.has(n)) errs[i] = `Chapter ${n} already exists`;
      else if (seen.has(n)) errs[i] = `Chapter ${n} is listed twice`;
      seen.add(n);
    });
    if (!bulk.rows.length) errs.count = 'Enter how many chapters (1 to 200)';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const list = bulk.rows.map((r) => ({ no: Number(r.no), name: r.name.trim() || `Chapter ${Number(r.no)}` }));
    if (await run(() => api.addChapters(courseId, list), `${list.length} chapter${list.length === 1 ? '' : 's'} added.`)) setBulk(null);
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

  const closeBatchRequest = async (r, status) => {
    if (status === 'Dismissed' && !(await confirm({ title: 'Dismiss request', message: `Dismiss ${r.requestedByName}'s Batch No request for ${r.courseId}?`, confirmLabel: 'Dismiss' }))) return;
    try {
      await api.setBatchRequestStatus(r.id, status);
      toast.success(status === 'Done' ? 'Batch request marked done.' : 'Batch request dismissed.');
      batchRequests.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const nextNo = chapters.reduce((m, c) => Math.max(m, c.no), 0) + 1;
  const columns = [
    { key: 'no', header: 'No', className: 'w-16' },
    { key: 'name', header: 'Chapter Name', className: 'whitespace-normal' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit chapter ${c.no}`} onClick={() => { setErrors({}); setChapterForm({ no: String(c.no), name: c.name || '', originalNo: c.no }); }} />
          {canDelete && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete chapter ${c.no}`} onClick={() => removeChapter(c)} />}
        </div>
      ),
    },
  ];
  const current = courses.find((c) => c.id === courseId);

  return (
    <>
      <PageHeader title="Courses & Chapters" description="Courses (Course ID, Course Name) and their chapters (Chapter No, Chapter Name). The Class entry fills these in automatically." breadcrumb={[{ label: 'Course' }]} />
      {canManage(user) && (
        <div className="mb-5">
          <CourseImport onAdded={() => { reload(); requests.reload(); }} />
        </div>
      )}
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
                <Button size="sm" icon={Plus} onClick={() => { setErrors({}); setCourseForm({ ...EMPTY_COURSE, id: r.courseId || '', name: r.courseName, isNew: true }); }}>
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
      {batchRequests.data?.length > 0 && (
        <Card className="mb-5" title={`Batch No requests (${batchRequests.data.length})`} description="Sent by faculty from the Class entry. They are also listed in Master › Batch, where Create batch fills in Add Batch from the request and marks it Done.">
          <ul className="divide-y divide-ink-100">
            {batchRequests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Mail className="size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] font-medium text-ink-900">
                    {r.courseId}{r.courseName ? ` – ${r.courseName}` : ''}
                    {[r.startDate && `start ${r.startDate}`, r.batchTime, r.students != null && `${r.students} students`].filter(Boolean).map((t) => <span key={t} className="text-xs text-ink-500"> · {t}</span>)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {r.requestedByName} ({r.requestedByCode}) · {formatDateTime(r.createdAt)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => closeBatchRequest(r, 'Done')}>Done</Button>
                <Button size="sm" variant="secondary" onClick={() => closeBatchRequest(r, 'Dismissed')}>Dismiss</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mb-5" bodyClassName="flex flex-wrap items-end gap-3">
        <SearchableSelect
          label={`Course (${courses.length})`}
          className="min-w-[260px] flex-1"
          match="contains"
          placeholder={courses.length ? 'Search by Course ID or name' : 'No courses yet'}
          options={courses.map((c) => ({ value: c.id, label: `${c.id} – ${c.name}`, alt: [c.name] }))}
          value={courseId}
          onChange={(v) => setSelected(v?.target ? v.target.value : v)}
        />
        <Button variant="secondary" icon={showAll ? X : List} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide all courses' : 'View all courses'}</Button>
        <Button icon={Plus} onClick={() => { setErrors({}); setCourseForm({ ...EMPTY_COURSE, isNew: true }); }}>Add course</Button>
      </Card>
      {showAll && (
        <Card
          className="mb-5"
          bodyClassName="p-0"
          title={`All courses (${courses.length})`}
          description={canDelete ? 'Edit or delete a course, or open its chapters.' : 'Edit a course or open its chapters. Only the Super Admin can delete.'}
          actions={<Input aria-label="Search courses" className="w-64" placeholder="Search Course ID or name" value={allQ} onChange={(e) => setAllQ(e.target.value)} />}
        >
          <div className="max-h-[480px] overflow-auto">
            <DataTable
              dense
              caption="All courses"
              rowKey="id"
              rows={courses.filter((c) => !allQ.trim() || `${c.id} ${c.name}`.toLowerCase().includes(allQ.trim().toLowerCase()))}
              empty={<EmptyState icon={BookOpen} title="No course matches" />}
              columns={[
                { key: 'id', header: 'Course ID', render: (c) => <span className="font-medium text-ink-900">{c.id}</span> },
                { key: 'name', header: 'Course Name', className: 'whitespace-normal' },
                { key: 'chapters', header: 'Chapters', align: 'right', render: (c) => chapterCount[c.id] || 0 },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (c) => (
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <Button size="sm" variant="ghost" icon={ListTree} title="Chapters" aria-label={`Chapters of ${c.id}`} onClick={() => { setSelected(c.id); setShowAll(false); }}>Chapters</Button>
                      <Button size="sm" variant="ghost" icon={Pencil} title="Edit" aria-label={`Edit ${c.id}`} onClick={() => { setErrors({}); setCourseForm({ ...courseToForm(c), isNew: false }); }}>Edit</Button>
                      {canDelete && <Button size="sm" variant="ghost" className="hover:!bg-danger-50 hover:!text-danger-600" icon={Trash2} title="Delete" aria-label={`Delete ${c.id}`} onClick={() => removeCourse(c)}>Delete</Button>}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </Card>
      )}
      <div>
        <Card
          title={current ? `${current.id} – ${current.name}` : 'Chapters'}
          description={current ? `${chapters.length} chapter${chapters.length === 1 ? '' : 's'} / sessions` : undefined}
          actions={
            current && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => { setErrors({}); setCourseForm({ ...courseToForm(current), isNew: false }); }}>Edit course</Button>
                {canDelete && <Button size="sm" variant="secondary" icon={Trash2} onClick={() => removeCourse(current)}>Delete course</Button>}
                <Button size="sm" icon={Plus} onClick={openBulk}>Add chapter</Button>
              </div>
            )
          }
        >
          {current ? <DataTable columns={columns} rows={chapters} rowKey="no" caption="Chapters" empty={<EmptyState icon={BookOpen} title="No chapters yet" message="Add the chapters / sessions for this course." />} /> : <p className="text-sm text-ink-500">Add a course to start.</p>}
        </Card>
      </div>

      <Modal open={!!courseForm} onClose={() => setCourseForm(null)} size="lg" title={courseForm?.isNew ? 'Add course' : 'Edit course'}
        footer={<><Button variant="secondary" onClick={() => setCourseForm(null)}>Cancel</Button><Button loading={saving} onClick={saveCourse}>Save</Button></>}>
        {courseForm && (
          <CourseFormFields form={courseForm} errors={errors} idReadOnly={!courseForm.isNew} onChange={(f) => { setCourseForm(f); setErrors({}); }} />
        )}
      </Modal>

      <Modal open={!!bulk} onClose={() => setBulk(null)} size="lg" title={`Add chapters to ${courseId}`}
        footer={<><Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button><Button loading={saving} disabled={!bulk?.rows.length} onClick={saveBulk}>Save {bulk?.rows.length || ''} chapter{bulk?.rows.length === 1 ? '' : 's'}</Button></>}>
        {bulk && (
          <div className="space-y-4">
            <Input label="How many chapters?" required className="max-w-[220px]" inputMode="numeric" value={bulk.count} error={errors.count} hint={`Numbered from ${bulk.rows[0]?.no || nextNo}; up to ${MAX_BULK} at once`} onChange={(e) => setCount(e.target.value)} />
            {bulk.rows.length > 0 && (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {bulk.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[90px_1fr] items-start gap-3">
                    <Input aria-label={`Chapter No ${i + 1}`} inputMode="numeric" maxLength={3} value={r.no} error={errors[i]} onChange={(e) => setRow(i, { no: e.target.value.replace(/\D/g, '') })} />
                    <Input aria-label={`Chapter Name ${i + 1}`} maxLength={300} value={r.name} placeholder={`Chapter ${r.no || i + 1} name (blank saves "Chapter ${r.no || i + 1}")`} onChange={(e) => setRow(i, { name: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!chapterForm} onClose={() => setChapterForm(null)} size="lg" title={chapterForm?.originalNo == null ? `Add chapter to ${courseId}` : `Edit chapter of ${courseId}`}
        footer={<><Button variant="secondary" onClick={() => setChapterForm(null)}>Cancel</Button><Button loading={saving} onClick={saveChapter}>Save</Button></>}>
        {chapterForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Chapter No" required inputMode="numeric" value={chapterForm.no} error={errors.no} onChange={(e) => setChapterForm({ ...chapterForm, no: e.target.value })} />
            <Input label="Chapter Name" required className="sm:col-span-2" maxLength={300} value={chapterForm.name} error={errors.name} onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value })} placeholder="e.g. Introduction to Networking" />
          </div>
        )}
      </Modal>
    </>
  );
}
