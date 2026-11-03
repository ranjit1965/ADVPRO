import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lock, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NAVIGATION, FOOTER_NAVIGATION } from '../../config/navigation';
import { cn } from '../../utils/cn';
import Logo from './Logo';
import { useAuth } from '../../context/AuthContext';
import { canAccess } from '../../utils/permissions';

const containsPath = (item, path) => (item.to && (item.to === '/' ? path === '/' : path.startsWith(item.to))) || item.children?.some((c) => containsPath(c, path));

const ITEM_IDLE = 'text-ink-600 hover:bg-brand-50 hover:text-brand-700';
const ITEM_ACTIVE = 'bg-brand-100 text-brand-800';

/* ------------------------------------------------------------------ */
/* Flyout menus (desktop): a group opens as a panel to the right of the */
/* sidebar, like the legacy Advpro menu. Nested groups cascade further. */
/* ------------------------------------------------------------------ */

function FlyoutPanel({ item, anchor, level = 0, onNavigate, panelRefs }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.top });
  const [sub, setSub] = useState(null); // { item, anchor }
  const children = item.children.filter((c) => canAccess(user, c.roles));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    setPos({ left: anchor.left, top });
  }, [anchor.left, anchor.top]);

  useEffect(() => {
    panelRefs.current[level] = ref.current;
    return () => {
      panelRefs.current[level] = null;
    };
  }, [level, panelRefs]);

  const openSub = (c, el) => {
    const r = el.getBoundingClientRect();
    setSub({ item: c, anchor: { left: r.right + 4, top: r.top - 6 } });
  };

  return (
    <>
      <div
        ref={ref}
        role="menu"
        aria-label={item.label}
        style={{ left: pos.left, top: pos.top }}
        className="no-print fixed z-50 max-h-[calc(100vh-16px)] w-60 overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5 shadow-pop"
      >
        {level === 0 && <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{item.label}</p>}
        <ul className="space-y-0.5">
          {children.map((c) => {
            const active = containsPath(c, pathname);
            if (c.children) {
              const isOpen = sub?.item.key === c.key;
              return (
                <li key={c.key}>
                  <button
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    onMouseEnter={(e) => openSub(c, e.currentTarget)}
                    onClick={(e) => (isOpen ? setSub(null) : openSub(c, e.currentTarget))}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium', isOpen || active ? ITEM_ACTIVE : ITEM_IDLE)}
                  >
                    <span className="flex-1 truncate">{c.label}</span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden />
                  </button>
                </li>
              );
            }
            if (c.restricted) {
              return (
                <li key={c.key}>
                  <span className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-400" aria-disabled="true">
                    <span className="flex-1 truncate">{c.label}</span>
                    <Lock className="size-3.5" aria-label="Restricted" />
                  </span>
                </li>
              );
            }
            return (
              <li key={c.key} onMouseEnter={() => setSub(null)}>
                <NavLink
                  role="menuitem"
                  to={c.to}
                  onClick={onNavigate}
                  className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium', isActive ? ITEM_ACTIVE : ITEM_IDLE)}
                >
                  <span className="flex-1 truncate">{c.label}</span>
                  <ChevronRight className="size-3.5 shrink-0 opacity-40" aria-hidden />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
      {sub && <FlyoutPanel key={sub.item.key} item={sub.item} anchor={sub.anchor} level={level + 1} onNavigate={onNavigate} panelRefs={panelRefs} />}
    </>
  );
}

function FlyoutGroup({ item, collapsed, flyout, setFlyout }) {
  const { pathname } = useLocation();
  const activeInside = containsPath(item, pathname);
  const isOpen = flyout?.key === item.key;
  const Icon = item.icon;

  const open = (el) => {
    const r = el.getBoundingClientRect();
    const aside = el.closest('aside')?.getBoundingClientRect();
    setFlyout({ key: item.key, item, anchor: { left: (aside?.right ?? r.right) + 6, top: r.top - 6 } });
  };

  return (
    <li>
      <button
        data-flyout-trigger
        onClick={(e) => (isOpen ? setFlyout(null) : open(e.currentTarget))}
        onMouseEnter={(e) => flyout && !isOpen && open(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium transition-colors',
          isOpen || activeInside ? ITEM_ACTIVE : ITEM_IDLE,
          collapsed && 'justify-center px-0',
        )}
      >
        {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <ChevronRight className={cn('size-4 shrink-0 transition-transform', isOpen && 'translate-x-0.5')} aria-hidden />
          </>
        )}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Inline accordion (mobile drawer)                                    */
/* ------------------------------------------------------------------ */

function NavGroup({ item, depth, onNavigate }) {
  const { pathname } = useLocation();
  const activeInside = containsPath(item, pathname);
  const [open, setOpen] = useState(activeInside || ['faculty', 'daily-activity'].includes(item.key));
  useEffect(() => {
    if (activeInside) setOpen(true);
  }, [activeInside]);

  const Icon = item.icon;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg py-1.5 text-left text-[13px] font-medium transition-colors',
          depth === 0 ? 'px-3' : 'pr-3 pl-4',
          activeInside ? 'text-brand-800' : ITEM_IDLE,
        )}
      >
        {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
      </button>
      {open && (
        <ul className={cn('mt-0.5 space-y-0.5', depth === 0 && 'ml-[21px] border-l border-ink-200 pl-0')}>
          {item.children.map((c) => (
            <NavItem key={c.key} item={c} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NavItem({ item, depth = 0, collapsed, flyoutMode, flyout, setFlyout, onNavigate, onAction }) {
  const { user } = useAuth();
  if (!canAccess(user, item.roles)) return null;
  if (item.children) {
    if (flyoutMode && depth === 0) return <FlyoutGroup item={item} collapsed={collapsed} flyout={flyout} setFlyout={setFlyout} />;
    return <NavGroup item={item} depth={depth} onNavigate={onNavigate} />;
  }
  const Icon = item.icon;
  const base = cn('flex w-full items-center gap-3 rounded-lg py-1.5 text-[13px] font-medium transition-colors', depth === 0 ? 'px-3' : depth === 1 ? 'pr-3 pl-4' : 'pr-3 pl-9', collapsed && 'justify-center px-0');
  const closeFlyout = () => setFlyout?.(null);

  if (item.restricted) {
    return (
      <li onMouseEnter={closeFlyout}>
        <span className={cn(base, 'cursor-not-allowed text-ink-400')} title={`${item.label} is not available for your role`} aria-disabled="true">
          {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              <Lock className="size-3.5 shrink-0" aria-label="Restricted" />
            </>
          )}
        </span>
      </li>
    );
  }
  if (item.action) {
    return (
      <li>
        <button onClick={() => onAction(item.action)} title={collapsed ? item.label : undefined} className={cn(base, ITEM_IDLE)}>
          {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
          {!collapsed && <span className="truncate">{item.label}</span>}
        </button>
      </li>
    );
  }
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) => cn(base, isActive ? ITEM_ACTIVE : ITEM_IDLE)}
      >
        {Icon ? <Icon className="size-[18px] shrink-0" aria-hidden /> : depth > 0 && <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    </li>
  );
}

export default function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onLogout }) {
  const { pathname } = useLocation();
  const [flyout, setFlyout] = useState(null); // { key, item, anchor }
  const panelRefs = useRef([]);

  // Close the flyout on navigation, Escape, resize, sidebar scroll or a click outside it.
  useEffect(() => setFlyout(null), [pathname, collapsed]);
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e) => {
      if (e.target.closest?.('[data-flyout-trigger]')) return;
      if (panelRefs.current.some((p) => p?.contains(e.target))) return;
      setFlyout(null);
    };
    const onKey = (e) => e.key === 'Escape' && setFlyout(null);
    const close = () => setFlyout(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [flyout]);

  const sharedProps = { onNavigate: onCloseMobile, onAction: (a) => a === 'logout' && onLogout() };

  const content = (isMobile) => {
    const c = isMobile ? false : collapsed;
    const navProps = { ...sharedProps, collapsed: c, flyoutMode: !isMobile, flyout, setFlyout };
    return (
      <div className="flex h-full flex-col border-r border-ink-200 bg-white">
        <div className={cn('flex h-16 shrink-0 items-center gap-2 border-b border-ink-200', c ? 'justify-center px-2' : 'justify-between px-4')}>
          <Logo compact={c} />
          {isMobile && (
            <button onClick={onCloseMobile} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Close menu">
              <X className="size-5" />
            </button>
          )}
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3" onScroll={() => flyout && setFlyout(null)}>
          <ul className="space-y-0.5">
            {NAVIGATION.map((item) => (
              <NavItem key={item.key} item={item} {...navProps} />
            ))}
          </ul>
        </nav>
        <div className="border-t border-ink-200 px-3 py-2">
          <ul className="space-y-0.5">
            {FOOTER_NAVIGATION.map((item) => (
              <NavItem key={item.key} item={item} {...navProps} />
            ))}
          </ul>
          {!isMobile && (
            <button
              onClick={onToggleCollapsed}
              className={cn('mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] text-ink-500 hover:bg-brand-50 hover:text-brand-700', c && 'justify-center px-0')}
              aria-label={c ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {c ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
              {!c && 'Collapse'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={cn('no-print fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block', collapsed ? 'w-[72px]' : 'w-64')}>{content(false)}</aside>
      {flyout &&
        createPortal(<FlyoutPanel key={flyout.key} item={flyout.item} anchor={flyout.anchor} onNavigate={() => setFlyout(null)} panelRefs={panelRefs} />, document.body)}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/30" onClick={onCloseMobile} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">{content(true)}</aside>
        </div>
      )}
    </>
  );
}
