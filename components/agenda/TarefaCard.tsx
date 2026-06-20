import React, { useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar, Check, ChevronRight, CreditCard, ExternalLink, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Tarefa, TarefaLista } from '../../types/agenda';
import { CATEGORIAS, PRIORIDADES, STATUS_TAREFA } from '../../types/agenda';
import { categoriaIcon, prioridadeIcon } from './agendaIcons';

const navigateTo = (module: 'folha' | 'contas' | 'agenda' | 'notificacoes', page?: string) => {
  window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module, page } }));
};

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
        'bg-bg/95 md:bg-bg/95 hover:bg-surface/95 hover:border-strong/60',
        isSelected ? 'bg-accent/10 border-accent/25 shadow-lg shadow-accent/5' : 'border-base/50',
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
              ? 'bg-success border-success'
              : 'border-strong hover:border-accent'
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
                  'text-sm md:text-base text-primary font-black leading-snug truncate md:max-w-none',
                  tarefa.status === 'concluida' ? 'line-through text-muted' : ''
                )}
              >
                {tarefa.titulo}
              </h3>
              
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] md:text-xs font-bold">
                {tarefa.vencimento_em ? (
                  <span className="text-muted flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {formatWhen(tarefa.vencimento_em)}
                  </span>
                ) : null}

                {showOriginList && (
                  <span className="text-muted">
                    <span className="opacity-60">Lista:</span> {originList?.nome || 'Sem lista'}
                  </span>
                )}

                {progress.total > 0 && (
                  <span className="text-accent/80 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
              {isImportant && (
                <div className="p-2 text-warning">
                  <Star size={16} fill="currentColor" />
                </div>
              )}

              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="w-9 h-9 rounded-2xl border border-transparent hover:border-strong hover:bg-surface/40 flex items-center justify-center text-muted hover:text-primary transition-all"
                    aria-label="Ações"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={8}
                    align="end"
                    // Precisa ficar acima do Modal (z ~12000/13000)
                    className="z-[20000] w-56 rounded-2xl border border-base bg-bg/95 shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tarefa.vinculo_tipo && tarefa.vinculo_id ? (
                      <>
                        {tarefa.vinculo_tipo === 'conta_pagar' ? (
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-bold text-success-subtle hover:bg-success/10 flex items-center gap-2"
                            onClick={() => {
                              // Se estiver dentro do modal "Tarefas do dia", fecha antes de abrir o fluxo
                              window.dispatchEvent(new CustomEvent('agenda:close-daymodal'));
                              window.dispatchEvent(
                                new CustomEvent('agenda:quickpay', {
                                  detail: { tarefaId: tarefa.id, contaId: String(tarefa.vinculo_id) }
                                })
                              );
                            }}
                          >
                            <CreditCard className="w-4 h-4 text-success-subtle" />
                            Registrar pagamento
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-sm font-bold text-secondary hover:bg-surface/60 flex items-center gap-2"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('agenda:close-daymodal'));
                            if (tarefa.vinculo_tipo === 'conta_pagar') navigateTo('contas', 'visao-geral');
                            if (tarefa.vinculo_tipo === 'folha_pagamento') navigateTo('folha', 'dashboard');
                          }}
                        >
                          <ExternalLink className="w-4 h-4 text-muted" />
                          Ir para origem
                        </button>
                        <div className="h-px bg-base/70" />
                      </>
                    ) : tarefa.categoria === 'financeiro' ? (
                      <>
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-sm font-bold text-accent-subtle hover:bg-accent/10 flex items-center gap-2"
                          onClick={() => {
                            // Fecha o modal do dia para não ficar "atrás"
                            window.dispatchEvent(new CustomEvent('agenda:close-daymodal'));
                            window.dispatchEvent(
                              new CustomEvent('agenda:linkconta', { detail: { tarefaId: tarefa.id } })
                            );
                          }}
                        >
                          <ExternalLink className="w-4 h-4 text-accent-subtle" />
                          Vincular a uma conta
                        </button>
                        <div className="h-px bg-base/70" />
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-bold text-secondary hover:bg-surface/60 flex items-center gap-2"
                      onClick={onSelect}
                    >
                      <Pencil className="w-4 h-4 text-muted" />
                      Editar detalhes
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-bold text-danger-subtle hover:bg-danger/10 flex items-center gap-2"
                      onClick={() => {
                        onDelete();
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-danger-subtle" />
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

