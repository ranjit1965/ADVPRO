import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { makeField } from '../fieldProps';
import { FD_TYPES } from '../../../utils/entryForm';

/** Faculty Development: meetings and breaks. Remarks are required. */
export default function FacultyDevelopmentTab({ values, errors, set }) {
  const f = makeField('facultyDevelopment', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Select label="Type" className="lg:col-span-4" options={FD_TYPES} sort={false} {...f('fdType')} />
      <Textarea label="Remarks" className="lg:col-span-8" rows={2} maxLength={500} placeholder="What was discussed, or the break details" {...f('remarks')} />
    </div>
  );
}
