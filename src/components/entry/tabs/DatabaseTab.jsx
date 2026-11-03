import Input from '../../ui/Input';
import { makeField } from '../fieldProps';

// Matches the legacy DataBase Creation/Download tab.
export default function DatabaseTab({ values, errors, set }) {
  const f = makeField('database', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <Input label="College Name / Database Name" className="sm:col-span-2 lg:col-span-5" {...f('databaseName')} />
      <Input label="File Name" className="lg:col-span-4" {...f('fileName')} />
      <Input label="Total Records" className="lg:col-span-3" inputMode="numeric" {...f('records')} />
      <Input label="Stored Place" className="sm:col-span-2 lg:col-span-6" placeholder="e.g. Server \\Marketing\\2026" {...f('storedPlace')} />
    </div>
  );
}
