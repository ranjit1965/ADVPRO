import { useEffect, useState } from 'react';
import * as api from '../services/api';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';

/**
 * Forgot password, manager account only: a 6-digit code is emailed to the manager's email on
 * record, then the code and a new password set it. Other employees ask the Manager or Admin.
 */
export default function ForgotPasswordModal({ open, onClose, initialUserId = '', onDone }) {
  const [step, setStep] = useState('request'); // request | reset
  const [form, setForm] = useState({ userId: initialUserId, otp: '', newPassword: '', confirm: '' });
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, userId: initialUserId }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const close = () => {
    setStep('request');
    setForm({ userId: initialUserId, otp: '', newPassword: '', confirm: '' });
    setError('');
    onClose();
  };

  const send = async () => {
    if (!form.userId.trim()) return setError('Enter the manager User ID');
    setBusy(true);
    setError('');
    try {
      const res = await api.requestPasswordResetOtp(form.userId.trim());
      setSentTo(res.email);
      setStep('reset');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!/^\d{6}$/.test(form.otp)) return setError('Enter the 6-digit code from the email');
    if (form.newPassword.length < 8) return setError('Use at least 8 characters for the new password');
    if (form.newPassword !== form.confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError('');
    try {
      await api.resetPasswordWithOtp({ userId: form.userId.trim(), otp: form.otp, newPassword: form.newPassword });
      onDone?.(form.userId.trim());
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Forgot password (Manager)"
      description="Only the manager account can reset its password here. Other employees ask the Manager or Admin to set a new one."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          {step === 'request' ? (
            <Button loading={busy} onClick={send}>Send code to email</Button>
          ) : (
            <Button loading={busy} onClick={reset}>Set new password</Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {error && <div role="alert" className="rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">{error}</div>}
        <Input label="Manager User ID" value={form.userId} onChange={set('userId')} readOnly={step === 'reset'} autoComplete="username" />
        {step === 'reset' && (
          <>
            <p className="text-sm text-ink-600">
              A 6-digit code was sent to <b>{sentTo}</b>. It expires in a few minutes.{' '}
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={send} disabled={busy}>Send again</button>
            </p>
            <Input label="Code from email" inputMode="numeric" maxLength={6} value={form.otp} onChange={set('otp')} autoComplete="one-time-code" />
            <Input label="New password" type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" hint="At least 8 characters" />
            <Input label="Confirm new password" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </>
        )}
      </div>
    </Modal>
  );
}
