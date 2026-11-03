import Input from './Input';

/** Native time picker (value is HH:MM, 24h). */
export default function TimePicker(props) {
  return <Input type="time" step={300} {...props} />;
}
