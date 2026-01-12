import React from 'react';
import * as Select from '@radix-ui/react-select';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { 
  ChevronDown, ChevronUp, Check, Calendar, X, AlertCircle, 
  ChevronLeft, ChevronRight 
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format } from 'date-fns';
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
            "z-[9999] overflow-hidden rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xl animate-in fade-in zoom-in-95 duration-200",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-900" />
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
}> = ({ value, onChange, placeholder = 'Selecione...', className = '', disabled }) => {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const label = selected ? format(selected, 'dd/MM/yyyy', { locale: ptBR }) : placeholder;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={[
            'w-full flex items-center justify-between px-5 py-3.5 rounded-2xl border bg-slate-50 dark:bg-slate-800 text-sm font-bold',
            'border-slate-200 dark:border-slate-700',
            'text-slate-900 dark:text-slate-100',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/60',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-300 dark:hover:border-slate-600',
            className,
          ].join(' ')}
        >
          <span className={selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}>
            {label}
          </span>
          <Calendar size={16} className="text-slate-400" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          align="start"
          className="z-[9999] rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0d14] shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 min-w-fit"
        >
          <div className="rdp-modern">
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (!d) return onChange(undefined);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                onChange(`${yyyy}-${mm}-${dd}`);
              }}
              weekStartsOn={0}
              locale={ptBR}
              showOutsideDays
              components={{
                Chevron: ({ orientation }) => {
                  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
                  return <Icon className="h-4 w-4" />;
                }
              }}
            />
          </div>

          <div className="pt-6 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-4">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Limpar
            </button>
            <Popover.Close asChild>
              <button
                type="button"
                className="flex-[1.5] px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/20 active:scale-95"
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

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  // Se className contém bg-slate-950, não aplicar o bg padrão do dark mode
  const hasCustomBg = className.includes('bg-slate-950') || className.includes('bg-slate-900');
  const baseClass = hasCustomBg
    ? 'rounded-2xl'
    : 'bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-2xl';
  return (
    <div className={cn(baseClass, className)}>
      {children}
    </div>
  );
};

export const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  headerClassName?: string;
}> = ({ isOpen, onClose, title, subtitle, children, footer, className = '', headerClassName = '' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-hidden">
      <Card className={`w-full max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 ${className}`}>
        <div className={cn(
          "sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b shrink-0 transition-colors",
          headerClassName || "bg-slate-900/80 backdrop-blur-md border-slate-700/50"
        )}>
          <div className="min-w-0">
            <div className="text-white font-black text-lg tracking-wider uppercase truncate">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-[11px] font-bold text-white/85 leading-snug">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 md:p-8 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {children}
        </div>
        {footer && (
          <div className="sticky bottom-0 z-10 p-6 bg-slate-900/80 backdrop-blur-md border-t border-slate-700/50 shrink-0">
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 ${variant === 'danger' ? 'bg-rose-500/10 text-rose-500' : 'bg-violet-500/10 text-violet-500'}`}>
            <AlertCircle size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8">{message}</p>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold transition-all active:scale-95"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className={`flex-1 px-6 py-3.5 rounded-2xl font-bold text-white transition-all active:scale-95 shadow-lg ${
                variant === 'danger' 
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20' 
                  : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20'
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6 ${variant === 'danger' ? 'bg-rose-500/10 text-rose-500' : 'bg-violet-500/10 text-violet-500'}`}>
            <AlertCircle size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8">{message}</p>
          <button
            onClick={onClose}
            className={`w-full px-6 py-3.5 rounded-2xl font-bold text-white transition-all active:scale-95 shadow-lg ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20'
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = ({ children, variant = 'default' }) => {
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border border-emerald-500/30',
    danger: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    info: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    purple: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${variants[variant]}`}>
      {children}
    </span>
  );
};

export const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-10 h-10 border-4 border-slate-700 border-t-violet-500 rounded-full animate-spin"></div>
    <div className="text-slate-400">Carregando dados do Supabase...</div>
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <Card className="p-8 text-center max-w-md mx-auto mt-10">
    <div className="text-lg font-semibold text-white mb-2">Erro ao carregar dados</div>
    <div className="text-slate-400 mb-4">{message}</div>
    <button 
      onClick={onRetry}
      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors text-white"
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
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onValueChange,
  options,
  icon: Icon,
  placeholder = 'Selecione...',
  className = '',
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
      onValueChange={(v) => onValueChange(v === EMPTY_SENTINEL ? '' : v)}
    >
      <Select.Trigger 
        className={`flex items-center gap-2 bg-slate-900/50 hover:bg-slate-800 text-slate-200 px-4 py-3 rounded-xl border border-slate-700 focus:ring-2 focus:ring-violet-500 outline-none transition-all w-full justify-between group cursor-pointer whitespace-nowrap ${className}`}
      >
        <div className="flex items-center gap-2 pointer-events-none min-w-0">
          {SelectedIcon ? (
            <SelectedIcon size={16} className="text-slate-400 group-hover:text-violet-400 transition-colors shrink-0" />
          ) : null}
          <Select.Value placeholder={placeholder} className="truncate" />
        </div>
        <Select.Icon className="pointer-events-none">
          <ChevronDown size={14} className="text-slate-500" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content 
          className="overflow-hidden bg-slate-900 rounded-xl border border-slate-700 shadow-2xl shadow-black/60 z-[9999] min-w-[var(--radix-select-trigger-width)] max-h-[320px]"
          position="popper"
          sideOffset={8}
        >
          <Select.ScrollUpButton className="flex items-center justify-center h-8 text-slate-500 bg-slate-900">
            <ChevronUp size={16} />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1.5 max-h-[280px] overflow-y-auto">
            {options.map((opt) => (
              <Select.Item
                key={opt.value || EMPTY_SENTINEL}
                value={opt.value === '' ? EMPTY_SENTINEL : opt.value}
                className="flex items-center justify-between px-3 py-2.5 text-sm text-slate-300 rounded-lg outline-none cursor-pointer hover:bg-violet-500/20 hover:text-white focus:bg-violet-500/20 focus:text-white transition-colors data-[state=checked]:text-violet-400 data-[state=checked]:font-bold data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon ? <opt.icon size={16} className="shrink-0 opacity-80" /> : null}
                  <Select.ItemText>{opt.label}</Select.ItemText>
                </div>
                <Select.ItemIndicator>
                  <Check size={14} className="text-violet-400" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>

          <Select.ScrollDownButton className="flex items-center justify-center h-8 text-slate-500 bg-slate-900">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};
