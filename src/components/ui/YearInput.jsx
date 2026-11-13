import { forwardRef } from 'react';
import Select from './Select';
import { yopYears } from '../../utils/entryForm';

/**
 * YOP dropdown: the current year and the next five (e.g. 2026 to 2031).
 * A year saved earlier outside that range stays listed so old entries still show it.
 * Same onChange(event) contract as Input. `options` (the old saved YOP list) is ignored.
 */
const YearInput = forwardRef(function YearInput({ options: _ignored, value, placeholder = 'Select', ...props }, ref) {
  const years = yopYears();
  const list = value && !years.includes(String(value)) ? [String(value), ...years] : years;
  return <Select ref={ref} sort={false} options={list} placeholder={placeholder} value={value ?? ''} {...props} />;
});

export default YearInput;
