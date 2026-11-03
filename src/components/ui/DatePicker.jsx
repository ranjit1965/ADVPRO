import Input from './Input';

/** Native date picker (value is YYYY-MM-DD, which the API uses). */
export default function DatePicker(props) {
  return <Input type="date" {...props} />;
}
