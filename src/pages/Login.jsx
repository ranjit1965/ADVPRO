import { useEffect, useState } from 'react';
import * as api from '../services/api';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

const LAST_UPDATE = '10/Oct/2026';

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ userId: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [setup, setSetup] = useState(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    api.getSetupStatus().then(setSetup).catch(() => {});
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.userId.trim()) errs.userId = 'User ID is required';
    if (!form.password) errs.password = 'Password is required';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const u = await login(form.userId.trim(), form.password);
      toast.success(`Welcome back, ${u.name}.`);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="px-4 pt-4 sm:px-6">
        <img src="/advpro-banner.png" alt="Environmental Leader · Vectra Technosoft · Advantage Pro, IT training division of Vectra Technosoft Pvt. Ltd." className="h-auto w-full max-w-[640px]" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:justify-start sm:pl-[34%]">
        <div className="w-full max-w-sm">
          <h1 className="sr-only">Sign in</h1>
          <form onSubmit={submit} className="space-y-3" noValidate>
            {formError && (
              <div role="alert" className="rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 items-center gap-x-4 gap-y-3 sm:grid-cols-[96px_1fr]">
              <label htmlFor="login-user" className="font-serif text-[15px] font-bold text-[#6b5a12]">User ID</label>
              <div>
                <input id="login-user" className="field-control" autoFocus autoComplete="username" aria-invalid={!!errors.userId} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
                {errors.userId && <p className="mt-1 text-xs text-danger-600">{errors.userId}</p>}
              </div>
              <label htmlFor="login-password" className="font-serif text-[15px] font-bold text-[#6b5a12]">Password</label>
              <div className="relative">
                <input id="login-password" className="field-control pr-10" type={showPwd ? 'text' : 'password'} autoComplete="current-password" aria-invalid={!!errors.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute top-2 right-2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password}</p>}
              </div>
              <div className="hidden sm:block" />
              <Button type="submit" icon={LogIn} loading={submitting} className="w-full">
                Sign in
              </Button>
              {setup?.managerExists && (
                <>
                  <div className="hidden sm:block" />
                  <button type="button" onClick={() => setForgotOpen(true)} className="justify-self-end text-sm font-medium text-brand-700 hover:underline">
                    Forgot password? (Manager)
                  </button>
                </>
              )}
            </div>
          </form>

          {setup && !setup.managerExists && (
            <p className="mt-5 text-sm text-ink-600">
              First time here? <Link to="/setup-manager" className="font-medium text-brand-700 hover:underline">Create the manager account</Link>
            </p>
          )}
        </div>
      </main>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialUserId={form.userId}
        onDone={(userId) => {
          setForm({ userId, password: '' });
          setFormError('');
          toast.success('Password changed. Sign in with the new password.');
        }}
      />

      <footer className="px-4 pb-6 sm:px-2">
        <p className="text-lg font-bold text-[#1a1aa6]">Last update on : {LAST_UPDATE}</p>
      </footer>
    </div>
  );
}
