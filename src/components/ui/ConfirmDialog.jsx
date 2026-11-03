import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }) {
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${danger ? 'bg-danger-50 text-danger-600' : 'bg-brand-50 text-brand-700'}`}>
          {danger ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
        </span>
        <p className="pt-2 text-ink-700">{message}</p>
      </div>
    </Modal>
  );
}
