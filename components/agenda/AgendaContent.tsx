import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Badge, Card, Modal } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { StatusTarefa, Tarefa, TarefaLista } from '../../types/agenda';
import { concluirTarefa, deleteTarefa, reabrirTarefa, updateTarefa } from '../../services/agendaService';
import { AgendaHeader, type AgendaMode, type AgendaViewMode } from './AgendaHeader';
import { TarefaCard } from './TarefaCard';
import { TarefaQuickAdd } from './TarefaQuickAdd';
import { TarefaDetailPanel } from './TarefaDetailPanel';
import { CalendarioView } from './CalendarioView';
import { ScheduleView } from './ScheduleView';
import { ConfiguracoesAgenda } from './ConfiguracoesAgenda';
import { TarefasCardsView } from './views/TarefasCardsView';
import { TarefasKanbanView } from './views/TarefasKanbanView';
import { parseISO } from 'date-fns';

type ListKey = `smart:${string}` | `list:${string}` | 'config';

export const AgendaContent: React.FC<{
  loading: boolean;
  error: string | null;
  leftIcon?: React.ReactNode;
  accentColor?: string;
  title: string;
  subtitle: string;
  mode: AgendaMode;
  viewMode: AgendaViewMode;
  setMode: (m: AgendaMode) => void;
  setViewMode: (m: AgendaViewMode) => void;
  listKey: ListKey;
  listaAtiva: TarefaLista | null;
  listasAll: TarefaLista[];
  tarefas: Tarefa[];
  tarefasHoje: Tarefa[];
  tarefasAtrasadas: Tarefa[];
  tarefasTimeline?: Tarefa[];
  tarefaSelecionadaId: string | null;
  onSelectTarefa: (t: Tarefa | null) => void;
  selectedDateISO: string | null;
  selectedDateLabel: string | null;
  tarefasDoDia: Tarefa[];
  onSelectDate: (iso: string) => void;
  onRefresh: () => void;
  onGoToToday?: () => void;
  kanbanColumns?: import('../../types/agenda').AgendaKanbanColumnConfig[];
  isMobile?: boolean;
  onOpenMobileSidebar?: () => void;
}> = ({
  loading,
  error,
  leftIcon,
  accentColor,
  title,
  subtitle,
  mode,
  viewMode,
  setMode,
  setViewMode,
  listKey,
  listaAtiva,
  listasAll,
  tarefas,
  tarefasHoje,
  tarefasAtrasadas,
  tarefasTimeline,
  tarefaSelecionadaId,
  onSelectTarefa,
  selectedDateISO,
  selectedDateLabel,
  tarefasDoDia,
  onSelectDate,
  onRefresh,
  onGoToToday,
  kanbanColumns,
  isMobile,
  onOpenMobileSidebar,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('agenda:collapsed');
      return raw ? JSON.parse(raw) : { atrasadas: false, hoje: false };
    } catch {
      return { atrasadas: false, hoje: false };
    }
  });

  useEffect(() => {
    localStorage.setItem('agenda:collapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    // Kanban e Cards ainda são desktop-only por complexidade de drag/layout denso
    if (isMobile && (viewMode === 'kanban' || (viewMode as any) === 'cards')) {
      setViewMode('lista');
    }
  }, [isMobile, viewMode, setViewMode]);

  const [mobileQuickAddOpen, setMobileQuickAddOpen] = useState(false);
  const [mobileDetailTarefa, setMobileDetailTarefa] = useState<Tarefa | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const showMeuDia = listKey === 'smart:meu-dia';
  const isSmartView = listKey.startsWith('smart:');
  const timeline = (tarefasTimeline && tarefasTimeline.length ? tarefasTimeline : (showMeuDia ? [...tarefasAtrasadas, ...tarefasHoje] : tarefas));

  const tarefaSelecionada = useMemo(() => {
    const all = showMeuDia ? [...tarefasAtrasadas, ...tarefasHoje] : tarefas;
    return all.find((t) => t.id === tarefaSelecionadaId) || null;
  }, [tarefas, tarefasAtrasadas, tarefasHoje, tarefaSelecionadaId, showMeuDia]);

  const handleToggle = async (t: Tarefa) => {
    try {
      if (t.status === 'concluida') await reabrirTarefa(t.id);
      else await concluirTarefa(t.id);
      onRefresh();
    } catch {
      setActionError('Falha ao atualizar tarefa (possível RLS/sessão).');
    }
  };

  const handleDelete = async (t: Tarefa) => {
    try {
      await deleteTarefa(t.id);
      onSelectTarefa(null);
      onRefresh();
    } catch {
      setActionError('Falha ao excluir tarefa (possível RLS/sessão).');
    }
  };

  const handleMoveStatus = async (t: Tarefa, next: StatusTarefa) => {
    try {
      const leavingConcluida = t.status === 'concluida' && next !== 'concluida';

      if (next === 'concluida') {
        await concluirTarefa(t.id);
      } else {
        await updateTarefa(t.id, { status: next, data_conclusao: leavingConcluida ? null : t.data_conclusao || null });
      }

      onRefresh();
    } catch {
      setActionError('Falha ao mover tarefa (possível RLS/sessão).');
    }
  };

  const openDetails = (t: Tarefa) => {
    onSelectTarefa(t);
    // mobile: abre modal para editar
    if (window.innerWidth < 1280) setMobileDetailTarefa(t);
  };

  const handleSelectDate = (iso: string) => {
    onSelectDate(iso);
    setDayModalOpen(true);
  };

  const handleDropTarefa = async (tarefaId: string, newDate: Date) => {
    try {
      await updateTarefa(tarefaId, {
        vencimento_em: newDate.toISOString(),
        dia_inteiro: false
      });
      onRefresh();
    } catch {
      setActionError('Falha ao reagendar tarefa.');
    }
  };

  useEffect(() => {
    if (viewMode !== 'mes' && (viewMode as any) !== 'calendario') setDayModalOpen(false);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedDateISO) setDayModalOpen(false);
  }, [selectedDateISO]);

  return (
    <section className="flex-1 min-w-0 bg-slate-950/85 relative">
      <div className="h-full flex flex-col">
        <div className={cn(
          "p-4 md:p-6 border-b border-slate-800/60 bg-slate-950/60",
          isMobile && "sticky top-0 z-20 backdrop-blur-md"
        )}>
          <AgendaHeader
            leftIcon={leftIcon}
            accentColor={accentColor}
            title={title}
            subtitle={subtitle}
            mode={mode}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onOpenConfig={() => setMode('config')}
            onGoToToday={onGoToToday}
            rightSlot={
              mode === 'tarefas' && viewMode === 'calendario' && selectedDateLabel ? (
                <Badge variant="info">{selectedDateLabel}</Badge>
              ) : null
            }
            isMobile={isMobile}
            onOpenMobileSidebar={onOpenMobileSidebar}
          />
          {actionError ? (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-rose-200 text-sm font-black">Ação não concluída</div>
                <div className="text-rose-200/80 text-xs font-bold mt-1">{actionError}</div>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 text-xs font-black"
              >
                OK
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8 text-slate-400 font-bold">Carregando…</div>
          ) : error ? (
            <div className="p-8">
              <Card className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-white font-black">Erro ao carregar Agenda</div>
                    <div className="text-sm text-slate-400 font-bold mt-1">{error}</div>
                    <button
                      type="button"
                      onClick={onRefresh}
                      className="mt-4 px-4 py-2 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ) : mode === 'config' ? (
            <div className="p-6 overflow-auto h-full">
              <ConfiguracoesAgenda onSaved={() => setMode('tarefas')} />
            </div>
          ) : viewMode === 'mes' || (viewMode as any) === 'calendario' ? (
            <div className="p-4 md:p-6 overflow-auto h-full pb-24">
              <CalendarioView
                tarefas={timeline}
                selectedDateISO={selectedDateISO}
                onSelectDate={handleSelectDate}
              />
            </div>
          ) : ['dia', '3dias', 'semana'].includes(viewMode) ? (
            <div className="p-4 md:p-6 h-full pb-24">
              <ScheduleView
                tarefas={timeline}
                viewMode={viewMode as any}
                selectedDate={selectedDateISO ? parseISO(selectedDateISO) : new Date()}
                onSelectDate={(d) => onSelectDate(d.toISOString().split('T')[0])}
                onSelectTarefa={openDetails}
                onDropTarefa={handleDropTarefa}
                isMobile={isMobile}
              />
            </div>
          ) : viewMode === 'lista' ? (
            <div className="p-4 md:p-6 overflow-auto h-full pb-24">
              {!isMobile && (
                <div className="mb-4">
                  <TarefaQuickAdd
                    listKey={listKey}
                    listaAtiva={listaAtiva}
                    onCreated={() => onRefresh()}
                  />
                </div>
              )}

              {showMeuDia ? (
                <div className="space-y-4 md:space-y-6">
                  {/* Atrasadas */}
                  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, atrasadas: !p.atrasadas }))}
                      className="w-full flex items-center justify-between px-4 md:px-5 py-3 md:py-4 hover:bg-slate-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 md:gap-3">
                        {collapsed.atrasadas ? (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                        <div className="text-sm font-black text-rose-400 uppercase tracking-tight md:normal-case">Atrasadas</div>
                        <Badge variant="danger">{tarefasAtrasadas.length}</Badge>
                      </div>
                      <div className="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Prioridade máxima</div>
                    </button>
                    {!collapsed.atrasadas ? (
                      <div className="p-1 md:p-2">
                        {tarefasAtrasadas.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500 font-bold">Nenhuma tarefa atrasada.</div>
                        ) : (
                          tarefasAtrasadas.map((t) => (
                            <TarefaCard
                              key={t.id}
                              tarefa={t}
                              isSelected={t.id === tarefaSelecionadaId}
                              onSelect={() => openDetails(t)}
                              onToggle={() => handleToggle(t)}
                              onDelete={() => handleDelete(t)}
                              showOriginList
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Hoje */}
                  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, hoje: !p.hoje }))}
                      className="w-full flex items-center justify-between px-4 md:px-5 py-3 md:py-4 hover:bg-slate-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 md:gap-3">
                        {collapsed.hoje ? (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                        <div className="text-sm font-black text-white uppercase tracking-tight md:normal-case">Hoje</div>
                        <Badge variant="info">{tarefasHoje.length}</Badge>
                      </div>
                      <div className="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Foco do dia</div>
                    </button>
                    {!collapsed.hoje ? (
                      <div className="p-1 md:p-2">
                        {tarefasHoje.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500 font-bold">Nenhuma tarefa para hoje.</div>
                        ) : (
                          tarefasHoje.map((t) => (
                            <TarefaCard
                              key={t.id}
                              tarefa={t}
                              isSelected={t.id === tarefaSelecionadaId}
                              onSelect={() => openDetails(t)}
                              onToggle={() => handleToggle(t)}
                              onDelete={() => handleDelete(t)}
                              showOriginList
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    if (!isSmartView) {
                      return (
                        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden">
                          <div className="p-1 md:p-2">
                            {tarefas.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-slate-500 font-bold text-center">Nenhuma tarefa nesta lista.</div>
                            ) : (
                              tarefas.map((t) => (
                                <TarefaCard
                                  key={t.id}
                                  tarefa={t}
                                  isSelected={t.id === tarefaSelecionadaId}
                                  onSelect={() => openDetails(t)}
                                  onToggle={() => handleToggle(t)}
                                  onDelete={() => handleDelete(t)}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Visualizações (smart): agrupa por lista de origem para evitar sensação de "3 coisas diferentes"
                    const groups = new Map<string, { key: string; name: string; items: Tarefa[] }>();
                    for (const t of tarefas) {
                      const key = t.lista_id || 'none';
                      const name = (t as any).lista?.nome || 'Sem lista';
                      const g = groups.get(key) || { key, name, items: [] };
                      g.items.push(t);
                      groups.set(key, g);
                    }
                    const ordered = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));

                    return ordered.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden">
                        <div className="px-4 py-6 text-sm text-slate-500 font-bold text-center">Nenhuma tarefa nesta visualização.</div>
                      </div>
                    ) : (
                      ordered.map((g) => (
                        <div key={g.key} className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden mb-4">
                          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-slate-800/60 bg-slate-950/95 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-white font-black truncate">{g.name}</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                                {g.items.length} item{g.items.length === 1 ? '' : 's'}
                              </div>
                            </div>
                            <span className="px-2 py-1 rounded-full text-[10px] font-black border border-slate-800 bg-slate-900/40 text-slate-200">
                              {g.items.length}
                            </span>
                          </div>
                          <div className="p-1 md:p-2">
                            {g.items.map((t) => (
                              <TarefaCard
                                key={t.id}
                                tarefa={t}
                                isSelected={t.id === tarefaSelecionadaId}
                                onSelect={() => openDetails(t)}
                                onToggle={() => handleToggle(t)}
                                onDelete={() => handleDelete(t)}
                                showOriginList
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    );
                  })()}
                </div>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            <div className="h-full overflow-hidden flex flex-col min-h-0">
              <div className="p-6 pb-0 shrink-0">
                <TarefaQuickAdd listKey={listKey} listaAtiva={listaAtiva} onCreated={() => onRefresh()} />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TarefasCardsView
                  tarefas={showMeuDia ? [...tarefasAtrasadas, ...tarefasHoje] : tarefas}
                  tarefaSelecionadaId={tarefaSelecionadaId}
                  onSelect={openDetails}
                  onToggle={handleToggle}
                  groupByList={isSmartView}
                />
              </div>
            </div>
          ) : (
            <div className="h-full overflow-hidden flex flex-col min-h-0">
              <div className="p-6 pb-0 shrink-0">
                <TarefaQuickAdd listKey={listKey} listaAtiva={listaAtiva} onCreated={() => onRefresh()} />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TarefasKanbanView
                  tarefas={showMeuDia ? [...tarefasAtrasadas, ...tarefasHoje] : tarefas}
                  tarefaSelecionadaId={tarefaSelecionadaId}
                  onSelect={openDetails}
                  onMoveStatus={handleMoveStatus}
                  onDelete={handleDelete}
                  columns={kanbanColumns}
                  groupByList={isSmartView}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Quick Add FAB */}
      {isMobile && mode === 'tarefas' && ['lista', 'mes', 'dia', '3dias', 'semana'].includes(viewMode) ? (
        <button
          type="button"
          onClick={() => setMobileQuickAddOpen(true)}
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-violet-600 text-white shadow-2xl shadow-violet-600/40 flex items-center justify-center z-[11000] transition-all active:scale-90 hover:bg-violet-500"
          aria-label="Adicionar tarefa"
        >
          <Plus size={28} />
        </button>
      ) : null}

      {/* Mobile Quick Add (Bottom Sheet) */}
      <Modal
        isOpen={mobileQuickAddOpen}
        onClose={() => setMobileQuickAddOpen(false)}
        title="Nova Tarefa"
        subtitle="Organize o dia sem perder o foco"
        position="bottom"
      >
        <div className="-mx-5 -mt-5">
          <TarefaQuickAdd
            listKey={listKey}
            listaAtiva={listaAtiva}
            defaultDateISO={viewMode === 'calendario' ? selectedDateISO || undefined : undefined}
            onCreated={() => {
              onRefresh();
              setMobileQuickAddOpen(false);
            }}
            startOpen
          />
        </div>
      </Modal>

      {/* Modal: tarefas do dia + criar com data pre-preenchida */}
      <Modal
        isOpen={dayModalOpen && !!selectedDateISO}
        onClose={() => setDayModalOpen(false)}
        title="Tarefas do dia"
        subtitle={selectedDateLabel ? selectedDateLabel : 'Selecione um dia no calendário'}
        className={isMobile ? 'max-w-none' : 'max-w-3xl'}
        position={isMobile ? 'bottom' : 'center'}
      >
        <div className="space-y-4">
          <TarefaQuickAdd
            key={`dayquick:${selectedDateISO || 'none'}`}
            listKey={listKey}
            listaAtiva={listaAtiva}
            onCreated={() => onRefresh()}
            defaultDateISO={selectedDateISO || undefined}
            startOpen
          />

          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/95">
              <div className="text-white font-black">Lançamentos do dia</div>
              <div className="text-xs text-slate-500 font-bold mt-1">Clique em uma tarefa para abrir os detalhes</div>
            </div>
            <div className="p-2">
              {tarefasDoDia.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500 font-bold">Nenhuma tarefa nesse dia.</div>
              ) : (
                tarefasDoDia.map((t) => (
                  <TarefaCard
                    key={t.id}
                    tarefa={t}
                    isSelected={false}
                    onSelect={() => {
                      setDayModalOpen(false);
                      openDetails(t);
                    }}
                    onToggle={() => handleToggle(t)}
                    onDelete={() => handleDelete(t)}
                    showOriginList={isSmartView}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Mobile details modal */}
      <Modal
        isOpen={!!mobileDetailTarefa}
        onClose={() => setMobileDetailTarefa(null)}
        title="Detalhes da Tarefa"
        subtitle="Edite e organize sem perder o contexto"
        position="bottom"
      >
        {mobileDetailTarefa ? (
          <div className="-mx-5 -mt-5 max-h-[78vh] overflow-auto">
            <TarefaDetailPanel
              tarefa={mobileDetailTarefa}
              listas={listasAll}
              onClose={() => setMobileDetailTarefa(null)}
              onSaved={() => onRefresh()}
              onDeleted={() => {
                setMobileDetailTarefa(null);
                onRefresh();
              }}
              compact
            />
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

