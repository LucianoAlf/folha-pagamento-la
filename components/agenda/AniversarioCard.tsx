import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { MoreVertical, Pencil, Trash2, Bell, BellOff } from 'lucide-react';
import { Badge, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Aniversario } from '../../types/aniversarios';
import { LEMBRETE_TIPOS } from '../../types/aniversarios';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const getInitials = (nome: string) => {
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = [
  'bg-danger/20 text-danger-subtle border-danger/30',
  'bg-accent/20 text-accent-subtle border-accent/30',
  'bg-info/20 text-info-subtle border-info/30',
  'bg-warning/20 text-warning-subtle border-warning/30',
  'bg-success/20 text-success-subtle border-success/30',
  'bg-danger/20 text-danger-subtle border-danger/30',
];

const getAvatarColor = (nome: string) => {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const AniversarioCard: React.FC<{
  aniversario: Aniversario;
  onEdit: () => void;
  onDelete: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ aniversario, onEdit, onDelete, selectable, selected, onToggleSelect }) => {
  const dias = aniversario._diasAteProximo ?? 999;
  const idade = aniversario._idade ?? 0;
  const isHoje = dias === 0;
  const isEstaSemana = dias > 0 && dias <= 7;
  const lembrete = LEMBRETE_TIPOS[aniversario.lembrete_tipo];
  const dataFormatada = format(parseISO(aniversario.data_nascimento), "dd 'de' MMMM", { locale: ptBR });

  const countdownLabel = isHoje
    ? 'Hoje!'
    : dias === 1
      ? 'Amanhã'
      : `em ${dias} dias`;

  return (
    <div
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onToggleSelect : undefined}
      className={cn(
        'group relative flex items-center gap-4 px-4 py-3 rounded-2xl transition-all border',
        'hover:bg-surface-2/40',
        selectable && 'cursor-pointer',
        selected
          ? 'bg-accent/10 border-accent/20'
          : isHoje
            ? 'bg-danger/10 border-danger/20 shadow-[0_0_20px_rgba(236,72,153,0.08)]'
            : 'border-transparent'
      )}
    >
      {/* Checkbox */}
      {selectable && (
        <div
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
            selected
              ? 'bg-accent border-accent text-white'
              : 'border-line-strong bg-transparent'
          )}
        >
          {selected && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}

      {/* Avatar */}
      <div
        className={cn(
          'w-11 h-11 rounded-2xl border flex items-center justify-center text-sm font-black shrink-0',
          getAvatarColor(aniversario.nome)
        )}
      >
        {isHoje ? '🎂' : getInitials(aniversario.nome)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-primary truncate">{aniversario.nome}</span>
          {aniversario.tipo === 'colaborador' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-muted bg-surface-2/60 px-1.5 py-0.5 rounded-md">
              RH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted font-bold">{dataFormatada}</span>
          <span className="text-[10px] text-muted">•</span>
          <span className="text-xs text-muted font-bold">
            Faz {idade + (isHoje ? 0 : 1)} anos
          </span>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 shrink-0">
        <Tooltip content={aniversario.lembrete_ativo ? `Lembrete: ${lembrete.label}` : 'Lembrete desativado'} side="top">
          <span className={cn(
            'text-[10px] font-black px-2 py-0.5 rounded-full border',
            aniversario.lembrete_ativo
              ? 'bg-accent/10 border-accent/20 text-accent-subtle'
              : 'bg-surface-2/40 border-line-strong/40 text-muted'
          )}>
            {aniversario.lembrete_ativo ? lembrete.icone : '🔕'} {lembrete.label}
          </span>
        </Tooltip>

        <Badge variant={isHoje ? 'danger' : isEstaSemana ? 'warning' : 'default'}>
          {countdownLabel}
        </Badge>

        {/* Actions (hidden in select mode) */}
        {!selectable && <Popover.Root>
          <Tooltip content="Ações" side="top">
            <Popover.Trigger
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'w-8 h-8 rounded-xl border flex items-center justify-center transition-all shrink-0',
                'border-transparent bg-transparent text-muted hover:text-primary hover:bg-surface/40 hover:border-line-strong/60',
                'opacity-0 group-hover:opacity-100'
              )}
              aria-label="Ações"
            >
              <MoreVertical className="w-4 h-4" />
            </Popover.Trigger>
          </Tooltip>
          <Popover.Portal>
            <Popover.Content
              sideOffset={8}
              align="end"
              className="z-[20000] w-48 rounded-2xl border border-line bg-bg/95 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm font-bold text-secondary hover:bg-surface/60 flex items-center gap-2"
                onClick={onEdit}
              >
                <Pencil className="w-4 h-4" /> Editar
              </button>
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm font-bold text-danger-subtle hover:bg-danger/10 flex items-center gap-2"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>}
      </div>
    </div>
  );
};
