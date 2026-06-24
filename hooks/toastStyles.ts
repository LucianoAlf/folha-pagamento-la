export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastPresentation {
  container: string;
  accent: string;
  iconWrap: string;
  icon: string;
  message: string;
  close: string;
}

const BASE_CONTAINER =
  'toast-in pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-2xl border border-line bg-surface text-primary px-4 py-3 shadow-[var(--shadow-pop)]';

const BASE_ICON =
  'shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border';

const PRESENTATION: Record<ToastVariant, ToastPresentation> = {
  success: {
    container: BASE_CONTAINER,
    accent: 'bg-success',
    iconWrap: `${BASE_ICON} border-success/20 bg-success/10 text-success`,
    icon: 'h-4 w-4',
    message: 'text-sm font-black text-primary leading-snug break-words',
    close: 'shrink-0 rounded-lg p-1 text-muted hover:text-primary hover:bg-surface-2 transition-colors',
  },
  error: {
    container: BASE_CONTAINER,
    accent: 'bg-danger',
    iconWrap: `${BASE_ICON} border-danger/20 bg-danger/10 text-danger`,
    icon: 'h-4 w-4',
    message: 'text-sm font-black text-primary leading-snug break-words',
    close: 'shrink-0 rounded-lg p-1 text-muted hover:text-primary hover:bg-surface-2 transition-colors',
  },
  info: {
    container: BASE_CONTAINER,
    accent: 'bg-info',
    iconWrap: `${BASE_ICON} border-info/20 bg-info/10 text-info`,
    icon: 'h-4 w-4',
    message: 'text-sm font-black text-primary leading-snug break-words',
    close: 'shrink-0 rounded-lg p-1 text-muted hover:text-primary hover:bg-surface-2 transition-colors',
  },
};

export function getToastPresentation(variant: ToastVariant): ToastPresentation {
  return PRESENTATION[variant];
}
