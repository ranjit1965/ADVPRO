import Input from '../../ui/Input';
import RadioGroup from '../../ui/RadioGroup';
import LookupSelect from '../LookupSelect';
import Textarea from '../../ui/Textarea';
import { makeField } from '../fieldProps';
import { PLACE_TYPES } from '../../../utils/entryForm';

/** Home / Office / College of a From or To place (old entries had free text: shown as College). */
const placeType = (type, place) => type || (!place ? '' : ['Home', 'Office'].includes(place) ? place : 'College');

/**
 * Travelling Time: From Place and To Place are Home, Office or a College from the college list
 * (Ctrl + A adds a college). Travel time itself comes from Time From / Time To above.
 */
export default function TravellingTab({ values, errors, set, setMany, lookups, onAddLookup }) {
  const f = makeField('travelling', values, errors, set);

  const place = (side, label) => {
    const typeKey = `${side}Type`;
    const placeKey = `${side}Place`;
    const type = placeType(values[typeKey], values[placeKey]);
    const pick = (t) => setMany({ [typeKey]: t, [placeKey]: t === 'College' ? '' : t });
    return (
      <div className="space-y-3 lg:col-span-6">
        <RadioGroup label={label} required name={`travel-${side}`} options={PLACE_TYPES} value={type} onChange={pick} error={type ? undefined : errors[placeKey]} />
        {type === 'College' && (
          <LookupSelect kind="colleges" label={`${label}: College`} options={lookups.colleges} onAddLookup={onAddLookup} placeholder="Search college" {...f(placeKey)} required />
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      {place('from', 'From Place')}
      {place('to', 'To Place')}
      <LookupSelect kind="travelModes" label="Mode of Travel" className="lg:col-span-4" options={lookups.travelModes || []} onAddLookup={onAddLookup} {...f('mode')} />
      <Input label="Purpose" className="lg:col-span-8" placeholder="e.g. College / OD class" {...f('purpose')} />
      <Textarea label="Remarks" className="sm:col-span-2 lg:col-span-12" rows={2} maxLength={500} {...f('remarks')} />
    </div>
  );
}
