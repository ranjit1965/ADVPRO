import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const EMPTY = { id: '', name: '' };

/** "Add course" from the Learning tab. The course is saved to the Master course list and selected in the form. */
export default function AddCourseModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }, [open]);

  const change = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: k === 'id' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!/^[A-Z0-9+#._-]{2,20}$/.test(form.id)) errs.id = '2 to 20 letters or numbers, no spaces';
    if (!form.name.trim()) errs.name = 'Enter the course name';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await onSubmit({ id: form.id, name: form.name.trim() });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add course"
      description="The course is added to the course list and selected in the form."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Add course
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Course ID" required placeholder="e.g. DEVOPS" maxLength={20} value={form.id} error={errors.id} onChange={change('id')} hint="Short code shown in reports" />
        <Input label="Course Name" required placeholder="e.g. DevOps with AWS" maxLength={120} value={form.name} error={errors.name} onChange={change('name')} />
        {errors.form && <p className="text-[13px] text-danger-600">{errors.form}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
