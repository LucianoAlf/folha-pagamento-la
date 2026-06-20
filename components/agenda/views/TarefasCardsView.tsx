import React, { useMemo } from 'react';
import { Building2, Calendar, Check, Layers } from 'lucide-react';
import { Tooltip } from '../../UI';
import { cn } from '../../CollaboratorComponents';
import type { Tarefa } from '../../../types/agenda';
import { CATEGORIAS, PRIORIDADES, STATUS_TAREFA } from '../../../types/agenda';
import { categoriaIcon, prioridadeIcon } from '../agendaIcons';

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

export const TarefasCardsView: React.FC<{
  tarefas: Tarefa[];
  tarefaSelecionadaId: string | null;
  onSelect: (t: Tarefa) => void;
  onToggle: (t: Tarefa) => void;
  groupByList?: boolean;
}> = ({ tarefas, tarefaSelecionadaId, onSelect, onToggle, groupByList = false }) => {
  const rows = useMemo(() => {
    // cards: mantém a ordem padrão do serviço (ordem + vencimento_em), mas remove canceladas por segurança
    return (tarefas || []).filter((t) => t.status !== 'cancelada');
  }, [tarefas]);

  const grouped = useMemo(() => {
    if (!groupByList) return null;
    const map = new Map<string, { key: string; name: string; items: Tarefa[] }>();
    for (const t of rows) {
      const key = t.lista_id || 'none';
      const name = (t as any).lista?.nome || 'Sem lista';
      const g = map.get(key) || { key, name, items: [] };
      g.items.push(t);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [groupByList, rows]);

  if (!rows.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface/40 border border-base flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-muted" />
          </div>
          <div className="text-sm font-bold">Nenhuma tarefa para exibir</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {grouped ? (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.key} className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-primary font-black truncate">{g.name}</div>
                    <div className="text-[10px] text-muted font-bold uppercase tracking-[0.2em]">
                      {g.items.length} item{g.items.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {g.items.map((t) => {
                    const prioridade = PRIORIDADES[t.prioridade] || PRIORIDADES.media;
                    const categoria = CATEGORIAS[t.categoria] || CATEGORIAS.geral;
                    const selected = t.id === tarefaSelecionadaId;
                    const PrioridadeIcon = prioridadeIcon(t.prioridade);
                    const CategoriaIcon = categoriaIcon(t.categoria);

                    const progressTotal = t.subtarefas?.length || 0;
                    const progressDone = (t.subtarefas || []).filter((s) => s.concluida).length;
                    const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSelect(t);
                        }}
                        className={cn(
                          'group relative rounded-2xl border transition-all cursor-pointer select-none overflow-hidden',
                          'bg-bg/95 hover:bg-surface/95 hover:border-strong/60',
                          selected
                            ? 'border-accent/35 shadow-lg shadow-accent/5 ring-1 ring-accent/20'
                            : 'border-base/60',
                          t.status === 'concluida' ? 'opacity-70' : ''
                        )}
                      >
                        {/* barra de prioridade */}
                        <div className="h-1 w-full" style={{ backgroundColor: prioridade.cor }} />

                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <span className={cn('px-2 py-0.5 rounded-full border', prioridade.bg, prioridade.text, 'border-base')}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <PrioridadeIcon className="w-3.5 h-3.5" />
                                    {prioridade.label}
                                  </span>
                                </span>
                                <span className={cn('px-2 py-0.5 rounded-full border', categoria.bg, categoria.text, 'border-base')}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <CategoriaIcon className="w-3.5 h-3.5" />
                                    {categoria.label}
                                  </span>
                                </span>
                                {t.status === 'concluida' ? (
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded-full border border-base',
                                      STATUS_TAREFA.concluida.bg,
                                      STATUS_TAREFA.concluida.text
                                    )}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <Check className="w-3.5 h-3.5" />
                                      {STATUS_TAREFA.concluida.label}
                                    </span>
                                  </span>
                                ) : null}
                              </div>

                              <div
                                className={cn(
                                  'mt-2 text-primary font-black leading-snug line-clamp-2',
                                  t.status === 'concluida' ? 'line-through text-muted' : ''
                                )}
                              >
                                {t.titulo}
                              </div>

                              {t.descricao ? <div className="mt-1 text-xs text-muted font-bold line-clamp-2">{t.descricao}</div> : null}
                            </div>

                            <Tooltip content={t.status === 'concluida' ? 'Reabrir' : 'Concluir'} side="left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggle(t);
                                }}
                                className={cn(
                                  'w-9 h-9 rounded-2xl border flex items-center justify-center transition-all shrink-0',
                                  t.status === 'concluida'
                                    ? 'bg-success/15 border-success/25 text-success-subtle'
                                    : 'bg-surface/30 border-base text-muted hover:text-primary hover:bg-surface/50 hover:border-accent/25'
                                )}
                                aria-label={t.status === 'concluida' ? 'Reabrir tarefa' : 'Concluir tarefa'}
                              >
                                {t.status === 'concluida' ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current opacity-60" />}
                              </button>
                            </Tooltip>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
                            {t.unidade ? (
                              <span className="px-2 py-0.5 rounded-full border border-base bg-surface/40 text-secondary">
                                <span className="inline-flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5" />
                                  {t.unidade.toUpperCase()}
                                </span>
                              </span>
                            ) : null}
                            {t.vencimento_em ? (
                              <span className="px-2 py-0.5 rounded-full border border-base bg-surface/40 text-secondary">
                                <span className="inline-flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {formatWhen(t.vencimento_em)}
                                </span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full border border-base bg-surface/20 text-muted">Sem data</span>
                            )}
                          </div>

                          {progressTotal > 0 ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                                <span>Subtarefas</span>
                                <span>
                                  {progressDone}/{progressTotal}
                                </span>
                              </div>
                              <div className="mt-2 h-2 rounded-full bg-surface/60 overflow-hidden border border-base/60">
                                <div className="h-full rounded-full bg-accent/70" style={{ width: `${progressPct}%` }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rows.map((t) => {
            const prioridade = PRIORIDADES[t.prioridade] || PRIORIDADES.media;
            const categoria = CATEGORIAS[t.categoria] || CATEGORIAS.geral;
            const selected = t.id === tarefaSelecionadaId;
            const PrioridadeIcon = prioridadeIcon(t.prioridade);
            const CategoriaIcon = categoriaIcon(t.categoria);

            const progressTotal = t.subtarefas?.length || 0;
            const progressDone = (t.subtarefas || []).filter((s) => s.concluida).length;
            const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect(t);
                }}
                className={cn(
                  'group relative rounded-2xl border transition-all cursor-pointer select-none overflow-hidden',
                  'bg-bg/95 hover:bg-surface/95 hover:border-strong/60',
                  selected ? 'border-accent/35 shadow-lg shadow-accent/5 ring-1 ring-accent/20' : 'border-base/60',
                  t.status === 'concluida' ? 'opacity-70' : ''
                )}
              >
                {/* barra de prioridade */}
                <div className="h-1 w-full" style={{ backgroundColor: prioridade.cor }} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className={cn('px-2 py-0.5 rounded-full border', prioridade.bg, prioridade.text, 'border-base')}>
                          <span className="inline-flex items-center gap-1.5">
                            <PrioridadeIcon className="w-3.5 h-3.5" />
                            {prioridade.label}
                          </span>
                        </span>
                        <span className={cn('px-2 py-0.5 rounded-full border', categoria.bg, categoria.text, 'border-base')}>
                          <span className="inline-flex items-center gap-1.5">
                            <CategoriaIcon className="w-3.5 h-3.5" />
                            {categoria.label}
                          </span>
                        </span>
                        {t.status === 'concluida' ? (
                          <span className={cn('px-2 py-0.5 rounded-full border border-base', STATUS_TAREFA.concluida.bg, STATUS_TAREFA.concluida.text)}>
                            <span className="inline-flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              {STATUS_TAREFA.concluida.label}
                            </span>
                          </span>
                        ) : null}
                      </div>

                      <div className={cn('mt-2 text-primary font-black leading-snug line-clamp-2', t.status === 'concluida' ? 'line-through text-muted' : '')}>
                        {t.titulo}
                      </div>

                      {t.descricao ? (
                        <div className="mt-1 text-xs text-muted font-bold line-clamp-2">{t.descricao}</div>
                      ) : null}
                    </div>

                    <Tooltip content={t.status === 'concluida' ? 'Reabrir' : 'Concluir'} side="left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(t);
                        }}
                        className={cn(
                          'w-9 h-9 rounded-2xl border flex items-center justify-center transition-all shrink-0',
                          t.status === 'concluida'
                            ? 'bg-success/15 border-success/25 text-success-subtle'
                            : 'bg-surface/30 border-base text-muted hover:text-primary hover:bg-surface/50 hover:border-accent/25'
                        )}
                        aria-label={t.status === 'concluida' ? 'Reabrir tarefa' : 'Concluir tarefa'}
                      >
                        {t.status === 'concluida' ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current opacity-60" />}
                      </button>
                    </Tooltip>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
                    {t.unidade ? (
                      <span className="px-2 py-0.5 rounded-full border border-base bg-surface/40 text-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" />
                          {t.unidade.toUpperCase()}
                        </span>
                      </span>
                    ) : null}
                    {t.vencimento_em ? (
                      <span className="px-2 py-0.5 rounded-full border border-base bg-surface/40 text-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatWhen(t.vencimento_em)}
                        </span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full border border-base bg-surface/20 text-muted">
                        Sem data
                      </span>
                    )}
                  </div>

                  {progressTotal > 0 ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                        <span>Subtarefas</span>
                        <span>
                          {progressDone}/{progressTotal}
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-surface/60 overflow-hidden border border-base/60">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
};

