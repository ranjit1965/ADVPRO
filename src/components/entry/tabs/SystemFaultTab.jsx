import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import { makeField } from '../fieldProps';
import { FAULT_STATUS } from '../../../utils/constants';

export default function SystemFaultTab({ values, errors, set, lookups }) {
  const f = makeField('systemFault', values, errors, set);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <Select label="Product Type" className="lg:col-span-3" options={lookups.productTypes} {...f('productType')} />
      <Select label="Location" className="lg:col-span-3" options={lookups.locations} {...f('location')} />
      <Select label="Advpro No" className="lg:col-span-3" options={lookups.advproNos || []} {...f('advproNo')} />
      <Input label="Product No" className="lg:col-span-3" placeholder="Serial / asset number" {...f('productNo')} />
      <Input label="Fault / Error" className="lg:col-span-9" {...f('faultError')} />
      <Select label="Status" className="lg:col-span-3" options={FAULT_STATUS} {...f('faultStatus')} />
      <Textarea label="Solution" className="lg:col-span-6" rows={2} maxLength={500} {...f('solution')} />
      <Textarea label="Remarks" className="lg:col-span-6" rows={2} maxLength={500} {...f('remarks')} />
    </div>
  );
}
