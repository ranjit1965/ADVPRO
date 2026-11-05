import RadioGroup from '../../ui/RadioGroup';
import Select from '../../ui/Select';
import SearchableSelect from '../../ui/SearchableSelect';
import Textarea from '../../ui/Textarea';
import CourseFields from './CourseFields';
import { makeField, facultyOptions } from '../fieldProps';
import { CLASS_MODES, SELF_LEARNING_TYPES, SESSION_KINDS } from '../../../utils/entryForm';

/**
 * Self Learning / Knowledge Sharing / Class Attended: Course ID, Chapter / Session No,
 * Chap / Session Type (Theory / Practical) and Details. Class Attended also asks who took the
 * class and whether it was Online or Offline.
 */
export default function SelfLearningTab({ values, errors, set, setMany, lookups, onAddCourse }) {
  const f = makeField('selfLearning', values, errors, set);
  const attended = values.learningType === 'Class Attended';
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
      <RadioGroup
        className="col-span-2 lg:col-span-8"
        label="Type"
        required
        name="learningType"
        options={SELF_LEARNING_TYPES}
        value={values.learningType}
        onChange={(v) => setMany({ learningType: v, ...(v !== 'Class Attended' && { classFaculty: '', classMode: '' }) })}
        error={errors.learningType}
      />
      <div className="hidden lg:col-span-4 lg:block" />
      {attended && (
        <>
          <SearchableSelect label="Class taken by (faculty name)" required className="col-span-2 lg:col-span-6" options={facultyOptions(lookups)} placeholder="Search faculty" {...f('classFaculty')} />
          <RadioGroup className="col-span-2 lg:col-span-4" label="Online / Offline" required name="classMode" options={CLASS_MODES} value={values.classMode} onChange={(v) => set('classMode', v)} error={errors.classMode} />
          <div className="hidden lg:col-span-2 lg:block" />
        </>
      )}
      <CourseFields f={f} values={values} set={set} setMany={setMany} lookups={lookups} onAddCourse={onAddCourse} courseClass="col-span-2 lg:col-span-6" chapterClass="lg:col-span-3" />
      <Select label="Chap / Session Type" className="lg:col-span-3" options={SESSION_KINDS} sort={false} {...f('chapterType')} />
      <Textarea label="Chapter / Session Details" className="col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What you learned, shared or attended" {...f('chapterDetails')} />
    </div>
  );
}
