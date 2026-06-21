import React, { useEffect, useId, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import * as Select from '@radix-ui/react-select';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { 
  ChevronDown, ChevronUp, Check, Calendar, X, AlertCircle, 
  ChevronLeft, ChevronRight 
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from './CollaboratorComponents';

export const Tooltip: React.FC<{
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}> = ({ content, children, side = 'top', className }) => (
  <TooltipPrimitive.Provider delayDuration={200}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className={cn(
            // Precisa ficar acima de Modals/Dialogs (que usam z ~12000-13000)
            "z-tooltip overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-primary shadow-xl animate-in fade-in zoom-in-95 duration-200",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[rgb(var(--surface-2))]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

export const DatePicker: React.FC<{
  value?: string; // yyyy-mm-dd
  onChange: (next?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'monthYear';
  fromYear?: number;
  toYear?: number;
}> = ({
  value,
  onChange,
  placeholder = 'Selecione...',
  className = '',
  disabled,
  variant = 'default',
  fromYear,
  toYear
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const currentYear = new Date().getFullYear();
  const selected = (() => {
    if (!value) return undefined;
    // Accepts either "yyyy-mm-dd" or ISO strings from DB (e.g. "2026-02-07T00:00:00.000Z")
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    return isValid(d) ? d : undefined;
  })();
  const minYear = fromYear ?? currentYear - 80;
  const maxYear = toYear ?? currentYear + 5;
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());

  useEffect(() => {
    if (selected) {
      setInputValue(format(selected, 'dd/MM/yyyy'));
    } else {
      setInputValue('');
    }
  }, [value]); // selected derives from value

  useEffect(() => {
    if (!open) return;
    setMonth(selected ?? new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);
    
    let formatted = val;
    if (val.length > 2) formatted = val.slice(0, 2) + '/' + val.slice(2);
    if (val.length > 4) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
    
    setInputValue(formatted);

    if (val.length === 8) {
      const day = parseInt(val.slice(0, 2));
      const month = parseInt(val.slice(2, 4));
      const year = parseInt(val.slice(4, 8));
      
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        const yyyy = year;
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        onChange(`${yyyy}-${mm}-${dd}`);
      }
    } else if (val.length === 0) {
      onChange(undefined);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative w-full group">
        <input
          type="text"
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={cn(
            'w-full flex items-center justify-between px-5 py-3.5 rounded-2xl border bg-surface-2 text-sm font-bold',
            'border-line',
            'text-primary',
            'focus:outline-none focus:ring-2 focus:ring-accent/60',
            'placeholder:text-muted',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-line-strong',
            className
          )}
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-3 rounded-lg transition-colors text-muted group-hover:text-accent"
          >
            <Calendar size={16} />
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          align="start"
          className="la-popover-content rounded-[2rem] border border-line bg-surface shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 min-w-fit"
        >
          {variant === 'monthYear' && (
            <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-line">
              <button
                type="button"
                disabled={month <= new Date(minYear, 0, 1)}
                onClick={() => {
                  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
                  if (prev < new Date(minYear, 0, 1)) return;
                  setMonth(prev);
                }}
                className={cn(
                  "w-10 h-10 rounded-2xl border flex items-center justify-center transition-all",
                  "border-line bg-surface-2/50 text-secondary",
                  "hover:bg-surface-3 active:scale-95",
                  (month <= new Date(minYear, 0, 1)) && "opacity-40 pointer-events-none"
                )}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 grid grid-cols-2 gap-3">
                <CustomSelect
                  value={String(month.getMonth())}
                  onValueChange={(v) => {
                    const m = Number(v);
                    const next = new Date(month.getFullYear(), m, 1);
                    setMonth(next);
                  }}
                  options={Array.from({ length: 12 }).map((_, idx) => ({
                    value: String(idx),
                    label: format(new Date(2020, idx, 1), 'MMMM', { locale: ptBR }).toUpperCase(),
                  }))}
                  className="py-2.5 rounded-2xl"
                />
                <CustomSelect
                  value={String(month.getFullYear())}
                  onValueChange={(v) => {
                    const y = Number(v);
                    const next = new Date(y, month.getMonth(), 1);
                    setMonth(next);
                  }}
                  options={Array.from({ length: maxYear - minYear + 1 }).map((_, i) => {
                    const y = minYear + i;
                    return { value: String(y), label: String(y) };
                  })}
                  className="py-2.5 rounded-2xl"
                />
              </div>

              <button
                type="button"
                disabled={month >= new Date(maxYear, 11, 1)}
                onClick={() => {
                  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
                  if (next > new Date(maxYear, 11, 1)) return;
                  setMonth(next);
                }}
                className={cn(
                  "w-10 h-10 rounded-2xl border flex items-center justify-center transition-all",
                  "border-line bg-surface-2/50 text-secondary",
                  "hover:bg-surface-3 active:scale-95",
                  (month >= new Date(maxYear, 11, 1)) && "opacity-40 pointer-events-none"
                )}
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className={cn("rdp-modern", variant === 'monthYear' && "sf-monthyear")}>
            <DayPicker
              mode="single"
              month={variant === 'monthYear' ? month : undefined}
              onMonthChange={variant === 'monthYear' ? setMonth : undefined}
              selected={selected}
              {...(variant === 'monthYear'
                ? {
                    // We render our own Month/Year header to avoid native <select> dropdown quirks.
                    hideNavigation: true,
                  }
                : {})}
              onSelect={(d) => {
                if (!d) return onChange(undefined);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                onChange(`${yyyy}-${mm}-${dd}`);
                if (variant === 'monthYear') setMonth(new Date(yyyy, d.getMonth(), 1));
              }}
              weekStartsOn={0}
              locale={ptBR}
              // For Nascimento/Admissão, showing outside-days looks like the calendar is "jumping" months.
              showOutsideDays={variant !== 'monthYear'}
              components={{
                Chevron: ({ orientation }) => {
                  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
                  return <Icon className="h-4 w-4" />;
                }
              }}
            />
          </div>

          <div className="pt-6 mt-4 border-t border-line flex justify-between gap-4">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="flex-1 px-4 py-3 rounded-2xl bg-surface-2 hover:bg-surface-3 text-secondary text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Limpar
            </button>
            <Popover.Close asChild>
              <button
                type="button"
                className="flex-[1.5] px-4 py-3 rounded-2xl bg-accent hover:bg-accent/90 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-accent/20 active:scale-95"
              >
                Confirmar
              </button>
            </Popover.Close>
          </div>

          <style>{`
            .rdp-modern {
              --rdp-cell-size: 40px;
              --rdp-accent-color: #7c3aed;
              --rdp-background-color: #7c3aed20;
              --rdp-accent-color-foreground: #ffffff;
            }
            .dark .rdp-modern {
              --rdp-accent-color: #8b5cf6;
              --rdp-background-color: #8b5cf630;
            }
            .rdp {
              margin: 0;
            }
            .rdp-month_caption {
              display: flex;
              justify-content: center;
              padding: 0 0 1.5rem 0;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: var(--slate-900);
            }
            .sf-monthyear .rdp-month_caption,
            .sf-monthyear .rdp-nav {
              display: none !important;
            }
            .dark .rdp-month_caption {
              color: white;
            }
            .rdp-nav {
              position: absolute;
              right: 1.5rem;
              top: 1.5rem;
              display: flex;
              gap: 0.5rem;
            }
            .rdp-button_next, .rdp-button_previous {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
            }
            .dark .rdp-button_next, .dark .rdp-button_previous {
              border-color: #1e293b;
              background: #0f172a;
              color: #94a3b8;
            }
            .rdp-button_next:hover, .rdp-button_previous:hover {
              background: #f1f5f9;
            }
            .dark .rdp-button_next:hover, .dark .rdp-button_previous:hover {
              background: #1e293b;
              color: white;
            }
            .rdp-head_cell {
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              color: #64748b;
              padding-bottom: 0.5rem;
            }
            .rdp-day {
              font-weight: 600;
              border-radius: 12px;
              transition: all 0.2s;
            }
            .rdp-day_selected {
              background-color: var(--rdp-accent-color) !important;
              color: white;
              font-weight: 900;
            }
            .rdp-day_today {
              color: #f43f5e;
              font-weight: 900;
              border: 2px solid #f43f5e40;
            }
            .rdp-day:hover:not(.rdp-day_selected) {
              background-color: var(--rdp-background-color);
            }
          `}</style>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'outline' | 'ghost';
  }
> = ({ variant = 'ghost', className = '', disabled, children, ...props }) => {
  const base =
    'inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none';

  const variants = {
    primary:
      'bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20 border border-accent/30',
    outline:
      'bg-surface/30 hover:bg-surface-2/50 text-secondary border border-line-strong/60 hover:border-line-strong',
    ghost: 'bg-surface/20 hover:bg-surface-2/40 text-secondary border border-line/50',
  } satisfies Record<NonNullable<React.ComponentProps<typeof Button>['variant']>, string>;

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(base, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string }
>(({ children, className = '', ...rest }, ref) => {
  // Se o call site já define a própria superfície, não aplica o padrão.
  const hasCustomBg = /\bbg-(surface|bg|slate-)/.test(className);
  const baseClass = hasCustomBg
    ? 'rounded-2xl'
    : 'bg-surface border border-line rounded-2xl';
  return (
    <div ref={ref} className={cn(baseClass, className)} {...rest}>
      {children}
    </div>
  );
});
Card.displayName = 'Card';

export const ToggleSwitch: React.FC<{
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'violet' | 'emerald' | 'cyan' | 'rose' | 'amber';
  ariaLabel?: string;
}> = ({ checked, onCheckedChange, disabled = false, size = 'md', variant = 'violet', ariaLabel }) => {
  const dims =
    size === 'sm'
      ? { track: 'w-11 h-6', dot: 'w-4 h-4 top-1 left-1', on: 'translate-x-5' }
      : { track: 'w-12 h-7', dot: 'w-5 h-5 top-1 left-1', on: 'translate-x-5' };

  const color =
    variant === 'emerald'
      ? { onBg: 'bg-success/25 border-success/40', onDot: 'bg-success' }
      : variant === 'cyan'
        ? { onBg: 'bg-info/20 border-info/35', onDot: 'bg-info' }
        : variant === 'rose'
          ? { onBg: 'bg-danger/25 border-danger/40', onDot: 'bg-danger' }
          : variant === 'amber'
            ? { onBg: 'bg-warning/25 border-warning/40', onDot: 'bg-warning' }
            : { onBg: 'bg-accent/15 border-accent/30', onDot: 'bg-accent' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onCheckedChange(!checked);
      }}
      className={cn(
        'rounded-full border transition-all relative outline-none',
        dims.track,
        checked ? color.onBg : 'bg-surface/50 border-line',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-line-strong'
      )}
    >
      <span
        className={cn(
          'absolute rounded-full transition-all',
          dims.dot,
          checked ? `${dims.on} ${color.onDot}` : 'translate-x-0 bg-muted'
        )}
      />
    </button>
  );
};

function normalizeHHMM(value: string | null | undefined) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildTimeOptions(stepMinutes: 15 | 30) {
  const opts: { value: string; label: string }[] = [];
  for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const v = `${hh}:${mm}`;
    opts.push({ value: v, label: v });
  }
  return opts;
}

export const TimeSelect: React.FC<{
  value?: string | null;
  onValueChange: (value: string) => void;
  stepMinutes?: 15 | 30;
  className?: string;
  disabled?: boolean;
}> = ({ value, onValueChange, stepMinutes = 30, className = '', disabled = false }) => {
  const safe = normalizeHHMM(value) || '08:00';
  const options = buildTimeOptions(stepMinutes);
  return (
    <div className={cn(disabled && 'opacity-60 pointer-events-none', className)}>
      <CustomSelect
        value={safe}
        onValueChange={(v) => onValueChange(normalizeHHMM(v) || safe)}
        options={options}
        className="min-w-[160px]"
      />
    </div>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  position?: 'center' | 'bottom' | 'left';
  overlayClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerIcon?: React.ReactNode;
}> = ({ isOpen, onClose, title, subtitle, children, footer, className = '', headerClassName = '', position = 'center', overlayClassName = '', size, headerIcon }) => {
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const titleId = useId();
  const subtitleId = useId();
  if (!isOpen) return null;

  // Largura no modo 'center'. Default preservado em max-w-2xl (= 'lg').
  const sizeClass = size
    ? { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
    : 'max-w-2xl';

  return (
    <div
      className={cn(
        "fixed inset-0 z-[12000] flex overflow-hidden bg-black/60 backdrop-blur-sm",
        position === 'bottom' ? "items-end justify-center p-0 sm:p-4" :
        position === 'left' ? "items-stretch justify-start p-0" :
        "items-center justify-center p-4",
        overlayClassName
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={cn(
          "w-full flex flex-col p-0 overflow-visible shadow-2xl animate-in duration-200 focus:outline-none",
          position === 'bottom' ? "max-w-none rounded-t-3xl rounded-b-none max-h-[85vh] slide-in-from-bottom" :
          position === 'left' ? "w-[280px] max-w-[85vw] h-full rounded-none slide-in-from-left" :
          `${sizeClass} max-h-[90vh] zoom-in fade-in`,
          className
        )}
      >
        {/* Header só quando há conteúdo de cabeçalho — modais que desenham o
            próprio header (e passam só `size`) não ganham uma barra vazia. */}
        {(title || subtitle || headerIcon) && (
          <div className={cn(
            "sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b shrink-0 transition-colors",
            headerClassName || "bg-surface/80 backdrop-blur-md border-line-strong/50"
          )}>
            <div className="flex items-center gap-3 min-w-0">
              {headerIcon ? <div className="shrink-0">{headerIcon}</div> : null}
              <div className="min-w-0">
                <div id={titleId} className="text-primary font-black text-lg tracking-wider uppercase truncate">{title}</div>
                {subtitle ? (
                  <div id={subtitleId} className="mt-1 text-[11px] font-bold text-secondary leading-snug">
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-primary hover:bg-surface-2 rounded-xl transition-all"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className={cn(
          "overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-line-strong scrollbar-track-transparent",
          position === 'bottom' ? "p-5" : "p-6 md:p-8"
        )}>
          {children}
        </div>
        {footer && (
          <div className="sticky bottom-0 z-10 p-6 bg-surface/80 backdrop-blur-md border-t border-line-strong/50 shrink-0">
            {footer}
          </div>
        )}
      </Card>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}> = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'primary' }) => {
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const titleId = useId();
  const messageId = useId();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="bg-surface border border-line rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 focus:outline-none"
      >
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 ${variant === 'danger' ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'}`}>
            <AlertCircle size={32} />
          </div>
          <h3 id={titleId} className="text-2xl font-bold text-primary mb-3">{title}</h3>
          <p id={messageId} className="text-secondary leading-relaxed mb-8">{message}</p>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl bg-surface-2 hover:bg-surface-3 text-primary font-bold transition-all active:scale-95"
            >
              {cancelLabel}
            </button>
            <button
              onClick={async () => { await onConfirm(); onClose(); }}
              className={`flex-1 px-6 py-3.5 rounded-2xl font-bold text-primary transition-all active:scale-95 shadow-lg ${
                variant === 'danger'
                  ? 'bg-danger hover:bg-danger/90 shadow-danger/20'
                  : 'bg-accent hover:bg-accent/90 shadow-accent/20'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AlertDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  actionLabel?: string;
  variant?: 'danger' | 'primary';
}> = ({ isOpen, onClose, title, message, actionLabel = 'OK', variant = 'primary' }) => {
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const titleId = useId();
  const messageId = useId();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="bg-surface border border-line rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 focus:outline-none"
      >
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 ${variant === 'danger' ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'}`}>
            <AlertCircle size={32} />
          </div>
          <h3 id={titleId} className="text-2xl font-bold text-primary mb-3">{title}</h3>
          <p id={messageId} className="text-secondary leading-relaxed mb-8">{message}</p>
          <button
            onClick={onClose}
            className={`w-full px-6 py-3.5 rounded-2xl font-bold text-primary transition-all active:scale-95 shadow-lg ${
              variant === 'danger'
                ? 'bg-danger hover:bg-danger/90 shadow-danger/20'
                : 'bg-accent hover:bg-accent/90 shadow-accent/20'
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'; className?: string }> = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-surface-2 text-secondary',
    success: 'bg-success/20 text-success border border-success/30',
    warning: 'bg-warning/20 text-warning border border-warning/30',
    danger: 'bg-danger/20 text-danger border border-danger/30',
    info: 'bg-info/20 text-info border border-info/30',
    purple: 'bg-accent/20 text-accent border border-accent/30',
  };
  return (
    <span className={cn(`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${variants[variant]}`, className)}>
      {children}
    </span>
  );
};

export const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-10 h-10 border-4 border-line border-t-accent rounded-full animate-spin"></div>
    <div className="text-secondary">Carregando dados do Supabase...</div>
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <Card className="p-8 text-center max-w-md mx-auto mt-10">
    <div className="text-lg font-semibold text-primary mb-2">Erro ao carregar dados</div>
    <div className="text-secondary mb-4">{message}</div>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-accent hover:bg-accent/90 rounded-lg text-sm font-medium transition-colors text-white"
    >
      Tentar novamente
    </button>
  </Card>
);

interface CustomSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; icon?: React.ElementType }[];
  icon?: React.ElementType;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onValueChange,
  options,
  icon: Icon,
  placeholder = 'Selecione...',
  className = '',
  disabled = false,
}) => {
  // Radix Select NÃO permite Select.Item com value="".
  // Porém usamos "" como "nenhuma seleção" em alguns campos (ex.: lista/unidade).
  // Então mapeamos internamente "" -> sentinel seguro e revertendo no onValueChange.
  const EMPTY_SENTINEL = '__la__empty__';
  const safeValue = value === '' ? EMPTY_SENTINEL : value;
  const selectedOpt = options.find((o) => (o.value === '' ? EMPTY_SENTINEL : o.value) === safeValue);
  const SelectedIcon = Icon || selectedOpt?.icon;

  return (
    <Select.Root
      value={safeValue}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v === EMPTY_SENTINEL ? '' : v)}
    >
      <Select.Trigger 
        className={`flex items-center gap-2 bg-surface/50 hover:bg-surface-2 text-secondary px-4 py-3 rounded-xl border border-line-strong focus:ring-2 focus:ring-accent outline-none transition-all w-full justify-between group cursor-pointer whitespace-nowrap ${className}`}
      >
        <div className="flex items-center gap-2 pointer-events-none min-w-0">
          {SelectedIcon ? (
            <SelectedIcon size={16} className="text-muted group-hover:text-accent transition-colors shrink-0" />
          ) : null}
          <Select.Value placeholder={placeholder} className="truncate" />
        </div>
        <Select.Icon className="pointer-events-none">
          <ChevronDown size={14} className="text-muted" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content 
          // Inline zIndex to avoid any stacking-context edge cases inside other overlays/popovers.
          style={{ zIndex: 999999 }}
          className="la-select-content overflow-hidden bg-surface rounded-xl border border-line-strong shadow-2xl shadow-black/60 min-w-[var(--radix-select-trigger-width)] max-h-[320px]"
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="p-1.5 max-h-[280px] overflow-y-auto">
            {options.map((opt) => (
              <Select.Item
                key={opt.value || EMPTY_SENTINEL}
                value={opt.value === '' ? EMPTY_SENTINEL : opt.value}
                className="flex items-center justify-between px-3 py-2.5 text-sm text-secondary rounded-lg outline-none cursor-pointer hover:bg-accent/20 hover:text-primary focus:bg-accent/20 focus:text-primary transition-colors data-[state=checked]:text-accent data-[state=checked]:font-bold data-[highlighted]:bg-accent/20 data-[highlighted]:text-primary select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon ? <opt.icon size={16} className="shrink-0 opacity-80" /> : null}
                  <Select.ItemText>{opt.label}</Select.ItemText>
                </div>
                <Select.ItemIndicator>
                  <Check size={14} className="text-accent" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};
