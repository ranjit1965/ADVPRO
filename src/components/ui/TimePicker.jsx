import TimeField from './TimeField';

/** 24-hour time box (HH:MM, no AM / PM on any computer). onChange gets an event-like { target: { value } }. */
export default function TimePicker({ onChange, ...props }) {
  return <TimeField {...props} onChange={(v) => onChange?.({ target: { value: v } })} />;
}
