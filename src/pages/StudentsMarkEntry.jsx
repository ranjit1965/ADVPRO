import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eraser, LogOut, Save, UsersRound } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Loading';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import * as api from '../services/api';

const EXAM_TYPES = ['Internal Test 1', 'Internal Test 2', 'Model Exam', 'Final Practical'];
const EMPTY = { batchNo: '', courseId: '', examType: '', maxMarks: '100' };

export default function StudentsMarkEntry() {
  const { lookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [query, setQuery] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [rows, setRows] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (!lookups) return <PageLoader />;

  const setQ = (k) => (e) => {
    setQuery((q) => ({ ...q, [k]: e.target.value }));
    setRows(null);
  };

  const load = async (e) => {
    e?.preventDefault();
    const errs = {};
    ['batchNo', 'courseId', 'examType'].forEach((k) => !query[k] && (errs[k] = 'Required'));
    if (!/^\d+$/.test(query.maxMarks) || Number(query.maxMarks) <= 0) errs.maxMarks = 'Enter a positive number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setRows(await api.getStudentMarks(query));
    setRowErrors({});
    setDirty(false);
    setLoading(false);
  };

  const updateRow = (regNo, patch) => {
    setRows((rs) => rs.map((r) => (r.regNo === regNo ? { ...r, ...patch } : r)));
    setRowErrors((er) => ({ ...er, [regNo]: undefined }));
    setDirty(true);
  };

  const save = async () => {
    const max = Number(query.maxMarks);
    const errs = {};
    rows.forEach((r) => {
      if (r.absent) return;
      if (r.marks === '') errs[r.regNo] = 'Required';
      else if (!/^\d+(\.\d)?$/.test(String(r.marks)) || Number(r.marks) > max) errs[r.regNo] = `0–${max}`;
    });
    setRowErrors(errs);
    if (Object.keys(errs).length) return toast.error('Enter valid marks for every student, or mark them absent.');
    setSaving(true);
    await api.saveStudentMarks(query, rows);
    setSaving(false);
    setDirty(false);
    toast.success('Student marks saved successfully.');
  };

  const clear = async () => {
    if (dirty && !(await confirm({ title: 'Clear', message: 'Clear the selection and unsaved marks?', confirmLabel: 'Clear' }))) return;
    setQuery(EMPTY);
    setRows(null);
    setErrors({});
  };

  const exit = async () => {
    if (dirty && !(await confirm({ title: 'Exit without saving?', message: 'You have unsaved marks.', confirmLabel: 'Exit', tone: 'danger' }))) return;
    navigate('/');
  };

  const present = rows?.filter((r) => !r.absent && r.marks !== '') || [];
  const avg = present.length ? (present.reduce((s, r) => s + Number(r.marks), 0) / present.length).toFixed(1) : '—';

  return (
    <>
      <PageHeader title="Students Mark Entry" breadcrumb={[{ label: 'Faculty' }, { label: 'Students Mark Entry' }]} description="Select the batch and exam, then enter marks for each student." />
      <Card className="mb-5">
        <form onSubmit={load} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Select searchable label="Batch No" required options={lookups.batches} value={query.batchNo} onChange={setQ('batchNo')} error={errors.batchNo} />
          <Select searchable label="Course ID" required className="lg:col-span-2" options={lookups.courses.map((c) => ({ value: c.id, label: `${c.id} – ${c.name}`, alt: [c.name] }))} value={query.courseId} onChange={setQ('courseId')} error={errors.courseId} />
          <Select label="Exam Type" required options={EXAM_TYPES} value={query.examType} onChange={setQ('examType')} error={errors.examType} />
          <Input label="Max Marks" required inputMode="numeric" value={query.maxMarks} onChange={setQ('maxMarks')} error={errors.maxMarks} />
          <div className="sm:col-span-2 lg:col-span-6 lg:flex lg:justify-end">
            <Button type="submit" icon={UsersRound} loading={loading} className="w-full lg:w-auto">
              Load students
            </Button>
          </div>
        </form>
      </Card>
      <Card
        bodyClassName="p-0"
        title="Students"
        description={rows ? `${rows.length} students · ${rows.filter((r) => r.absent).length} absent · average ${avg}` : undefined}
      >
        {!rows ? (
          <EmptyState icon={UsersRound} title="No batch loaded" message="Choose Batch No, Course ID and Exam Type, then click Load students." />
        ) : (
          <DataTable
            dense
            rowKey="regNo"
            rows={rows}
            columns={[
              { key: 'regNo', header: 'Reg No', render: (r) => <span className="tabular-nums">{r.regNo}</span> },
              { key: 'name', header: 'Student Name', render: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
              {
                key: 'marks',
                header: `Marks (out of ${query.maxMarks})`,
                render: (r) => (
                  <div>
                    <input
                      aria-label={`Marks for ${r.name}`}
                      inputMode="decimal"
                      className="field-control w-28 py-1.5"
                      value={r.absent ? '' : r.marks}
                      disabled={r.absent}
                      aria-invalid={!!rowErrors[r.regNo]}
                      onChange={(e) => updateRow(r.regNo, { marks: e.target.value })}
                    />
                    {rowErrors[r.regNo] && <p className="mt-0.5 text-xs text-danger-600">{rowErrors[r.regNo]}</p>}
                  </div>
                ),
              },
              {
                key: 'absent',
                header: 'Absent',
                render: (r) => (
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={r.absent} onChange={(e) => updateRow(r.regNo, { absent: e.target.checked, marks: '' })} />
                    <span className="text-ink-600">AB</span>
                  </label>
                ),
              },
            ]}
          />
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
          <Button icon={Save} onClick={save} loading={saving} disabled={!rows}>
            Save
          </Button>
          <Button variant="secondary" icon={Eraser} onClick={clear}>
            Clear
          </Button>
          <Button variant="secondary" icon={LogOut} onClick={exit}>
            Exit
          </Button>
        </div>
      </Card>
    </>
  );
}
