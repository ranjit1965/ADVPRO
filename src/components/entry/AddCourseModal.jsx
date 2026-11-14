import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import CourseFormFields, { EMPTY_COURSE, courseBody, validateCourse } from '../master/CourseFormFields';

/** "Add course" from the Learning tab. The course is saved to the Master course list and selected in the form. */
export default function AddCourseModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_COURSE);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_COURSE);
      setErrors({});
    }
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    const errs = validateCourse(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await onSubmit(courseBody(form));
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
      description="Course ID, Course Name and Instalment Amt are required. The course is added to the course list and selected in the form."
      size="lg"
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
        <CourseFormFields form={form} errors={errors} onChange={(f) => { setForm(f); setErrors({}); }} />
        {errors.form && <p className="text-[13px] text-danger-600">{errors.form}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
