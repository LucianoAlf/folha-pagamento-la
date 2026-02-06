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

  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

  /** Clique num badge de tarefa */
  const handleBadgeClick = (e: React.MouseEvent, t: Tarefa) => {
    e.preventDefault();
    e.stopPropagation();

    // Conta vinculada pendente -> abrir modal de pagamento
    if (t.vinculo_tipo === 'conta_pagar' && t.vinculo_id && t.status !== 'concluida') {
      window.dispatchEvent(
        new CustomEvent('agenda:quickpay', {
          detail: { tarefaId: t.id, contaId: t.vinculo_id },
        })
      );
      return;
    }

    // Qualquer outra tarefa -> abrir detalhes
    if (onSelectTarefa) {
      onSelectTarefa(t);
    }
  };

  /** Clique na celula (area vazia ou numero) -> criar tarefa nesse dia */
  const handleCellClick = (iso: string, inMonth: boolean) => {
    if (!inMonth) return;
    onSelectDate(iso);
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

            return (
              <div
                key={iso}
                className={cn(
                  'w-full relative transition-all text-left px-1.5 py-1.5 h-[100px] md:h-[120px] overflow-hidden rounded-[5px] border',
                  inMonth
                    ? 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/80 hover:border-slate-700'
                    : 'border-slate-900/20 bg-slate-950/20 opacity-40 cursor-default',
                  isSelected ? 'z-10 ring-2 ring-violet-500 border-violet-500 bg-violet-500/10' : '',
                  today && inMonth ? 'z-10 border-violet-500/50 bg-violet-500/5' : ''
                )}
                style={{ backgroundColor: bg }}
                onClick={() => handleCellClick(iso, inMonth)}
                role={inMonth ? 'button' : undefined}
                tabIndex={inMonth ? 0 : -1}
                onKeyDown={(e) => {
                  if (!inMonth) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCellClick(iso, inMonth);
                  }
                }}
              >
                <div className="flex flex-col h-full">
                  {/* Numero do dia - clicavel para abrir "Tarefas do dia" */}
                  <button
                    type="button"
                    disabled={!inMonth}
                    onClick={() => handleCellClick(iso, inMonth)}
                    className="flex items-center justify-between mb-1 px-1 w-full text-left hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={cn(
                        'text-[11px] md:text-xs font-black',
                        today && inMonth ? 'text-violet-400' : inMonth ? 'text-slate-200' : 'text-slate-600'
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                    {row && row.total > 0 && (
                      <span className="text-[9px] font-black text-slate-500">{row.total}</span>
                    )}
                  </button>

                  {/* Badges de tarefas - cada um clicavel individualmente */}
                  {inMonth && items.length > 0 ? (
                    <div className="space-y-0.5 flex-1 min-h-0">
                      {items.slice(0, isMobileView ? 2 : 4).map((t) => {
                        const isConta = t.vinculo_tipo === 'conta_pagar';
                        const isContaPendente = isConta && t.status !== 'concluida';
                        const Icon = categoriaIcon(t.categoria);
                        return (
                          <Tooltip
                            key={t.id}
                            content={
                              <div className="max-w-[200px]">
                                <div className="font-bold text-xs">{t.titulo}</div>
                                {t.descricao && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{t.descricao.split('\n')[0]}</div>
                                )}
                                {isContaPendente && (
                                  <div className="text-[10px] text-emerald-300 font-bold mt-1">Clique para registrar pagamento</div>
                                )}
                                {!isConta && (
                                  <div className="text-[10px] text-slate-400 mt-1">Clique para ver detalhes</div>
                                )}
                              </div>
                            }
                            side="top"
                          >
                            <button
                              type="button"
                              onClick={(e) => handleBadgeClick(e, t)}
                              className={cn(
                                'w-full px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold leading-tight shadow-sm rounded-[4px] flex items-center gap-1 cursor-pointer transition-all hover:brightness-125 hover:scale-[1.03] active:scale-95',
                                isContaPendente
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
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
                          onClick={() => handleCellClick(iso, inMonth)}
                          className="text-[9px] font-black text-slate-500 px-1 pt-0.5 hover:text-slate-300 transition-colors"
                        >
                          + {items.length - (isMobileView ? 2 : 4)} mais
                        </button>
                      ) : null}
                    </div>
                  ) : inMonth ? (
                    /* Area vazia clicavel para criar tarefa */
                    <button
                      type="button"
                      onClick={() => handleCellClick(iso, inMonth)}
                      className="flex-1 w-full"
                      aria-label={`Criar tarefa em ${iso}`}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
