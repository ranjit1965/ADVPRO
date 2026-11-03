import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const TITLES = { colleges: 'Add College Name', departments: 'Add Dept', othersHeadings: 'Add Heading' };
const LABELS = { colleges: 'College Name', departments: 'Dept', othersHeadings: 'Heading' };

export default function AddLookupModal({ kind, onClose, onSubmit }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue('');
    setError('');
  }, [kind]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!value.trim()) return setError('Enter a name');
    setSaving(true);
    try {
      await onSubmit(value.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={TITLES[kind]}
      description="The new value is added to the master list and selected in the form."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Add
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Input label={LABELS[kind]} required value={value} error={error} onChange={(e) => setValue(e.target.value)} />
      </form>
    </Modal>
  );
}
