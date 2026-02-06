import React, { useMemo, useState } from 'react';
import { addDays, format, isSameMonth, startOfMonth, startOfWeek, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Tarefa } from '../../types/agenda';
import { PRIORIDADES } from '../../types/agenda';
import { prioridadeIcon, categoriaIcon } from './agendaIcons';

const toISODate = (d: Date) => d.toISOString().split('T')[0];

const getPriorityKey = (p: Tarefa['prioridade']) => {
  if (p === 'urgente') return 'urgente';
  if (p === 'alta') return 'alta';
  if (p === 'media') return 'media';
  return 'baixa';
};

export const CalendarioView: React.FC<{
  tarefas: Tarefa[];
  selectedDateISO: string | null;
  onSelectDate: (iso: string) => void;
  onSelectTarefa?: (tarefa: Tarefa) => void;
}> = ({ tarefas, selectedDateISO, onSelectDate, onSelectTarefa }) => {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  const statsByDay = useMemo(() => {
    const map = new Map<string, { urgente: number; alta: number; media: number; baixa: number; total: number; items: Tarefa[] }>();
    for (const t of tarefas) {
      if (!t.vencimento_em) continue;
      if (t.status === 'cancelada') continue;
      const iso = toISODate(new Date(t.vencimento_em));
      const row = map.get(iso) || { urgente: 0, alta: 0, media: 0, baixa: 0, total: 0, items: [] };
      row[getPriorityKey(t.prioridade)] += 1;
      row.total += 1;
      row.items.push(t);
      map.set(iso, row);
    }
    map.forEach((r) => r.items.sort((a, b) => (a.vencimento_em || '').localeCompare(b.vencimento_em || '')));
    return map;
  }, [tarefas]);

  const maxTotal = useMemo(() => {
    let m = 0;
    statsByDay.forEach((v) => {
      if (v.total > m) m = v.total;
    });
    return m;
  }, [statsByDay]);

  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

  /** Clique num badge de tarefa dentro da celula do calendario */
  const handleBadgeClick = (e: React.MouseEvent, t: Tarefa) => {
    e.stopPropagation(); // nao propaga para o onClick da celula (que abre "criar tarefa")

    // Se eh conta vinculada -> abrir modal de pagamento
    if (t.vinculo_tipo === 'conta_pagar' && t.vinculo_id && t.status !== 'concluida') {
      window.dispatchEvent(
        new CustomEvent('agenda:quickpay', {
          detail: { tarefaId: t.id, contaId: t.vinculo_id },
        })
      );
      return;
    }

    // Caso contrario -> abrir detalhes da tarefa
    if (onSelectTarefa) {
      onSelectTarefa(t);
    }
  };

  const dayTooltip = (iso: string) => {
    const row = statsByDay.get(iso);
    if (!row) return null;
    const parts: Array<{ key: keyof typeof PRIORIDADES; label: string; n: number }> = [
      { key: 'urgente', label: 'Urgente', n: row.urgente },
      { key: 'alta', label: 'Alta', n: row.alta },
      { key: 'media', label: 'Média', n: row.media },
      { key: 'baixa', label: 'Baixa', n: row.baixa },
    ];
    const filtered = parts.filter((p) => p.n > 0);
    return (
      <div className="min-w-[260px] max-w-[340px]">
        <div className="text-[11px] font-black text-white mb-2">
          {iso} • {row.total} tarefa{row.total === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {filtered.map((p) => (
            <span
              key={p.key}
              className={cn('px-2 py-0.5 rounded-full border border-slate-800 text-[10px] font-black', PRIORIDADES[p.key].bg, PRIORIDADES[p.key].text)}
            >
              <span className="inline-flex items-center gap-1">
                {(() => {
                  const Icon = prioridadeIcon(p.key as any);
                  return <Icon className="w-3.5 h-3.5" />;
                })()}
                {p.label} ({p.n})
              </span>
            </span>
          ))}
        </div>
        <div className={cn('space-y-1.5', row.items.length > 5 && 'max-h-[220px] overflow-auto pr-1')}>
          {row.items.slice(0, 8).map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-200 font-bold truncate">{t.titulo}</div>
                <div className="text-[10px] text-slate-500 font-bold truncate">
                  {t.vinculo_tipo === 'conta_pagar' ? 'Conta a Pagar' : t.categoria}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-black whitespace-nowrap">
                {t.vencimento_em ? new Date(t.vencimento_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          ))}
          {row.items.length > 8 ? (
            <div className="text-[10px] text-slate-400 font-black pt-1">+ {row.items.length - 8} outra(s)…</div>
          ) : null}
        </div>
      </div>
    );
  };

  // Cores por prioridade
  const getPrioColors = (p: Tarefa['prioridade']) => {
    if (p === 'urgente') return 'bg-rose-600 text-white';
    if (p === 'alta') return 'bg-amber-500 text-slate-950';
    if (p === 'media') return 'bg-blue-600 text-white';
    return 'bg-slate-600 text-white';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between p-2 bg-slate-900/40 backdrop-blur-xl rounded-3xl border border-slate-800/60 shadow-xl">
        <button
          type="button"
          onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 text-slate-300 flex items-center justify-center transition-all active:scale-90"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-white font-black uppercase tracking-[0.2em] text-xs md:text-sm">
          {format(monthStart, "MMMM 'de' yyyy", { locale: ptBR })}
        </div>
        <button
          type="button"
          onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 text-slate-300 flex items-center justify-center transition-all active:scale-90"
          aria-label="Proximo mes"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/95 p-2 md:p-4">
        <div className="grid grid-cols-7 gap-[4.8px] mb-1">
          {weekDays.map((w) => (
            <div key={w} className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-1 text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[4.8px]">
          {days.map((d) => {
            const iso = toISODate(d);
            const inMonth = isSameMonth(d, monthStart);
            const row = statsByDay.get(iso);
            const isSelected = selectedDateISO === iso;
            const today = isToday(d);
            const items = row?.items || [];
            const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;

            const intensity = row && maxTotal > 0 ? Math.min(1, row.total / maxTotal) : 0;
            const bg = row && row.total > 0 ? `rgba(139,92,246,${0.08 + intensity * 0.22})` : 'transparent';

            const cell = (
              <div
                className={cn(
                  'w-full relative transition-all text-left px-1.5 py-1.5 h-[100px] md:h-[120px] overflow-hidden rounded-[5px] border',
                  inMonth
                    ? 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/80 hover:border-slate-700'
                    : 'border-slate-900/20 bg-slate-950/20 opacity-40 cursor-default',
                  isSelected ? 'z-10 ring-2 ring-violet-500 border-violet-500 bg-violet-500/10' : '',
                  today && inMonth ? 'z-10 border-violet-500/50 bg-violet-500/5' : ''
                )}
                style={{ backgroundColor: bg }}
              >
                <div className="flex flex-col h-full">
                  {/* Numero do dia - clicar aqui abre "Tarefas do dia" (criar) */}
                  <button
                    type="button"
                    disabled={!inMonth}
                    onClick={() => {
                      if (!inMonth) return;
                      onSelectDate(iso);
                    }}
                    className="flex items-center justify-between mb-1 px-1 w-full text-left"
                  >
                    <div
                      className={cn(
                        'text-[11px] md:text-xs font-black',
                        today && inMonth ? 'text-violet-400' : inMonth ? 'text-slate-200' : 'text-slate-600'
                      )}
                    >
                      {format(d, 'd')}
                    </div>
                  </button>

                  {/* Badges de tarefas - cada um eh clicavel individualmente */}
                  {inMonth && items.length > 0 ? (
                    <div className="space-y-0.5 flex-1 min-h-0">
                      {items.slice(0, isMobileView ? 2 : 4).map((t) => {
                        const isConta = t.vinculo_tipo === 'conta_pagar';
                        const Icon = categoriaIcon(t.categoria);
                        return (
                          <Tooltip
                            key={t.id}
                            content={
                              <div>
                                <div className="font-bold text-xs">{t.titulo}</div>
                                {isConta && t.status !== 'concluida' && (
                                  <div className="text-[10px] text-emerald-300 mt-0.5">Clique para pagar</div>
                                )}
                              </div>
                            }
                            side="top"
                          >
                            <button
                              type="button"
                              onClick={(e) => handleBadgeClick(e, t)}
                              className={cn(
                                'w-full px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold leading-tight shadow-sm !rounded-[5px] flex items-center gap-1 cursor-pointer transition-all hover:brightness-110 hover:scale-[1.02]',
                                isConta && t.status !== 'concluida'
                                  ? 'bg-emerald-600 text-white'
                                  : getPrioColors(t.prioridade)
                              )}
                            >
                              {isConta ? (
                                <DollarSign className="w-3 h-3 shrink-0" />
                              ) : (
                                <Icon className="w-3 h-3 opacity-95 shrink-0" />
                              )}
                              <span className="truncate">{t.titulo}</span>
                            </button>
                          </Tooltip>
                        );
                      })}
                      {items.length > (isMobileView ? 2 : 4) ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (inMonth) onSelectDate(iso);
                          }}
                          className="text-[9px] font-black text-slate-500 px-1 pt-0.5 hover:text-slate-300 transition-colors"
                        >
                          + {items.length - (isMobileView ? 2 : 4)} mais
                        </button>
                      ) : null}
                    </div>
                  ) : inMonth ? (
                    // Area vazia clicavel para criar tarefa
                    <button
                      type="button"
                      onClick={() => onSelectDate(iso)}
                      className="flex-1 w-full"
                      aria-label={`Criar tarefa em ${iso}`}
                    />
                  ) : null}
                </div>
              </div>
            );

            const tip = row && row.total > 0 ? dayTooltip(iso) : null;

            return tip ? (
              <Tooltip
                key={iso}
                content={tip}
                className="p-3 rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl"
                side="top"
              >
                {cell}
              </Tooltip>
            ) : (
              <div key={iso} className="w-full">
                {cell}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
