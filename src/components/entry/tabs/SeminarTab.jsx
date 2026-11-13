import Input from '../../ui/Input';
import YearInput from '../../ui/YearInput';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import RadioGroup from '../../ui/RadioGroup';
import SearchableSelect from '../../ui/SearchableSelect';
import LookupSelect from '../LookupSelect';
import CourseFields from './CourseFields';
import { makeField, facultyOptions } from '../fieldProps';
import { FACULTY_ROLES, SEMINAR_TYPES, SESSION_KINDS } from '../../../utils/entryForm';

/**
 * Seminar / Work Shop: Guest Lecture, IV / Work Shop or Internship.
 * Guest Lecture and IV ask for the college; Internship asks the same as Knowledge Sharing.
 * Faculty role: Main or Assistance faculty (Assistance asks for the main faculty).
 */
export default function SeminarTab({ values, errors, set, setMany, lookups, onAddLookup, onAddCourse }) {
  const f = makeField('seminar', values, errors, set);
  const internship = values.seminarType === 'Internship';
  const assistance = values.facultyRole === 'Assistance Faculty';
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-12">
      <RadioGroup className="col-span-2 lg:col-span-6" label="Type" required name="seminarType" options={SEMINAR_TYPES} value={values.seminarType} onChange={(v) => set('seminarType', v)} error={errors.seminarType} />
      <RadioGroup
        className="col-span-2 lg:col-span-6"
        label="Faculty role"
        name="seminar-facultyRole"
        options={FACULTY_ROLES}
        value={values.facultyRole || 'Main Faculty'}
        onChange={(v) => setMany({ facultyRole: v, ...(v !== 'Assistance Faculty' && { mainFaculty: '' }) })}
      />
      {assistance && <SearchableSelect label="Main faculty name" required className="col-span-2 lg:col-span-6" options={facultyOptions(lookups)} placeholder="Search faculty" {...f('mainFaculty')} />}
      {assistance && <div className="hidden lg:col-span-6 lg:block" />}
      {internship ? (
        <>
          <CourseFields f={f} values={values} set={set} setMany={setMany} lookups={lookups} onAddCourse={onAddCourse} courseClass="col-span-2 lg:col-span-6" chapterClass="lg:col-span-3" />
          <Select label="Chap / Session Type" className="lg:col-span-3" options={SESSION_KINDS} sort={false} {...f('chapterType')} />
          <Textarea label="Chapter / Session Details" required className="col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What was covered in the internship" {...f('chapterDetails')} />
        </>
      ) : (
        <>
          <LookupSelect kind="colleges" label="College Name" className="col-span-2 lg:col-span-5" options={lookups.colleges} onAddLookup={onAddLookup} {...f('collegeName')} required />
          <LookupSelect kind="departments" label="Dept" className="lg:col-span-3" options={lookups.departments} onAddLookup={onAddLookup} {...f('dept')} required />
          <Select label="Sec" className="lg:col-span-2" options={lookups.sections} {...f('sec')} />
          <Input label="Total Student" required className="lg:col-span-2" inputMode="numeric" {...f('totalStudent')} />
          <YearInput label="YOP" className="lg:col-span-2" options={lookups.yopOptions} {...f('yop')} />
          <RadioGroup className="lg:col-span-3" label="Database Collected" name="databaseCollected" options={['Yes', 'No']} value={values.databaseCollected} onChange={(v) => set('databaseCollected', v)} />
        </>
      )}
      {!internship && <Textarea label="Remarks" className="col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />}
    </div>
  );
}
