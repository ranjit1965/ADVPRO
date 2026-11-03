import RadioGroup from '../../ui/RadioGroup';
import Textarea from '../../ui/Textarea';
import CourseFields from './CourseFields';
import { makeField } from '../fieldProps';
import { SELF_LEARNING_TYPES } from '../../../utils/entryForm';

/** Self Learning / Knowledge Sharing: Type, Course ID, Chapter / Session No, Details. */
export default function SelfLearningTab({ values, errors, set, setMany, lookups, onAddCourse }) {
  const f = makeField('selfLearning', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <RadioGroup className="sm:col-span-2 lg:col-span-6" label="Type" required name="learningType" options={SELF_LEARNING_TYPES} value={values.learningType} onChange={(v) => set('learningType', v)} error={errors.learningType} />
      <div className="hidden lg:col-span-6 lg:block" />
      <CourseFields f={f} values={values} set={set} setMany={setMany} lookups={lookups} onAddCourse={onAddCourse} courseClass="sm:col-span-2 lg:col-span-5" chapterClass="lg:col-span-2" />
      <Textarea label="Chapter / Session Details" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What you learned or shared" {...f('chapterDetails')} />
    </div>
  );
}
