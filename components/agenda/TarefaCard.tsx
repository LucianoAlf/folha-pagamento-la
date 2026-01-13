import React, { useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Building2, Calendar, Check, ChevronRight, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Tarefa, TarefaLista } from '../../types/agenda';
import { CATEGORIAS, PRIORIDADES, STATUS_TAREFA } from '../../types/agenda';
import { categoriaIcon, prioridadeIcon } from './agendaIcons';

const formatWhen = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${date} • ${hh}:${mm}`;
  } catch {
    return iso;
  }
};

export const TarefaCard: React.FC<{
  tarefa: Tarefa;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  showOriginList?: boolean;
}> = ({ tarefa, isSelected, onSelect, onToggle, onDelete, showOriginList = false }) => {
  const prioridade = PRIORIDADES[tarefa.prioridade] || PRIORIDADES.media;
  const categoria = CATEGORIAS[tarefa.categoria] || CATEGORIAS.geral;
  const PrioridadeIcon = prioridadeIcon(tarefa.prioridade);
  const CategoriaIcon = categoriaIcon(tarefa.categoria);
  const originList = (tarefa.lista as TarefaLista | null) || null;
  const isImportant = tarefa.prioridade === 'alta' || tarefa.prioridade === 'urgente';

  const progress = useMemo(() => {
    const total = tarefa.subtarefas?.length || 0;
    const done = (tarefa.subtarefas || []).filter((s) => s.concluida).length;
    return { total, done };
  }, [tarefa.subtarefas]);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!tarefa.dia_inteiro && tarefa.status !== 'concluida'}
      onDragStart={(e) => {
        if (tarefa.dia_inteiro || tarefa.status === 'concluida') return;
        e.dataTransfer.setData('text/plain', tarefa.id);
        e.dataTransfer.effectAllowed = 'move';
        // Feedback visual customizado opcional
        const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
        dragImage.style.width = '240px';
        dragImage.style.opacity = '0.5';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => document.body.removeChild(dragImage), 0);
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={cn(
        'group p-3 md:p-4 rounded-2xl border transition-all cursor-pointer select-none mb-2 md:mb-0',
        'bg-slate-950/95 md:bg-slate-950/95 hover:bg-slate-900/95 hover:border-slate-700/60',
        isSelected ? 'bg-violet-500/10 border-violet-500/25 shadow-lg shadow-violet-500/5' : 'border-slate-800/50',
        tarefa.status === 'concluida' ? 'opacity-70' : '',
        'active:scale-[0.98] active:brightness-90 touch-none'
      )}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            'w-6 h-6 md:w-5 md:h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all',
            tarefa.status === 'concluida'
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-slate-600 hover:border-violet-400'
          )}
          aria-label={tarefa.status === 'concluida' ? 'Reabrir tarefa' : 'Concluir tarefa'}
        >
          {tarefa.status === 'concluida' ? <Check className="w-3.5 h-3.5 md:w-3 md:h-3 text-white" /> : null}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  'text-sm md:text-base text-white font-black leading-snug truncate md:max-w-none',
                  tarefa.status === 'concluida' ? 'line-through text-slate-400' : ''
                )}
              >
                {tarefa.titulo}
              </h3>
              
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] md:text-xs font-bold">
                {tarefa.vencimento_em ? (
                  <span className="text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {formatWhen(tarefa.vencimento_em)}
                  </span>
                ) : null}
                
                {showOriginList && (
                  <span className="text-slate-500">
                    <span className="opacity-60">Lista:</span> {originList?.nome || 'Sem lista'}
                  </span>
                )}

                {progress.total > 0 && (
                  <span className="text-violet-400/80 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
              {isImportant && (
                <div className="p-2 text-amber-400">
                  <Star size={16} fill="currentColor" />
                </div>
              )}
              
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="w-9 h-9 rounded-2xl border border-transparent hover:border-slate-700 hover:bg-slate-900/40 flex items-center justify-center text-slate-500 hover:text-white transition-all"
                    aria-label="Ações"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={8}
                    align="end"
                    className="z-[9999] w-56 rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-bold text-slate-200 hover:bg-slate-900/60 flex items-center gap-2"
                      onClick={onSelect}
                    >
                      <Pencil className="w-4 h-4 text-slate-400" />
                      Editar detalhes
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-bold text-rose-200 hover:bg-rose-500/10 flex items-center gap-2"
                      onClick={() => {
                        onDelete();
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-rose-300" />
                      Excluir
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

