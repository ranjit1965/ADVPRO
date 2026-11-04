import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { cn } from '../utils/cn';
import { usePersistentState } from '../hooks/usePersistentState';

export default function AppLayout() {
  const [collapsed, setCollapsed] = usePersistentState('der.sidebarCollapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  const handleLogout = async () => {
    const ok = await confirm({ title: 'Exit application', message: 'Do you want to log out of Daily Entry Report?', confirmLabel: 'Logout' });
    if (!ok) return;
    await logout();
    toast.info('You have been logged out.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onLogout={handleLogout} />
      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200 print:!pl-0', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Header onOpenMobile={() => setMobileOpen(true)} onLogout={handleLogout} />
        <main className="print-full mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
