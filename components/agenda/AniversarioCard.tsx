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
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
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
        'hover:bg-slate-800/40',
        selectable && 'cursor-pointer',
        selected
          ? 'bg-violet-500/10 border-violet-500/20'
          : isHoje
            ? 'bg-pink-500/10 border-pink-500/20 shadow-[0_0_20px_rgba(236,72,153,0.08)]'
            : 'border-transparent'
      )}
    >
      {/* Checkbox */}
      {selectable && (
        <div
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
            selected
              ? 'bg-violet-500 border-violet-500 text-white'
              : 'border-slate-600 bg-transparent'
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
          <span className="text-sm font-black text-white truncate">{aniversario.nome}</span>
          {aniversario.tipo === 'colaborador' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-md">
              RH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-400 font-bold">{dataFormatada}</span>
          <span className="text-[10px] text-slate-600">•</span>
          <span className="text-xs text-slate-500 font-bold">
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
              ? 'bg-violet-500/10 border-violet-500/20 text-violet-300'
              : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
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
                'border-transparent bg-transparent text-slate-500 hover:text-white hover:bg-slate-900/40 hover:border-slate-700/60',
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
              className="z-[20000] w-48 rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm font-bold text-slate-200 hover:bg-slate-900/60 flex items-center gap-2"
                onClick={onEdit}
              >
                <Pencil className="w-4 h-4" /> Editar
              </button>
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm font-bold text-rose-200 hover:bg-rose-500/10 flex items-center gap-2"
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
