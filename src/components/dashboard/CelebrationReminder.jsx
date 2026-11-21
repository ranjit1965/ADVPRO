import { useEffect, useState } from 'react';
import { BellOff, Cake, Heart, X } from 'lucide-react';
import * as api from '../../services/api';
import Button from '../ui/Button';
import { formatDate } from '../../utils/format';

const CHEER = {
  birthday: (e) => `Hurrah! ${e.name}'s birthday is ${when(e)} 🎂`,
  anniversary: (e) => `Hurrah! ${e.name}'s wedding anniversary is ${when(e)} 💐`,
};
const when = (e) => (e.daysLeft === 0 ? 'today' : e.daysLeft === 1 ? 'tomorrow' : `in ${e.daysLeft} days`);

/**
 * v59: HR, Admin and Super Admin see the external faculty birthdays / anniversaries of the next 10 days, one
 * pop-up at a time, dropping from the top to the centre. Snooze: back in the next session (morning or evening).
 * Dismiss: gone for that faculty this year. Wishes are sent from Master › External Faculty on the day.
 */
export default function CelebrationReminder() {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.getCelebrationReminders().then((l) => live && setList(l || [])).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const e = list[0];
  if (!e) return null;

  const act = async (action) => {
    setBusy(true);
    try {
      await api.actOnCelebration(action, e.key);
    } catch {
      /* a failed snooze only means it shows again */
    } finally {
      setBusy(false);
      setList((l) => l.slice(1));
    }
  };
  const Icon = e.kind === 'birthday' ? Cake : Heart;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div className="animate-drop-in w-full max-w-md rounded-2xl border border-brand-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="size-6" aria-hidden />
        </div>
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{e.kind === 'birthday' ? 'Birthday reminder' : 'Anniversary reminder'}</p>
        <h2 id="celebration-title" className="mt-1 text-lg font-bold text-ink-900">{e.name}</h2>
        <p className="mt-1 text-sm text-ink-700">{CHEER[e.kind](e)}</p>
        <p className="mt-1 text-[13px] text-ink-500">Date: {formatDate(e.date)}{e.daysLeft === 0 ? ' · send wishes from Master › External Faculty' : ''}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" icon={BellOff} loading={busy} onClick={() => act('snooze')}>Snooze</Button>
          <Button variant="danger-outline" icon={X} disabled={busy} onClick={() => act('dismiss')}>Dismiss</Button>
        </div>
        {list.length > 1 && <p className="mt-3 text-[11px] text-ink-400">{list.length - 1} more reminder{list.length > 2 ? 's' : ''}</p>}
      </div>
    </div>
  );
}
