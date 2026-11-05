import { useState } from 'react';
import { KeyRound, Save, UserRound } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import RadioGroup from '../components/ui/RadioGroup';
import DescriptionList from '../components/ui/DescriptionList';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePreferences } from '../hooks/usePreferences';
import * as api from '../services/api';
import { ACTIVITY_TYPES } from '../utils/constants';
import { initials } from '../utils/format';

export default function Settings() {
  const { user } = useAuth();
  // Only Admin (and the Manager account) can change passwords; everyone else asks Admin.
  const canChangePassword = ['ADMIN', 'MANAGER'].includes(user.role);
  const toast = useToast();
  const [prefs, setPrefs] = usePreferences();
  const [draft, setDraft] = useState(prefs);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [savingPwd, setSavingPwd] = useState(false);

  const savePrefs = async () => {
    try {
      await setPrefs(draft);
      toast.success('Preferences saved.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pwd.current) errs.current = 'Required';
    if (pwd.next.length < 8) errs.next = 'Use at least 8 characters';
    if (pwd.confirm !== pwd.next) errs.confirm = 'Passwords do not match';
    setPwdErrors(errs);
    if (Object.keys(errs).length) return;
    setSavingPwd(true);
    try {
      await api.changePassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Password changed successfully.');
    } catch (err) {
      setPwdErrors({ current: err.message });
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description={canChangePassword ? 'Your profile, password and preferences.' : 'Your profile and preferences.'} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Profile" className="xl:row-span-2">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-brand-100 text-lg font-semibold text-brand-800">{initials(user.name)}</span>
            <div>
              <p className="text-base font-semibold text-ink-900">{user.name}</p>
              <p className="text-[13px] text-ink-500">{user.email}</p>
            </div>
          </div>
          <DescriptionList
            className="mt-6 !grid-cols-1"
            items={[
              { label: 'User ID', value: user.userId },
              { label: 'Faculty code', value: user.code },
              { label: 'Designation', value: user.designation },
              { label: 'Grade', value: user.grade },
              { label: 'Department', value: user.department },
              { label: 'Branch', value: user.branch },
            ]}
          />
          <p className="mt-6 flex items-center gap-2 text-xs text-ink-500">
            <UserRound className="size-4" aria-hidden /> Profile details are maintained by Admin.
          </p>
        </Card>

        <Card title="Preferences" description="Defaults for the Daily Activity Entry screen" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Default activity tab" placeholder="Class" options={ACTIVITY_TYPES.map((a) => ({ value: a.key, label: a.label }))} value={draft.defaultTab} onChange={(e) => setDraft({ ...draft, defaultTab: e.target.value || 'class' })} />
            <RadioGroup label="Default Faculty in" value={draft.defaultFacultyIn} onChange={(v) => setDraft({ ...draft, defaultFacultyIn: v })} options={[{ value: 'Center', label: 'Center' }, { value: 'Outstation', label: 'College / OD' }]} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button icon={Save} onClick={savePrefs}>
              Save preferences
            </Button>
          </div>
        </Card>

        {canChangePassword ? (
        <Card title="Change password" className="xl:col-span-2">
          <form onSubmit={changePassword} className="grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
            <Input label="Current password" type="password" required autoComplete="current-password" value={pwd.current} error={pwdErrors.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
            <Input label="New password" type="password" required autoComplete="new-password" value={pwd.next} error={pwdErrors.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
            <Input label="Confirm new password" type="password" required autoComplete="new-password" value={pwd.confirm} error={pwdErrors.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            <div className="flex justify-end sm:col-span-3">
              <Button type="submit" icon={KeyRound} loading={savingPwd}>
                Change password
              </Button>
            </div>
          </form>
        </Card>
        ) : (
          <Card title="Password" className="xl:col-span-2">
            <p className="flex items-center gap-2 text-[13px] text-ink-600">
              <KeyRound className="size-4 text-ink-400" aria-hidden /> Passwords are changed by Admin only. Contact Admin to change your password.
            </p>
          </Card>
        )}

      </div>
    </>
  );
}
