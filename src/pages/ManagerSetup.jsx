import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, ShieldCheck } from 'lucide-react';
import * as api from '../services/api';
import { useToast } from '../context/ToastContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Logo from '../components/layout/Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One-time manager account creation, verified by a code sent to the manager's email. */
export default function ManagerSetup() {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ name: '', email: '', userId: '', password: '', confirm: '', otp: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.getSetupStatus().then(setStatus).catch((e) => setFormError(e.message));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const sendCode = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!EMAIL_RE.test(form.email)) errs.email = 'Enter a valid email address';
    if (!/^[A-Za-z0-9._-]{3,}$/.test(form.userId)) errs.userId = 'At least 3 letters or digits';
    if (form.password.length < 8) errs.password = 'Use at least 8 characters';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api.requestManagerOtp(form.name.trim(), form.email.trim());
      setStep('otp');
      toast.success(`A verification code was sent to ${form.email}. It expires in ${r.expiresInMinutes} minutes.`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.otp)) {
      setErrors({ otp: 'Enter the 6-digit code' });
      return;
    }
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      await api.verifyManagerOtp({ email: form.email.trim(), otp: form.otp, name: form.name.trim(), userId: form.userId.trim(), password: form.password });
      toast.success('Manager account created. Sign in to add employees.');
      navigate('/login', { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Logo size="lg" />
        <h1 className="mt-6 flex items-center gap-2 text-xl font-semibold text-ink-900">
          <ShieldCheck className="size-5 text-brand-600" aria-hidden /> Create manager account
        </h1>
        <p className="mt-1 text-sm text-ink-500">Only one manager account can exist. The manager adds every employee.</p>

        {formError && (
          <div role="alert" className="mt-4 rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
            {formError}
          </div>
        )}

        {status?.managerExists ? (
          <div className="mt-6 space-y-4 text-sm text-ink-600">
            <p>A manager account already exists. Ask the manager to create your login.</p>
            <Link to="/login" className="font-medium text-brand-700 hover:underline">Back to sign in</Link>
          </div>
        ) : step === 'details' ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
            <Input label="Full name" required value={form.name} error={errors.name} onChange={set('name')} />
            <Input label="Email" type="email" required value={form.email} error={errors.email} onChange={set('email')} hint="The verification code is sent here." />
            <Input label="User ID" required autoComplete="username" value={form.userId} error={errors.userId} onChange={set('userId')} />
            <Input label="Password" type="password" required autoComplete="new-password" value={form.password} error={errors.password} onChange={set('password')} />
            <Input label="Confirm password" type="password" required autoComplete="new-password" value={form.confirm} error={errors.confirm} onChange={set('confirm')} />
            <Button type="submit" size="lg" icon={MailCheck} loading={busy} disabled={!status} className="w-full">Send verification code</Button>
            <p className="text-center text-sm"><Link to="/login" className="text-brand-700 hover:underline">Back to sign in</Link></p>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4" noValidate>
            <p className="text-sm text-ink-600">Enter the 6-digit code sent to <b>{form.email}</b>.</p>
            <p className="text-xs text-ink-500">Check your inbox and spam folder. The code expires in 10 minutes.</p>
            <Input label="Verification code" required inputMode="numeric" maxLength={6} autoFocus value={form.otp} error={errors.otp} onChange={(e) => setForm({ ...form, otp: e.target.value.replace(/\D/g, '') })} />
            <Button type="submit" size="lg" icon={ShieldCheck} loading={busy} className="w-full">Verify and create account</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setStep('details')}>Change details</button>
              <button type="button" className="text-brand-700 hover:underline" disabled={busy} onClick={sendCode}>Resend code</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
