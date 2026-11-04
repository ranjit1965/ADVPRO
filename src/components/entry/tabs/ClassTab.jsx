import { useMemo } from 'react';
import { Mail } from 'lucide-react';
import Select from '../../ui/Select';
import Input from '../../ui/Input';
import RadioGroup from '../../ui/RadioGroup';
import Textarea from '../../ui/Textarea';
import OutstationFields from '../OutstationFields';
import { makeField, courseOptions } from '../fieldProps';
import { CLASS_CHECKS, DAY_ORDERS } from '../../../utils/entryForm';

const CHAPTER_TYPES = ['Theory', 'Lab'];

export default function ClassTab({ values, errors, set, setMany, lookups, facultyCode, facultyIn, outstation, outstationErrors, setOutstation, onAddLookup, onRequestCourse }) {
  const f = makeField('class', values, errors, set);
  const outstationMode = facultyIn === 'Outstation';

  // Chapters come from Master › Courses & Chapters. Picking one pre-selects its type; the user can change it.
  const courseChapters = lookups.chapters.filter((c) => c.courseId === values.courseId).sort((a, b) => a.no - b.no);
  const onCourse = (e) => setMany({ courseId: e.target.value, chapterNo: '', chapterType: '' });

  // Batch No offers the batches assigned to this faculty (Master › Batch / Batch Import, matched by short name)
  // and any batch with no faculty at all: open batches first (newest first), then ones completed in the last 12 months.
  const batchOptions = useMemo(() => {
    const list = (lookups.batchList || [])
      .filter((b) => b.faculty.includes(facultyCode) || (!b.faculty.length && !b.shortName))
      .sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || (b.startDate || '').localeCompare(a.startDate || ''));
    const opts = list.map((b) => ({ value: b.batchNo, label: [b.batchNo, b.courseId, b.status === 'Completed' && 'Completed'].filter(Boolean).join(' · ') }));
    if (values.batchNo && !opts.some((o) => o.value === values.batchNo)) opts.push({ value: values.batchNo, label: values.batchNo });
    return opts;
  }, [lookups.batchList, facultyCode, values.batchNo]);
  const onBatch = (e) => {
    const batch = (lookups.batchList || []).find((b) => b.batchNo === e.target.value);
    const course = batch?.courseId && lookups.courses.some((c) => c.id === batch.courseId) && batch.courseId !== values.courseId ? batch.courseId : null;
    setMany(course ? { batchNo: e.target.value, courseId: course, chapterNo: '', chapterType: '' } : { batchNo: e.target.value });
  };
  const onChapter = (e) => {
    const ch = courseChapters.find((c) => String(c.no) === e.target.value);
    setMany({ chapterNo: e.target.value, chapterType: CHAPTER_TYPES.includes(ch?.type) ? ch.type : '' });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <Select
          searchable
          label="Course ID"
          className="sm:col-span-2 lg:col-span-5"
          options={courseOptions(lookups)}
          {...f('courseId')}
          onChange={onCourse}
          aside={
            onRequestCourse && (
              <button type="button" onClick={onRequestCourse} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline" title="Course not in the list? Ask the Manager / Admin to add it">
                <Mail className="size-3.5" aria-hidden /> Request new course
              </button>
            )
          }
        />
        {outstationMode ? (
          <Select label="Class in" className="lg:col-span-3" options={lookups.classIn} {...f('classIn')} required error={errors.classIn} />
        ) : (
          <Select
            searchable
            label="Batch No"
            className="lg:col-span-3"
            sort={false}
            placeholder={batchOptions.length ? 'Select (optional)' : 'No batch assigned'}
            options={batchOptions}
            {...f('batchNo')}
            onChange={onBatch}
          />
        )}
        <Select label="Chapter / Session No" className="lg:col-span-2" placeholder={values.courseId ? (courseChapters.length ? 'Select' : 'No chapters in Master') : 'Select a course first'} options={courseChapters.map((c) => ({ value: String(c.no), label: `Chapter ${c.no}` }))} {...f('chapterNo')} onChange={onChapter} />
        <Select label="Chap / Session Type" className="lg:col-span-2" options={CHAPTER_TYPES} {...f('chapterType')} />
        <Select label="Day Order" className="lg:col-span-2" placeholder="Select" options={DAY_ORDERS} {...f('dayOrder')} />
        <Input label="No of Students" className="lg:col-span-2" inputMode="numeric" maxLength={4} placeholder="0" {...f('noOfStudents')} />
        <Select label="Today's Session Type" className="sm:col-span-2 lg:col-span-4" options={lookups.sessionTypes} {...f('todaySessionType')} />
        {CLASS_CHECKS.map(([name, label]) => (
          <RadioGroup key={name} size="sm" className="lg:col-span-2" label={label} name={`class-${name}`} options={['Yes', 'No']} value={values[name] ?? ''} onChange={(v) => set(name, v)} />
        ))}
        <Textarea label="Today's Session Detail" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What was covered in today's session" {...f('todaySessionDetail')} />
      </div>
      {outstationMode && <OutstationFields values={outstation} errors={outstationErrors} set={setOutstation} lookups={lookups} onAddLookup={onAddLookup} />}
    </div>
  );
}
