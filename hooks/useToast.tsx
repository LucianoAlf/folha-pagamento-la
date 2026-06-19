// =====================================================
// HOOK - SISTEMA DE TOAST (feedback não-bloqueante)
// Padrão P1 da auditoria: feedback consistente de sucesso/erro
// para mutações async. Usado em conjunto com useAsyncAction.
// =====================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Dispara um toast com a variante informada (default: info). */
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Tempo de exibição padrão (ms). Erros ficam um pouco mais. */
const DURATION: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  error: 6000,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), DURATION[variant]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, 'success'),
      error: (m: string) => toast(m, 'error'),
      info: (m: string) => toast(m, 'info'),
      dismiss,
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  }
  return ctx;
}

// ----------------------------------------------------
// Apresentação
// ----------------------------------------------------

const VARIANT_STYLE: Record<
  ToastVariant,
  { ring: string; iconColor: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    ring: 'border-emerald-500/30 bg-emerald-500/10',
    iconColor: 'text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    ring: 'border-rose-500/30 bg-rose-500/10',
    iconColor: 'text-rose-400',
    Icon: AlertCircle,
  },
  info: {
    ring: 'border-violet-500/30 bg-violet-500/10',
    iconColor: 'text-violet-400',
    Icon: Info,
  },
};

const ToastViewport: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none"
      aria-label="Notificações"
    >
      {toasts.map((t) => {
        const { ring, iconColor, Icon } = VARIANT_STYLE[t.variant];
        const isError = t.variant === 'error';
        return (
          <div
            key={t.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border ${ring} backdrop-blur-md px-4 py-3 shadow-lg shadow-black/30`}
          >
            <Icon size={18} className={`shrink-0 mt-0.5 ${iconColor}`} />
            <p className="flex-1 text-sm font-medium text-slate-100 break-words">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Fechar notificação"
              className="shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
