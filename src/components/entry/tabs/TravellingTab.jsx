import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { makeField } from '../fieldProps';

// Not in the reference screenshots. Travel time itself comes from Time From / Time To above.
export default function TravellingTab({ values, errors, set, lookups }) {
  const f = makeField('travelling', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <Input label="From Place" className="lg:col-span-3" {...f('fromPlace')} />
      <Input label="To Place" className="lg:col-span-3" list="travel-places" {...f('toPlace')} />
      <datalist id="travel-places">
        {lookups.colleges.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Select label="Mode of Travel" className="lg:col-span-2" options={lookups.travelModes} {...f('mode')} />
      <Input label="Purpose" className="sm:col-span-2 lg:col-span-4" placeholder="e.g. College / OD class" {...f('purpose')} />
      <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
    </div>
  );
}
