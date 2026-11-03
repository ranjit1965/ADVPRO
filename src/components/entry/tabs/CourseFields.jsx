import { Plus } from 'lucide-react';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { courseOptions } from '../fieldProps';

/**
 * Course ID (with "Add course") and Chapter / Session No., shared by the Course Preparation
 * and Self Learning / Knowledge Sharing tabs. A course with no chapters in Master
 * (for example one just added) takes a typed chapter / session number.
 */
export default function CourseFields({ f, values, set, setMany, lookups, onAddCourse, courseClass, chapterClass }) {
  const courseChapters = lookups.chapters.filter((c) => c.courseId === values.courseId).sort((a, b) => a.no - b.no);
  const typedChapter = !!values.courseId && courseChapters.length === 0;
  const addCourse = () => onAddCourse?.((id) => setMany({ courseId: id, chapterNo: '' }));

  return (
    <>
      <Select
        searchable
        label="Course ID"
        className={courseClass}
        options={courseOptions(lookups)}
        {...f('courseId')}
        onChange={(e) => setMany({ courseId: e.target.value, chapterNo: '' })}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            addCourse();
          }
        }}
        aside={
          onAddCourse && (
            <button type="button" onClick={addCourse} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline" title="Add a new course (Ctrl + A)">
              <Plus className="size-3.5" aria-hidden /> Add course
            </button>
          )
        }
      />
      {typedChapter ? (
        <Input label="Chapter / Session No." className={chapterClass} inputMode="numeric" maxLength={3} placeholder="e.g. 1" hint="No chapters in Master" {...f('chapterNo')} onChange={(e) => set('chapterNo', e.target.value.replace(/\D/g, ''))} />
      ) : (
        <Select
          label="Chapter / Session No."
          className={chapterClass}
          sort={false}
          placeholder={values.courseId ? 'Select' : 'Course first'}
          options={courseChapters.map((c) => ({ value: String(c.no), label: `Chapter ${c.no}` }))}
          {...f('chapterNo')}
        />
      )}
    </>
  );
}
