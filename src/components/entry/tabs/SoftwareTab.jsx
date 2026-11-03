import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { makeField } from '../fieldProps';

// Not in the reference screenshots: fields cover software installation / maintenance work.
export default function SoftwareTab({ values, errors, set, lookups }) {
  const f = makeField('software', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <Input label="Software Name" className="lg:col-span-4" placeholder="e.g. RHEL 9, Packet Tracer" {...f('softwareName')} />
      <Select label="Activity" className="lg:col-span-3" options={lookups.softwareActivities} {...f('softwareActivity')} />
      <Select label="Location" className="lg:col-span-3" options={lookups.locations} {...f('location')} />
      <Input label="No of Systems" className="lg:col-span-2" inputMode="numeric" {...f('systems')} />
      <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
    </div>
  );
}
