import React, { useMemo, useState } from 'react';
import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Tarefa } from '../../types/agenda';
import { PRIORIDADES } from '../../types/agenda';
import { prioridadeIcon } from './agendaIcons';

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
}> = ({ tarefas, selectedDateISO, onSelectDate }) => {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart]);
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

  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

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
                <div className="text-[10px] text-slate-500 font-bold truncate">{t.categoria}</div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-1 bg-slate-950/85 rounded-[2rem] border border-slate-800/60">
        <button
          type="button"
          onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="w-10 h-10 rounded-full border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 text-slate-300 flex items-center justify-center transition-all"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-white font-black uppercase tracking-widest text-sm">
          {format(monthStart, "MMMM 'de' yyyy", { locale: ptBR })}
        </div>
        <button
          type="button"
          onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="w-10 h-10 rounded-full border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 text-slate-300 flex items-center justify-center transition-all"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/95 p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map((w) => (
            <div key={w} className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const iso = toISODate(d);
            const inMonth = isSameMonth(d, monthStart);
            const row = statsByDay.get(iso);
            const isSelected = selectedDateISO === iso;

            // Heatmap violeta (volume do dia). As bolinhas indicam prioridade.
            const intensity = row && maxTotal > 0 ? Math.min(1, row.total / maxTotal) : 0;
            const bg = row && row.total > 0 ? `rgba(139,92,246,${0.08 + intensity * 0.22})` : 'transparent';

            const btn = (
              <button
                type="button"
                disabled={!inMonth}
                onClick={() => {
                  if (!inMonth) return;
                  onSelectDate(iso);
                }}
                className={cn(
                  'w-full relative rounded-2xl border transition-all text-left p-3 h-[92px] overflow-hidden',
                  inMonth ? 'border-slate-800 bg-slate-900/10 hover:bg-slate-900/25' : 'border-slate-900/10 bg-slate-950/10 opacity-40 cursor-default',
                  isSelected ? 'ring-2 ring-violet-500/60 border-violet-500/40 bg-violet-500/10' : ''
                )}
                style={{ backgroundColor: bg }}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('text-xs font-black', inMonth ? 'text-slate-200' : 'text-slate-600')}>
                    {format(d, 'd')}
                  </div>
                  {row && row.total > 0 ? (
                    <div className="flex items-center gap-1">
                      {row.urgente > 0 ? <div className="w-2 h-2 rounded-full bg-rose-500" /> : null}
                      {row.alta > 0 ? <div className="w-2 h-2 rounded-full bg-amber-400" /> : null}
                      {row.media > 0 ? <div className="w-2 h-2 rounded-full bg-blue-400" /> : null}
                      {row.baixa > 0 ? <div className="w-2 h-2 rounded-full bg-slate-400" /> : null}
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
                {row && row.total > 0 ? (
                  <div className="mt-2 text-[10px] text-slate-400 font-black">
                    {row.total} tarefa{row.total === 1 ? '' : 's'}
                  </div>
                ) : null}
              </button>
            );

            const tip = row && row.total > 0 ? dayTooltip(iso) : null;

            return tip ? (
              <Tooltip
                key={iso}
                content={tip}
                className="p-3 rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl"
                side="top"
              >
                {btn}
              </Tooltip>
            ) : (
              <div key={iso} className="w-full">
                {btn}
              </div>
            );
          })}
        </div>
      </div>

      {/* A lista do dia e criação rápida ficam no modal "Tarefas do dia" (AgendaContent) */}
    </div>
  );
};

