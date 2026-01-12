import React, { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowRightLeft, Calendar, Check, CheckCircle2, Clock, MoreVertical, PauseCircle } from 'lucide-react';
import { cn } from '../../CollaboratorComponents';
import type { AgendaKanbanColumnConfig, StatusTarefa, Tarefa } from '../../../types/agenda';
import { CATEGORIAS, PRIORIDADES, STATUS_TAREFA } from '../../../types/agenda';
import { categoriaIcon, prioridadeIcon } from '../agendaIcons';

const DEFAULT_ICONS: Record<string, React.ReactNode> = {
  pendente: <Clock className="w-4 h-4" />,
  em_andamento: <ArrowRightLeft className="w-4 h-4" />,
  concluida: <CheckCircle2 className="w-4 h-4" />,
  adiada: <PauseCircle className="w-4 h-4" />,
};

const formatWhenShort = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${date} ${hh}:${mm}`;
  } catch {
    return iso;
  }
};

function moveTargetsFor(status: StatusTarefa): StatusTarefa[] {
  if (status === 'pendente') return ['em_andamento', 'concluida'];
  if (status === 'em_andamento') return ['pendente', 'concluida'];
  if (status === 'adiada') return ['pendente', 'em_andamento'];
  if (status === 'concluida') return ['pendente'];
  return [];
}

export const TarefasKanbanView: React.FC<{
  tarefas: Tarefa[];
  tarefaSelecionadaId: string | null;
  columns?: AgendaKanbanColumnConfig[];
  onSelect: (t: Tarefa) => void;
  onMoveStatus: (t: Tarefa, next: StatusTarefa) => void;
  onDelete: (t: Tarefa) => void;
  groupByList?: boolean;
}> = ({ tarefas, tarefaSelecionadaId, columns, onSelect, onMoveStatus, onDelete, groupByList = false }) => {
  const [dragOverStatus, setDragOverStatus] = useState<StatusTarefa | null>(null);
  const rows = useMemo(() => {
    return (tarefas || []).filter((t) => t.status !== 'cancelada');
  }, [tarefas]);

  const cols = useMemo(() => {
    const base =
      (columns && columns.length ? columns : [
        { key: 'pendente', label: 'Pendente', visible: true, order: 10 },
        { key: 'em_andamento', label: 'Em Andamento', visible: true, order: 20 },
        { key: 'concluida', label: 'Concluída', visible: true, order: 30 },
        { key: 'adiada', label: 'Adiada', visible: true, order: 40 },
      ]) as AgendaKanbanColumnConfig[];

    return base
      .slice()
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((c) => ({ status: c.key as StatusTarefa, label: c.label, icon: DEFAULT_ICONS[c.key] || DEFAULT_ICONS.pendente }));
  }, [columns]);

  const byStatus = useMemo(() => {
    const map: Record<string, Tarefa[]> = {};
    for (const c of cols) map[c.status] = [];
    for (const t of rows) {
      if (!map[t.status]) map[t.status] = [];
      map[t.status].push(t);
    }
    // Mantém ordem do serviço. Se quiser: ordena por vencimento dentro da coluna.
    Object.keys(map).forEach((k) => {
      map[k] = map[k].slice().sort((a, b) => (a.vencimento_em || '').localeCompare(b.vencimento_em || ''));
    });
    return map as Record<StatusTarefa, Tarefa[]>;
  }, [rows, cols]);

  const findById = (id: string) => rows.find((t) => t.id === id) || null;

  return (
    <div className="h-full w-full min-w-0 overflow-hidden">
      <div className="p-6 min-w-0 h-full">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0 h-full">
          {cols.map((col) => {
            const meta = STATUS_TAREFA[col.status];
            const list = byStatus[col.status] || [];
            return (
              <div
                key={col.status}
                className={cn(
                  "min-w-0 rounded-3xl border bg-slate-950/95 overflow-hidden flex flex-col transition-colors",
                  dragOverStatus === col.status ? "border-violet-500/35 ring-1 ring-violet-500/15" : "border-slate-800/60"
                )}
                onDragOver={(e) => {
                  // Necessário para permitir drop
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverStatus(col.status);
                }}
                onDragLeave={() => {
                  setDragOverStatus((cur) => (cur === col.status ? null : cur));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const tarefaId = e.dataTransfer.getData('text/x-la-agenda-tarefa-id');
                  const from = e.dataTransfer.getData('text/x-la-agenda-from-status') as StatusTarefa;
                  setDragOverStatus(null);
                  if (!tarefaId) return;
                  const t = findById(tarefaId);
                  if (!t) return;
                  if (t.status === col.status) return;
                  // Move via update existente (não é RLS/drag; é UI)
                  onMoveStatus(t, col.status);
                }}
              >
                <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-950/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn('w-9 h-9 rounded-2xl border flex items-center justify-center shrink-0', meta.bg, meta.text, 'border-slate-800')}>
                      {col.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-black truncate">{col.label || meta.label}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                        {list.length} item{list.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <span className={cn('px-2 py-1 rounded-full text-[10px] font-black border', meta.bg, meta.text, 'border-slate-800')}>
                    {list.length}
                  </span>
                </div>

                <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-0">
                  {list.length === 0 ? (
                    <div className="px-3 py-10 text-center text-slate-600 font-bold text-sm">
                      Nenhuma tarefa
                    </div>
                  ) : (
                    (() => {
                      const renderCard = (t: Tarefa) => {
                        const prioridade = PRIORIDADES[t.prioridade] || PRIORIDADES.media;
                        const categoria = CATEGORIAS[t.categoria] || CATEGORIAS.geral;
                        const selected = t.id === tarefaSelecionadaId;
                        const PrioridadeIcon = prioridadeIcon(t.prioridade);
                        const CategoriaIcon = categoriaIcon(t.categoria);

                        return (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(t)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onSelect(t);
                            }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/x-la-agenda-tarefa-id', t.id);
                              e.dataTransfer.setData('text/x-la-agenda-from-status', t.status);
                            }}
                            onDragEnd={() => setDragOverStatus(null)}
                            className={cn(
                              'group rounded-2xl border p-3 transition-all cursor-pointer select-none',
                              'bg-slate-900/20 hover:bg-slate-800/95 hover:border-slate-700/60',
                              selected ? 'border-violet-500/35 ring-1 ring-violet-500/20' : 'border-slate-800/60',
                              t.status === 'concluida' ? 'opacity-70' : '',
                              'cursor-grab active:cursor-grabbing'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div
                                  className={cn(
                                    'text-white font-black leading-snug line-clamp-2',
                                    t.status === 'concluida' ? 'line-through text-slate-400' : ''
                                  )}
                                >
                                  {t.titulo}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                                  <span className={cn('px-2 py-0.5 rounded-full border normal-case tracking-normal', prioridade.bg, prioridade.text, 'border-slate-800')}>
                                    <span className="inline-flex items-center gap-1.5">
                                      <PrioridadeIcon className="w-3.5 h-3.5" />
                                      {prioridade.label}
                                    </span>
                                  </span>
                                  <span className={cn('px-2 py-0.5 rounded-full border normal-case tracking-normal', categoria.bg, categoria.text, 'border-slate-800')}>
                                    <span className="inline-flex items-center gap-1.5">
                                      <CategoriaIcon className="w-3.5 h-3.5" />
                                      {categoria.label}
                                    </span>
                                  </span>
                                </div>
                                {t.vencimento_em ? (
                                  <div className="mt-2 text-[11px] font-bold text-slate-400">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5" />
                                      {formatWhenShort(t.vencimento_em)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              {/* Ações (Notion-like) */}
                              <Popover.Root>
                                <Popover.Trigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-9 h-9 rounded-2xl border border-transparent hover:border-slate-700 hover:bg-slate-900/40 flex items-center justify-center text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
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
                                      onClick={() => onSelect(t)}
                                    >
                                      Editar detalhes
                                    </button>
                                    {t.status !== 'concluida' ? (
                                      <button
                                        type="button"
                                        className="w-full px-4 py-3 text-left text-sm font-bold text-emerald-200 hover:bg-emerald-500/10 flex items-center gap-2"
                                        onClick={() => onMoveStatus(t, 'concluida')}
                                      >
                                        <Check className="w-4 h-4 text-emerald-300" />
                                        Concluir
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="w-full px-4 py-3 text-left text-sm font-bold text-rose-200 hover:bg-rose-500/10 flex items-center gap-2"
                                      onClick={() => onDelete(t)}
                                    >
                                      Excluir
                                    </button>
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                            </div>
                          </div>
                        );
                      };

                      if (!groupByList) return list.map(renderCard);

                      // Visualizações: dentro da coluna, agrupa por lista de origem (swimlanes leves)
                      const map = new Map<string, { key: string; name: string; items: Tarefa[] }>();
                      for (const t of list) {
                        const key = t.lista_id || 'none';
                        const name = (t as any).lista?.nome || 'Sem lista';
                        const g = map.get(key) || { key, name, items: [] };
                        g.items.push(t);
                        map.set(key, g);
                      }
                      const ordered = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

                      return ordered.map((g) => (
                        <div key={g.key} className="rounded-2xl border border-slate-800/60 bg-slate-950/10 overflow-hidden">
                          <div
                            className="px-3 py-2 border-b border-slate-800/60 flex items-center justify-between gap-2"
                            style={(() => {
                              const first: any = g.items[0] as any;
                              const color: string | undefined = first?.lista?.cor || undefined;
                              if (!color) return { background: 'rgba(2,6,23,0.25)' };
                              return {
                                background: `linear-gradient(90deg, ${color}26 0%, rgba(2,6,23,0.18) 55%, rgba(2,6,23,0.12) 100%)`,
                                borderColor: `${color}33`,
                              } as any;
                            })()}
                          >
                            <div className="text-[11px] font-black text-slate-100 truncate">{g.name}</div>
                            <div className="text-[10px] font-black text-slate-500">{g.items.length}</div>
                          </div>
                          <div className="p-2 space-y-2">{g.items.map(renderCard)}</div>
                        </div>
                      ));
                    })()
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

