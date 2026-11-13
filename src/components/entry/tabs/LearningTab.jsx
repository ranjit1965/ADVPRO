import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import CourseFields from './CourseFields';
import { makeField } from '../fieldProps';

/** Course Preparation: Course ID (Request new course), Chapter / Session No, Material Type, Activity Quantity, Details. */
export default function LearningTab({ values, errors, set, setMany, lookups, onRequestCourse }) {
  const f = makeField('learning', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <CourseFields f={f} values={values} set={set} setMany={setMany} lookups={lookups} onRequestCourse={onRequestCourse} courseClass="sm:col-span-2 lg:col-span-5" chapterClass="lg:col-span-2" />
      <Select label="Material Type" className="lg:col-span-3" options={lookups.materialTypes} {...f('materialType')} />
      <Input label="Activity Quantity" className="lg:col-span-2" inputMode="numeric" maxLength={5} placeholder="Numbers only" {...f('pages')} onChange={(e) => set('pages', e.target.value.replace(/\D/g, ''))} />
      <Textarea label="Chapter / Session Details" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="Type the chapter / session details" {...f('chapterDetails')} />
    </div>
  );
}
