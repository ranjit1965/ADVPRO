import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, ChevronDown, Clock, LogOut, Menu, Search, Settings, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNotifications } from '../../services/api';
import { formatClock, formatDate, initials } from '../../utils/format';
import { cn } from '../../utils/cn';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => !ref.current?.contains(e.target) && onOutside();
    const k = (e) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [ref, onOutside]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  useEffect(() => {
    getNotifications().then(setItems);
  }, []);
  const unread = items.filter((n) => n.unread).length;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger-500 ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="font-semibold text-ink-900">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setItems((l) => l.map((n) => ({ ...n, unread: false })))}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-2.5 hover:bg-ink-50">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.unread ? 'bg-brand-600' : 'bg-transparent')} />
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{n.title}</p>
                  <p className="text-[13px] text-ink-600">{n.body}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ onLogout }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ink-100" aria-expanded={open} aria-haspopup="menu">
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(user?.name)}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-semibold text-ink-900">{user?.name}</span>
          <span className="block text-[11px] text-ink-500">{user?.designation}</span>
        </span>
        <ChevronDown className="hidden size-4 text-ink-400 md:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-ink-200 bg-white py-1 shadow-pop">
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="font-semibold text-ink-900">{user?.name}</p>
            <p className="text-xs text-ink-500">
              {user?.designation} · Grade {user?.grade}
            </p>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-ink-700 hover:bg-ink-50">
            <UserRound className="size-4" /> My profile
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-ink-700 hover:bg-ink-50">
            <Settings className="size-4" /> Settings
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 border-t border-ink-100 px-4 py-2 text-danger-600 hover:bg-danger-50"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onOpenMobile, onLogout }) {
  const { user } = useAuth();
  const now = useClock();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const onSearch = (e) => {
    e.preventDefault();
    navigate(`/faculty/daily-activity/history${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <header className="no-print sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button onClick={onOpenMobile} className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <p className="truncate text-[15px] font-semibold text-ink-900 lg:hidden">Daily Entry Report</p>

        <form onSubmit={onSearch} role="search" className="relative hidden max-w-sm flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field-control pl-9" placeholder="Search entries, colleges, courses…" aria-label="Search entries" />
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Legacy status bar: date, time, user, designation, grade */}
          <div className="mr-2 hidden items-center gap-4 text-[13px] text-ink-600 xl:flex">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-ink-400" aria-hidden />
              {formatDate(now)}
            </span>
            <span className="flex items-center gap-1.5 tabular-nums">
              <Clock className="size-4 text-ink-400" aria-hidden />
              {formatClock(now)}
            </span>
            <span className="h-5 w-px bg-ink-200" />
            <span>
              Designation: <b className="font-semibold text-ink-900">{user?.designation}</b>
            </span>
            <span>
              Grade: <b className="font-semibold text-ink-900">{user?.grade}</b>
            </span>
          </div>
          <Notifications />
          <ProfileMenu onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
