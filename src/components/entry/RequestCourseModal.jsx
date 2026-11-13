import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import * as api from '../../services/api';
import { useToast } from '../../context/ToastContext';

const EMPTY = { courseName: '', courseId: '', notes: '' };

/** Class tab: asks Manager / Admin by email to add a course that is not in the Course ID list. */
export default function RequestCourseModal({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }, [open]);

  const change = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: k === 'courseId' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

  const send = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (form.courseName.trim().length < 2) errs.courseName = 'Enter the course name';
    if (form.courseId && !/^[A-Z0-9+#._-]{2,20}$/.test(form.courseId)) errs.courseId = '2 to 20 letters or numbers, no spaces';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    try {
      const res = await api.requestCourse({ courseName: form.courseName.trim(), courseId: form.courseId, notes: form.notes });
      toast.success(`Request emailed to ${res.emailedTo} ${res.emailedTo === 1 ? 'address' : 'addresses'}${res.whatsappTo ? ` and sent on WhatsApp to ${res.whatsappTo} ${res.whatsappTo === 1 ? 'number' : 'numbers'}` : ''}.`, 'Course request sent');
      onClose();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a new course"
      description="An email goes to the Manager and Admin asking them to add this course. Once added, it appears in Course ID."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Send} onClick={send} loading={sending}>
            Send mail
          </Button>
        </>
      }
    >
      <form onSubmit={send} className="space-y-4">
        <Input label="Course name" required placeholder="e.g. DevOps with AWS" maxLength={120} value={form.courseName} error={errors.courseName} onChange={change('courseName')} />
        <Input label="Suggested Course ID" placeholder="e.g. DEVOPS (optional)" maxLength={20} value={form.courseId} error={errors.courseId} onChange={change('courseId')} />
        <Textarea label="Remarks" rows={2} maxLength={500} placeholder="Batch, start date or anything the admin should know (optional)" value={form.notes} onChange={change('notes')} />
        {errors.form && <p className="rounded-md bg-danger-50 px-3 py-2 text-[13px] text-danger-700" role="alert">{errors.form}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
