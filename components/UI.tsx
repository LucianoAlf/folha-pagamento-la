import React from 'react';
import * as Select from '@radix-ui/react-select';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, ChevronUp, Check, Calendar, X, AlertCircle } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Tooltip: React.FC<{ 
  content: string; 
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}> = ({ content, children, side = 'top' }) => (
  <TooltipPrimitive.Provider delayDuration={200}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className="z-[9999] overflow-hidden rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xl animate-in fade-in zoom-in-95 duration-200"
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
          className="z-[9999] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3"
        >
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
            className="text-slate-900 dark:text-slate-100"
            classNames={{
              months: 'flex flex-col',
              month: 'space-y-3',
              caption: 'flex items-center justify-between px-2',
              caption_label: 'text-sm font-black text-slate-700 dark:text-slate-200',
              nav: 'flex items-center gap-2',
              nav_button:
                'h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700',
              table: 'w-full border-collapse space-y-1',
              head_row: 'flex',
              head_cell: 'w-9 text-center text-[10px] font-black uppercase tracking-widest text-slate-400',
              row: 'flex w-full mt-1',
              cell: 'w-9 h-9 text-center',
              day: 'w-9 h-9 rounded-xl hover:bg-violet-500/10 dark:hover:bg-violet-500/15 transition-colors',
              day_selected: 'bg-violet-600 text-white hover:bg-violet-600',
              day_today: 'ring-2 ring-emerald-500/40',
              day_outside: 'text-slate-300 dark:text-slate-600 opacity-60',
            }}
          />

          <div className="pt-3 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
            >
              Limpar
            </button>
            <Popover.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
              >
                Ok
              </button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-2xl ${className}`}>
    {children}
  </div>
);

export const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, onClose, title, children, className = '' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className={`w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 ${className}`}>
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/60 border-b border-slate-700/50">
          <div className="text-white font-bold text-lg">{title}</div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
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
  options: { value: string; label: string }[];
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
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger 
        className={`flex items-center gap-2 bg-slate-900/50 hover:bg-slate-800 text-slate-200 px-4 py-3 rounded-xl border border-slate-700 focus:ring-2 focus:ring-violet-500 outline-none transition-all w-full justify-between group cursor-pointer whitespace-nowrap ${className}`}
      >
        <div className="flex items-center gap-2 pointer-events-none min-w-0">
          {Icon ? <Icon size={16} className="text-slate-400 group-hover:text-violet-400 transition-colors shrink-0" /> : null}
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
                key={opt.value}
                value={opt.value}
                className="flex items-center justify-between px-3 py-2.5 text-sm text-slate-300 rounded-lg outline-none cursor-pointer hover:bg-violet-500/20 hover:text-white focus:bg-violet-500/20 focus:text-white transition-colors data-[state=checked]:text-violet-400 data-[state=checked]:font-bold data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white select-none"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
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