import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import * as api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { courseOptions } from './fieldProps';

const EMPTY = { courseId: '', startDate: '', batchTime: '', students: '', notes: '' };

/** Class tab "Request Batch No": email + WhatsApp to Manager / Admin, listed in Master › Course. */
export default function RequestBatchModal({ open, onClose, lookups, courseId }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, courseId: courseId || '' });
      setErrors({});
    }
  }, [open, courseId]);

  const change = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

  const send = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.courseId) errs.courseId = 'Pick the course';
    if (form.students && !/^\d{1,3}$/.test(form.students)) errs.students = 'Enter a number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    try {
      const res = await api.requestBatch({
        courseId: form.courseId,
        startDate: form.startDate || null,
        batchTime: form.batchTime.trim() || null,
        students: form.students ? Number(form.students) : null,
        notes: form.notes.trim() || null,
      });
      toast.success(`Request emailed to ${res.emailedTo} ${res.emailedTo === 1 ? 'address' : 'addresses'}${res.whatsappTo ? ` and sent on WhatsApp to ${res.whatsappTo} ${res.whatsappTo === 1 ? 'number' : 'numbers'}` : ''}.`, 'Batch No request sent');
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
      title="Request Batch No"
      description="An email and a WhatsApp message, both with your name, go to the Manager and Admin asking them to create a batch for this class. Once created, it appears in Batch No."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Send} onClick={send} loading={sending}>Send mail &amp; WhatsApp</Button>
        </>
      }
    >
      <form onSubmit={send} className="space-y-4">
        <Select searchable label="Course ID" required options={courseOptions(lookups)} value={form.courseId} error={errors.courseId} onChange={change('courseId')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Batch start date" type="date" value={form.startDate} onChange={change('startDate')} />
          <Input label="Batch time" placeholder="e.g. 10:00 – 12:00" maxLength={40} value={form.batchTime} onChange={change('batchTime')} />
        </div>
        <Input label="No of students" inputMode="numeric" maxLength={3} placeholder="optional" value={form.students} error={errors.students} onChange={change('students')} />
        <Textarea label="Remarks" rows={2} maxLength={500} placeholder="Anything the admin should know (optional)" value={form.notes} onChange={change('notes')} />
        {errors.form && <p className="rounded-md bg-danger-50 px-3 py-2 text-[13px] text-danger-700" role="alert">{errors.form}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
