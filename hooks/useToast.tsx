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
import { getToastPresentation, type ToastVariant } from './toastStyles';

export type { ToastVariant } from './toastStyles';

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

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ToastViewport: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none"
      style={{ zIndex: 'var(--z-toast)' }}
      aria-label="Notificações"
    >
      {toasts.map((t) => {
        const style = getToastPresentation(t.variant);
        const Icon = VARIANT_ICON[t.variant];
        const isError = t.variant === 'error';
        return (
          <div
            key={t.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={style.container}
          >
            <span className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${style.accent}`} aria-hidden="true" />
            <span className={style.iconWrap} aria-hidden="true">
              <Icon className={style.icon} />
            </span>
            <p className={style.message}>
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Fechar notificação"
              className={style.close}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
