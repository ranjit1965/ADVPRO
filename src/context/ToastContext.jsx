import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '../utils/cn';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'text-success-600' },
  error: { icon: AlertCircle, cls: 'text-danger-600' },
  warning: { icon: AlertTriangle, cls: 'text-warning-600' },
  info: { icon: Info, cls: 'text-info-600' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (type, message, title) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((t) => [...t.slice(-3), { id, type, message, title }]);
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (m, t) => show('success', m, t),
      error: (m, t) => show('error', m, t),
      warning: (m, t) => show('warning', m, t),
      info: (m, t) => show('info', m, t),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const { icon: Icon, cls } = STYLES[t.type];
          return (
            <div key={t.id} role="status" className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5 shadow-pop">
              <Icon className={cn('mt-0.5 size-5 shrink-0', cls)} aria-hidden />
              <div className="min-w-0 flex-1">
                {t.title && <p className="font-semibold text-ink-900">{t.title}</p>}
                <p className="text-ink-700">{t.message}</p>
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Dismiss notification">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
