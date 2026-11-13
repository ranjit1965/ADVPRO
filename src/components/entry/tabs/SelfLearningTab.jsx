import RadioGroup from '../../ui/RadioGroup';
import Select from '../../ui/Select';
import SearchableSelect from '../../ui/SearchableSelect';
import Textarea from '../../ui/Textarea';
import CourseFields from './CourseFields';
import LookupSelect from '../LookupSelect';
import { makeField, facultyOptions } from '../fieldProps';
import { CLASS_MODES, SELF_LEARNING_TYPES, SESSION_KINDS, materialKind } from '../../../utils/entryForm';

/**
 * Self Learning / Knowledge Sharing / Class Attended: Course ID, Chapter / Session No,
 * Chap / Session Type, Material Type and Details.
 * - Class Attended also asks who took the class and whether it was Online or Offline.
 * - Knowledge Sharing offers the Today's Session Type values as Chap / Session Type (Ctrl + A adds one)
 *   and asks who learned from me (trainee, any employee).
 * - Material Type appears once Chap / Session Type is chosen: the Theory list (PPT, Book, PDF ...) or,
 *   for a lab / practical / coding session, the Lab list (Guided Exercise, Cloud Lab ...). Ctrl + A adds a value.
 */
export default function SelfLearningTab({ values, errors, set, setMany, lookups, onAddLookup }) {
  const f = makeField('selfLearning', values, errors, set);
  const attended = values.learningType === 'Class Attended';
  const sharing = values.learningType === 'Knowledge Sharing';
  const kind = materialKind(values.chapterType);
  const employees = (lookups.employees || []).map((e) => ({ value: e.code, label: `${e.name} (${e.code})` }));
  const onType = (v) => setMany({ learningType: v, chapterType: '', materialType: '', ...(v !== 'Class Attended' && { classFaculty: '', classMode: '' }), ...(v !== 'Knowledge Sharing' && { trainee: '' }) });
  const onChapterType = (v) => setMany({ chapterType: v, materialType: '' });

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
      <RadioGroup className="col-span-2 lg:col-span-8" label="Type" required name="learningType" options={SELF_LEARNING_TYPES} value={values.learningType} onChange={onType} error={errors.learningType} />
      <div className="hidden lg:col-span-4 lg:block" />
      {attended && (
        <>
          <SearchableSelect label="Class taken by (faculty name)" required className="col-span-2 lg:col-span-6" options={facultyOptions(lookups)} placeholder="Search faculty" {...f('classFaculty')} />
          <RadioGroup className="col-span-2 lg:col-span-4" label="Online / Offline" required name="classMode" options={CLASS_MODES} value={values.classMode} onChange={(v) => set('classMode', v)} error={errors.classMode} />
          <div className="hidden lg:col-span-2 lg:block" />
        </>
      )}
      {sharing && (
        <>
          <SearchableSelect label="Trainee (who learned from me)" className="col-span-2 lg:col-span-6" options={employees} placeholder="Search employee" {...f('trainee')} />
          <div className="hidden lg:col-span-6 lg:block" />
        </>
      )}
      <CourseFields f={f} values={values} set={set} setMany={setMany} lookups={lookups} courseClass="col-span-2 lg:col-span-4" chapterClass="lg:col-span-2" />
      {sharing ? (
        <LookupSelect kind="sessionTypes" label="Chap / Session Type" className="lg:col-span-3" options={lookups.sessionTypes || []} onAddLookup={onAddLookup} {...f('chapterType')} onChange={(e) => onChapterType(e?.target ? e.target.value : e)} />
      ) : (
        <Select label="Chap / Session Type" className="lg:col-span-3" options={SESSION_KINDS} sort={false} {...f('chapterType')} onChange={(e) => onChapterType(e.target.value)} />
      )}
      {kind ? (
        <LookupSelect key={kind} kind={kind} label="Material Type" className="col-span-2 lg:col-span-3" options={lookups[kind] || []} onAddLookup={onAddLookup} {...f('materialType')} />
      ) : (
        <Select label="Material Type" className="col-span-2 lg:col-span-3" options={[]} placeholder="Chap / Session Type first" disabled {...f('materialType')} />
      )}
      <Textarea label="Chapter / Session Details" className="col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What you learned, shared or attended" {...f('chapterDetails')} />
    </div>
  );
}
